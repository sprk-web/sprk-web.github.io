import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../js/config.js";
import { confirmDialog, promptDialog } from "../js/dialogs.js";

const app = document.querySelector("#community-app");
const clientUrl = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]));
const shortId = (id) => id ? `${id.slice(0, 8)}…${id.slice(-4)}` : "Member";
const initialFor = (name) => String(name || "C").trim().slice(0, 1).toUpperCase();
const validUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

let db;
let currentUser = null;
let profile = null;
let isAdmin = false;
let groups = [];
let memberships = new Map();
let activeGroupId = null;
let messages = [];
let searchQuery = "";
let messageQuery = "";
let realtimeChannel = null;
let typingTimer = null;
const missingAttachmentNoticeGroups = new Set();

function showNotice(message, kind = "success") {
  const notice = app.querySelector("#community-notice");
  if (!notice) return;
  notice.textContent = message;
  notice.dataset.kind = kind;
  notice.hidden = false;
  if (kind !== "error") {
    window.clearTimeout(showNotice.timer);
    showNotice.timer = window.setTimeout(() => { notice.hidden = true; }, 5000);
  }
}

function activeGroup() {
  return groups.find((group) => group.id === activeGroupId) || null;
}

function isMember(groupId) {
  return memberships.has(groupId) && memberships.get(groupId).status === "active";
}

function memberRole(groupId) {
  return memberships.get(groupId)?.role || null;
}

function isGroupAdmin(groupId) {
  return ["owner", "admin"].includes(memberRole(groupId));
}

function isPremium() {
  return Boolean(profile?.is_premium && (!profile.premium_until || new Date(profile.premium_until) > new Date()));
}

function groupAvatar(group, sizeClass = "") {
  const avatar = group.icon_url
    ? `<img src="${escapeHtml(group.icon_url)}" alt="">`
    : `<span aria-hidden="true">${escapeHtml(initialFor(group.name))}</span>`;
  return `<span class="community-avatar ${sizeClass}">${avatar}</span>`;
}

function groupSubtitle(group) {
  const labels = [];
  labels.push(group.is_permanent ? "Permanent community" : group.privacy === "public" ? "Public community" : "Invite-only");
  if (memberships.get(group.id)?.status === "banned") labels.push("Banned");
  else if (isMember(group.id)) labels.push(memberRole(group.id) === "owner" ? "Creator" : memberRole(group.id) === "admin" ? "Admin" : "Joined");
  return labels.join(" · ");
}

function groupListMarkup() {
  const visible = groups.filter((group) => {
    const matchesText = `${group.name} ${group.description}`.toLowerCase().includes(searchQuery.toLowerCase());
    const isDiscoverable = memberships.get(group.id)?.status !== "banned"
      && (group.privacy === "public" || isAdmin);
    return matchesText && (isMember(group.id) || isDiscoverable);
  });
  if (!visible.length) {
    return `<p class="community-list-empty">No communities match that search yet.</p>`;
  }
  return visible.map((group) => `<button class="community-group-row" type="button" data-group="${escapeHtml(group.id)}" aria-current="${group.id === activeGroupId}">
    ${groupAvatar(group)}
    <span class="community-group-copy"><strong>${escapeHtml(group.name)}</strong><small>${escapeHtml(groupSubtitle(group))}</small></span>
    ${group.is_permanent ? '<span class="community-badge permanent" title="Automatically joined for every account"><i data-lucide="pin" class="h-3 w-3"></i></span>' : ""}
  </button>`).join("");
}

function renderDirectory() {
  const list = app.querySelector("#community-group-list");
  if (!list) return;
  list.innerHTML = groupListMarkup();
  window.lucide?.createIcons();
}

function renderMessage(message) {
  const attachments = (message.attachments || []).map(renderMessageAttachment).join("");
  const canDeleteMessages = isAdmin || isGroupAdmin(activeGroupId);
  const author = message.sender_id === currentUser.id
    ? "You"
    : message.sender_name || `Member ${shortId(message.sender_id)}`;
  const replies = messages.filter((row) => row.parent_message_id === message.id);
  const replyMarkup = replies.map((reply) => `<article class="community-forum-reply" data-message="${escapeHtml(reply.id)}">
      <div class="community-forum-meta"><strong>${reply.sender_id === currentUser.id ? "You" : escapeHtml(reply.sender_name || `Member ${shortId(reply.sender_id)}`)}</strong><time datetime="${escapeHtml(reply.created_at)}">${escapeHtml(whenLabel(reply.created_at))}</time></div>
      <p>${escapeHtml(reply.body)}</p>${(reply.attachments || []).map((attachment) => renderMessageAttachment(attachment)).join("")}
      <div class="community-forum-topic-tools">${isMember(activeGroupId) ? `<button class="community-forum-report" type="button" data-action="report-message" data-message-id="${escapeHtml(reply.id)}">Report</button>` : ""}${canDeleteMessages ? `<button class="community-forum-report" type="button" data-action="delete-message" data-message-id="${escapeHtml(reply.id)}">Delete</button>` : ""}</div>
    </article>`).join("");
  return `<article class="community-forum-topic" data-message="${escapeHtml(message.id)}">
    <div class="community-forum-meta"><strong>${escapeHtml(author)}</strong><time datetime="${escapeHtml(message.created_at)}">${escapeHtml(whenLabel(message.created_at))}</time></div>
    <h3>${escapeHtml(message.topic_title || "Study discussion")}</h3>
    ${message.body ? `<p class="community-forum-body">${escapeHtml(message.body)}</p>` : ""}${attachments}
    <div class="community-forum-topic-tools"><span>${replies.length} ${replies.length === 1 ? "reply" : "replies"}</span>${isMember(activeGroupId) ? `<button class="community-forum-report" type="button" data-action="report-message" data-message-id="${escapeHtml(message.id)}">Report</button><button class="community-forum-reply-toggle" type="button" data-action="toggle-reply" data-message-id="${escapeHtml(message.id)}">Reply</button>` : ""}${canDeleteMessages ? `<button class="community-forum-report" type="button" data-action="delete-message" data-message-id="${escapeHtml(message.id)}">Delete</button>` : ""}</div>
    <div class="community-forum-replies">${replyMarkup}</div>
    ${isMember(activeGroupId) ? `<form class="community-forum-reply-form" data-reply-form="${escapeHtml(message.id)}" hidden><label class="sr-only" for="reply-${escapeHtml(message.id)}">Reply to topic</label><textarea id="reply-${escapeHtml(message.id)}" name="body" maxlength="4000" rows="2" placeholder="Add a helpful reply…"></textarea><label class="community-forum-attach"><i data-lucide="paperclip" class="h-4 w-4"></i><span>Attach media or a file</span><input type="file" name="attachments" accept="image/*,video/*,audio/*,application/pdf" multiple></label><button class="community-button primary subtle" type="submit">Post reply</button></form>` : ""}
  </article>`;
}

function whenLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function renderMessageAttachment(attachment) {
  const url = escapeHtml(attachment.url || "#");
  const name = escapeHtml(attachment.file_name || "Attachment");
  const mime = String(attachment.mime_type || "").toLowerCase();
  if (mime.startsWith("image/")) return `<button class="community-media-link" type="button" data-action="view-image" data-image-url="${url}" data-image-name="${name}" aria-label="View image: ${name}"><img class="community-media-image" src="${url}" alt="${name}" loading="lazy"></button>`;
  if (mime.startsWith("video/")) return `<video class="community-media-video" controls preload="metadata" src="${url}">${name}</video>`;
  if (mime.startsWith("audio/")) return `<audio class="community-media-audio" controls preload="metadata" src="${url}">${name}</audio>`;
  return `<a class="community-attachment-link" href="${url}" target="_blank" rel="noopener noreferrer"><i data-lucide="paperclip" class="h-4 w-4"></i>${name} · ${escapeHtml(formatBytes(attachment.byte_size || 0))}</a>`;
}

function renderMessages(scroll = false) {
  const container = app.querySelector("#community-messages");
  if (!container) return;
  const normalized = messageQuery.trim().toLowerCase();
  const roots = messages.filter((message) => !message.parent_message_id);
  const visible = normalized
    ? roots.filter((message) => `${message.topic_title} ${message.body} ${message.sender_id}`.toLowerCase().includes(normalized)
      || messages.some((reply) => reply.parent_message_id === message.id && `${reply.body} ${reply.sender_id}`.toLowerCase().includes(normalized)))
    : roots;
  container.innerHTML = visible.length
    ? visible.map(renderMessage).join("")
    : `<div class="community-empty-chat"><i data-lucide="${normalized ? "search-x" : "messages-square"}" class="h-8 w-8"></i><h2>${normalized ? "No matching topics" : "Start a study discussion"}</h2><p>${normalized ? "Try another search." : "Ask a question, share a solution, or explain a concept for other learners."}</p></div>`;
  window.lucide?.createIcons();
  if (scroll) container.scrollTop = container.scrollHeight;
}

function chatMarkup(group) {
  if (!group) {
    return `<section class="community-empty-chat"><i data-lucide="users-round" class="h-10 w-10"></i><h2>Find a study forum</h2><p>Choose one of your communities or explore the public directory to join a discussion.</p></section>`;
  }
  const joined = isMember(group.id);
  return `<header class="community-chat-header">
    <div class="community-chat-title">${groupAvatar(group)}<span><h2>${escapeHtml(group.name)}</h2></span></div>
    <div class="community-chat-tools">
      ${!joined && !memberships.has(group.id) && group.privacy === "public" ? '<button class="community-button primary subtle" type="button" data-action="join-group"><i data-lucide="plus" class="h-4 w-4"></i><span>Join</span></button>' : ""}
      ${memberships.get(group.id)?.status === "banned" ? '<span class="community-badge">Banned</span>' : ""}
      <button class="community-icon-button" type="button" data-action="search-messages" title="Search topics" aria-label="Search topics"><i data-lucide="search" class="h-5 w-5"></i></button>
      ${joined ? '<button class="community-icon-button" type="button" data-action="report-group" title="Report community" aria-label="Report community"><i data-lucide="flag" class="h-5 w-5"></i></button>' : ""}
    </div>
  </header>
  <input id="community-message-search" class="community-message-search" type="search" aria-label="Search study topics" placeholder="Search topics and replies…" ${messageQuery ? "" : "hidden"} value="${escapeHtml(messageQuery)}">
  <div id="community-messages" class="community-forum-list" aria-live="polite"></div>
  ${joined ? `<form id="community-compose" class="community-forum-compose">
      <h3>Start a study topic</h3>
      <label class="sr-only" for="community-topic-title">Topic title</label><input id="community-topic-title" name="topic_title" maxlength="160" required placeholder="What are you studying or asking?">
      <label class="sr-only" for="community-topic-body">Topic details</label><textarea id="community-topic-body" name="body" rows="3" maxlength="4000" placeholder="Add context, your approach, or what you have tried…"></textarea>
      <div class="community-forum-compose-actions"><label class="community-forum-attach"><i data-lucide="paperclip" class="h-4 w-4"></i><span>Attach media or a file</span><input type="file" name="attachments" accept="image/*,video/*,audio/*,application/pdf" multiple></label><button class="community-button primary" type="submit">Post topic</button></div>
    </form>` : `<div class="community-forum-join-note">Join this public community to ask questions and reply to topics.</div>`}`;
}

function render() {
  if (!currentUser) {
    app.innerHTML = `<section class="community-page"><div class="community-signin"><i data-lucide="users-round" class="h-10 w-10"></i><h1>Join the study forum</h1><p>Sign in to explore public study communities, ask questions, and share what you know.</p><a class="community-button primary" href="../account/?return=${encodeURIComponent("/community/")}">Sign in to continue</a></div></section>`;
    const signInLink = app.querySelector(".community-signin a");
    signInLink.href = `../account/?return=${encodeURIComponent(`${location.pathname}${location.search}${location.hash}`)}`;
    window.lucide?.createIcons();
    return;
  }
  const group = activeGroup();
  app.innerHTML = `<div class="community-page">
    ${isAdmin ? `<div class="community-topbar"><div class="community-actions">
        <a class="community-button" href="../admin/communities/"><i data-lucide="settings-2" class="h-4 w-4"></i> Manage communities</a>
        <button id="community-moderation" class="community-button" type="button"><i data-lucide="shield-check" class="h-4 w-4"></i> Forum reports</button>
      </div></div>` : ""}
    <div id="community-notice" class="community-notice" role="status" hidden></div>
    <div class="community-layout">
      <aside class="community-directory" aria-label="Your communities">
        <div class="community-directory-head"><h2>Public study forums</h2><input id="community-search" class="community-search" type="search" placeholder="Search communities…" aria-label="Search communities"></div>
        <div id="community-group-list" class="community-group-list"></div>
      </aside>
      <section id="community-chat" class="community-chat" aria-label="Community study forum">${chatMarkup(group)}</section>
    </div>
  </div>
  <dialog id="community-settings-dialog" class="community-modal"><div class="community-modal-content" id="community-settings-content"></div></dialog>
  <dialog id="community-invite-dialog" class="community-modal"><div class="community-modal-content" id="community-invite-content"></div></dialog>
  <dialog id="community-reports-dialog" class="community-modal community-reports-modal"><div class="community-modal-content" id="community-reports-content"></div></dialog>
  <dialog id="community-image-dialog" class="community-modal community-image-dialog" aria-label="Image preview">
    <figure><button class="community-image-close" type="button" aria-label="Close image preview">Close</button><img id="community-image-preview" alt=""><figcaption id="community-image-caption"></figcaption></figure>
  </dialog>`;
  renderDirectory();
  renderMessages();
  bindPageEvents();
  window.lucide?.createIcons();
}

function bindPageEvents() {
  app.querySelector("#community-search").addEventListener("input", (event) => {
    searchQuery = event.target.value.trim();
    renderDirectory();
  });
  app.querySelector("#community-group-list").addEventListener("click", (event) => {
    const row = event.target.closest("[data-group]");
    if (row) selectGroup(row.dataset.group).catch(showError);
  });
  app.querySelector("#community-moderation")?.addEventListener("click", () => openGroupReports().catch(showError));
  app.querySelector("#community-chat").addEventListener("click", handleChatAction);
  const imageDialog = app.querySelector("#community-image-dialog");
  app.querySelector(".community-image-close").addEventListener("click", () => imageDialog.close());
  imageDialog.addEventListener("click", (event) => {
    if (event.target === imageDialog) imageDialog.close();
  });
  app.querySelector("#community-chat").addEventListener("submit", sendMessage);
  app.querySelector("#community-chat").addEventListener("input", (event) => {
    if (event.target.matches("#community-message-search")) {
      messageQuery = event.target.value;
      renderMessages();
    }
  });
}

function showError(error) {
  console.error("Community action failed.", error);
  showNotice(error.message || "That community action failed. Please try again.", "error");
}

async function loadGroups() {
  const [groupResult, membershipResult] = await Promise.all([
    db.from("groups")
      .select("id,creator_id,name,description,icon_url,privacy,is_permanent,status,created_at")
      .eq("status", "active")
      .order("is_permanent", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
    db.from("group_members").select("group_id,role,status").eq("user_id", currentUser.id),
  ]);
  if (groupResult.error) throw groupResult.error;
  if (membershipResult.error) throw membershipResult.error;
  groups = groupResult.data || [];
  memberships = new Map((membershipResult.data || []).map((membership) => [membership.group_id, membership]));
  if (!groups.some((group) => group.id === activeGroupId)) {
    activeGroupId = groups.find((group) => isMember(group.id))?.id
      || groups.find((group) => memberships.get(group.id)?.status !== "banned")?.id
      || null;
  }
  render();
}

async function selectGroup(groupId) {
  activeGroupId = groupId;
  messageQuery = "";
  messages = [];
  await loadMessages();
  await subscribeToGroup();
  render();
  renderMessages(true);
  if (missingAttachmentNoticeGroups.has(groupId)) {
    showNotice("Some attachments are missing from storage and were hidden. Discussions are still available; please re-upload those files.", "error");
  }
  const messageList = app.querySelector("#community-messages");
  if (messageList) messageList.scrollTop = messageList.scrollHeight;
}

async function loadMessages() {
  const group = activeGroup();
  if (!group) {
    messages = [];
    return;
  }
  const { data, error } = await db.from("group_messages")
    .select("id,group_id,sender_id,topic_title,parent_message_id,body,created_at")
    .eq("group_id", group.id)
    .eq("status", "visible")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  const rows = (data || []).reverse();
  if (rows.length) {
    const { data: attachmentRows, error: attachmentError } = await db.from("group_message_attachments")
      .select("message_id,storage_object_path,mime_type,byte_size")
      .eq("group_id", group.id)
      .in("message_id", rows.map((row) => row.id));
    if (attachmentError) throw attachmentError;
    const byMessage = new Map();
    let hasMissingAttachments = false;
    for (const attachment of attachmentRows || []) {
      const { data: signed, error: signedError } = await db.storage.from("group-attachments").createSignedUrl(attachment.storage_object_path, 3600);
      if (signedError) {
        const signedErrorDetails = `${signedError.message} ${signedError.status || ""} ${signedError.statusCode || ""}`.toLowerCase();
        if (signedErrorDetails.includes("object not found") || signedErrorDetails.includes("404")) {
          hasMissingAttachments = true;
          continue;
        }
        throw signedError;
      }
      const values = byMessage.get(attachment.message_id) || [];
      values.push({
        url: signed.signedUrl,
        file_name: attachment.storage_object_path.split("/").pop(),
        mime_type: attachment.mime_type,
        byte_size: attachment.byte_size,
      });
      byMessage.set(attachment.message_id, values);
    }
    messages = rows.map((row) => ({ ...row, attachments: byMessage.get(row.id) || [] }));
    if (hasMissingAttachments && !missingAttachmentNoticeGroups.has(group.id)) {
      missingAttachmentNoticeGroups.add(group.id);
      showNotice("Some attachments are missing from storage and were hidden. Discussions are still available; please re-upload those files.", "error");
    }
  } else {
    messages = [];
  }
  renderMessages(true);
}

async function subscribeToGroup() {
  if (realtimeChannel) {
    await db.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  const group = activeGroup();
  if (!group || !isMember(group.id)) return;
  realtimeChannel = db.channel(`community:${group.id}`);
  realtimeChannel
    .on("postgres_changes", { event: "*", schema: "public", table: "group_messages", filter: `group_id=eq.${group.id}` }, () => {
      if (activeGroupId === group.id) loadMessages().catch(showError);
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_message_attachments", filter: `group_id=eq.${group.id}` }, () => {
      if (activeGroupId === group.id) loadMessages().catch(showError);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "group_members", filter: `group_id=eq.${group.id}` }, (payload) => {
      if (payload.new?.user_id === currentUser.id || payload.old?.user_id === currentUser.id) {
        loadGroups().then(async () => {
          if (!isMember(group.id)) {
            if (realtimeChannel) await db.removeChannel(realtimeChannel);
            realtimeChannel = null;
            render();
            return;
          }
          if (activeGroupId === group.id) await loadMessages();
        }).catch(showError);
      }
    })
    .subscribe();
}

async function createGroup(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    if (!isPremium()) throw new Error("An active Premium membership is required to create a community.");
    const values = new FormData(form);
    const name = String(values.get("name") || "").trim();
    const description = String(values.get("description") || "").trim();
    const iconUrl = String(values.get("icon_url") || "").trim() || null;
    const privacy = String(values.get("privacy") || "public");
    const { data, error } = await db.from("groups").insert({
      creator_id: currentUser.id,
      name,
      description,
      icon_url: iconUrl,
      privacy,
    }).select("id").single();
    if (error) throw error;
    let iconWarning = "";
    const image = values.get("icon_file");
    if (image instanceof File && image.size) {
      try {
        const path = `${currentUser.id}/${data.id}/${crypto.randomUUID()}.${fileExtension(image.name)}`;
        const { error: uploadError } = await db.storage.from("community-icons").upload(path, image, { contentType: image.type, upsert: false });
        if (uploadError) throw uploadError;
        const { data: publicUrl } = db.storage.from("community-icons").getPublicUrl(path);
        const { error: updateError } = await db.from("groups").update({ icon_url: publicUrl.publicUrl }).eq("id", data.id);
        if (updateError) throw updateError;
      } catch (error) {
        iconWarning = error.message || "the uploaded image could not be saved";
      }
    }
    form.reset();
    app.querySelector("#community-create-dialog").close();
    showNotice("Your community is ready.");
    await loadGroups();
    if (data?.id) await selectGroup(data.id);
    if (iconWarning) showNotice(`Community created, but its icon could not be uploaded: ${iconWarning}`, "error");
  } catch (error) {
    showError(error);
  } finally {
    submit.disabled = false;
  }
}

function communityIconObjectPath(group) {
  if (!group.icon_url) return null;
  const marker = "__community-icon-marker__";
  const markerUrl = new URL(db.storage.from("community-icons").getPublicUrl(marker).data.publicUrl);
  const iconUrl = new URL(group.icon_url, location.href);
  const storagePrefix = markerUrl.pathname.slice(0, -marker.length);
  if (iconUrl.origin !== markerUrl.origin || !iconUrl.pathname.startsWith(storagePrefix)) return null;
  const objectPath = decodeURIComponent(iconUrl.pathname.slice(storagePrefix.length));
  return objectPath.startsWith(`${group.creator_id}/${group.id}/`) ? objectPath : null;
}

async function removeCommunityStorageFiles(group) {
  const attachmentPaths = [];
  for (let offset = 0; ; offset += 500) {
    const { data: attachmentRows, error } = await db
      .from("group_message_attachments")
      .select("storage_object_path")
      .eq("group_id", group.id)
      .range(offset, offset + 499);
    if (error) throw error;
    attachmentPaths.push(...(attachmentRows || []).map((attachment) => attachment.storage_object_path));
    if (!attachmentRows || attachmentRows.length < 500) break;
  }

  for (let index = 0; index < attachmentPaths.length; index += 100) {
    const { error } = await db.storage.from("group-attachments").remove(attachmentPaths.slice(index, index + 100));
    if (error) throw error;
  }

  const iconPath = communityIconObjectPath(group);
  if (iconPath) {
    const { error } = await db.storage.from("community-icons").remove([iconPath]);
    if (error) throw error;
  }
}

function fileExtension(name) {
  const extension = name.split(".").pop()?.toLowerCase() || "bin";
  return /^[a-z0-9]{1,8}$/.test(extension) ? extension : "bin";
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function handleChatAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const group = activeGroup();
  if (!group) return;
  const action = button.dataset.action;
  try {
    if (action === "view-image") {
      const dialog = app.querySelector("#community-image-dialog");
      const image = app.querySelector("#community-image-preview");
      image.src = button.dataset.imageUrl;
      image.alt = button.dataset.imageName || "Community attachment";
      app.querySelector("#community-image-caption").textContent = image.alt;
      dialog.showModal();
      return;
    }
    if (action === "join-group") await joinPublicGroup(group.id);
    if (action === "toggle-reply") {
      const form = app.querySelector(`[data-reply-form="${CSS.escape(button.dataset.messageId)}"]`);
      if (form) {
        form.hidden = !form.hidden;
        if (!form.hidden) form.querySelector("textarea").focus();
      }
    }
    if (action === "search-messages") {
      const input = app.querySelector("#community-message-search");
      input.hidden = !input.hidden;
      if (!input.hidden) input.focus();
      else { input.value = ""; messageQuery = ""; renderMessages(); }
    }
    if (action === "report-group") await reportTarget(group.id, null);
    if (action === "report-message") await reportTarget(group.id, button.dataset.messageId);
    if (action === "delete-message") await deleteGroupMessage(group, button.dataset.messageId);
    if (action === "close-dialog") button.closest("dialog").close();
  } catch (error) {
    showError(error);
  }
}

async function deleteGroupMessage(group, messageId) {
  if (!isAdmin && !isGroupAdmin(group.id)) throw new Error("Community admin access is required to delete posts.");
  const message = messages.find((row) => row.id === messageId);
  if (!message) throw new Error("That post is no longer available. Refresh the community and try again.");
  let replyIds = [];
  if (!message.parent_message_id) {
    const { data: replyRows, error: replyError } = await db.from("group_messages")
      .select("id")
      .eq("group_id", group.id)
      .eq("parent_message_id", messageId);
    if (replyError) throw replyError;
    replyIds = (replyRows || []).map((reply) => reply.id);
  }
  const messageIds = [messageId, ...replyIds];
  const confirmationMessage = replyIds.length
    ? "Delete this topic, all of its replies, and their attachments? This cannot be undone."
    : "Delete this post and its attachments? This cannot be undone.";
  if (!await confirmDialog(confirmationMessage, { title: "Delete post", confirmLabel: "Delete", danger: true })) return;

  const { data: attachmentRows, error: attachmentError } = await db.from("group_message_attachments")
    .select("storage_object_path")
    .eq("group_id", group.id)
    .in("message_id", messageIds);
  if (attachmentError) throw attachmentError;
  const paths = (attachmentRows || []).map((attachment) => attachment.storage_object_path);
  const { data: deletedRows, error: deleteError } = await db.from("group_messages")
    .delete()
    .eq("group_id", group.id)
    .eq("id", messageId)
    .select("id");
  if (deleteError) throw deleteError;
  if (!deletedRows?.length) throw new Error("The post could not be deleted. Check the community admin permissions and try again.");
  if (paths.length) {
    const { error: storageError } = await db.storage.from("group-attachments").remove(paths);
    if (storageError) {
      await loadMessages();
      throw new Error(`The post was deleted, but its attachment files could not be removed from storage: ${storageError.message}`);
    }
  }
  await loadMessages();
  showNotice(replyIds.length
    ? "Topic, replies, and attachments deleted."
    : "Post and attachments deleted.");
}

async function joinPublicGroup(groupId) {
  const { error } = await db.rpc("join_public_group", { p_group_id: groupId });
  if (error) throw error;
  showNotice("You joined the community.");
  await loadGroups();
  await selectGroup(groupId);
}

async function useInvitePrompt() {
  const inviteUrl = await promptDialog("Paste the community invite link:", "", { title: "Join with an invite link", confirmLabel: "Join" });
  if (!inviteUrl) return;
  try {
    const parsedInviteUrl = new URL(inviteUrl, location.origin);
    const token = new URLSearchParams(parsedInviteUrl.hash.slice(1)).get("invite")
      || parsedInviteUrl.searchParams.get("invite");
    if (!token || !/^[A-Za-z0-9_-]{32,}$/.test(token)) throw new Error("That invite link does not look valid.");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const { data, error } = await db.rpc("join_group_with_link", { p_token_hash: hash });
    if (error) throw error;
    const groupId = typeof data === "string" ? data : data?.group_id;
    showNotice("Invite accepted. Welcome to the community.");
    await loadGroups();
    if (groupId) await selectGroup(groupId);
  } catch (error) {
    showError(error);
  }
}

async function acceptInviteFromUrl() {
  const token = new URLSearchParams(location.hash.slice(1)).get("invite")
    || new URLSearchParams(location.search).get("invite");
  if (!token || !/^[A-Za-z0-9_-]{32,}$/.test(token)) return;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const { data, error } = await db.rpc("join_group_with_link", { p_token_hash: hash });
  if (error) throw error;
  history.replaceState(null, "", `${location.pathname}${location.search}`);
  showNotice("Invite accepted. Welcome to the community.");
  await loadGroups();
  const groupId = typeof data === "string" ? data : data?.group_id;
  if (groupId) await selectGroup(groupId);
}

async function reportTarget(groupId, messageId) {
  const reason = await promptDialog("Report reason: harassment, spam, unsafe, or other", "other", { title: "Report content" });
  if (!reason) return;
  const normalizedReason = reason.trim().toLowerCase();
  if (!["harassment", "spam", "unsafe", "other"].includes(normalizedReason)) throw new Error("Choose harassment, spam, unsafe, or other.");
  const details = await promptDialog("Add details for the moderation team (optional):", "", { title: "Report details", confirmLabel: "Send report", multiline: true }) || "";
  const payload = {
    group_id: groupId,
    message_id: messageId,
    reporter_id: currentUser.id,
    reason: normalizedReason,
    details: details.slice(0, 2000),
  };
  const { error } = await db.from("group_message_reports").insert(payload);
  if (error) throw error;
  showNotice("Your report was sent to the moderation team.");
}

async function openSettings(group) {
  const dialog = app.querySelector("#community-settings-dialog");
  const content = app.querySelector("#community-settings-content");
  content.innerHTML = `<div class="community-modal-heading"><div><h2>Community settings</h2><p>${escapeHtml(group.name)} · ${escapeHtml(groupSubtitle(group))}</p></div><button class="community-icon-button" type="button" data-action="close-dialog" aria-label="Close"><i data-lucide="x" class="h-5 w-5"></i></button></div>
    <form id="community-settings-form">
      <label class="community-field">Name<input name="name" value="${escapeHtml(group.name)}" required minlength="2" maxlength="80"></label>
      <label class="community-field">Description<textarea name="description" maxlength="2000" rows="3">${escapeHtml(group.description || "")}</textarea></label>
      <label class="community-field">Icon URL<input name="icon_url" type="url" maxlength="2048" value="${escapeHtml(group.icon_url || "")}"></label>
      <label class="community-field">Privacy<select name="privacy" ${group.is_permanent ? "disabled" : ""}><option value="public" ${group.privacy === "public" ? "selected" : ""}>Public</option><option value="invite_only" ${group.privacy === "invite_only" ? "selected" : ""}>Invite-only</option></select>${group.is_permanent ? '<span class="community-field-hint">Permanent communities must remain public.</span>' : ""}</label>
      ${isAdmin ? `<button class="community-button ${group.is_permanent ? "" : "primary"}" type="button" data-action="toggle-permanent">${group.is_permanent ? "Remove permanent status" : "Make permanent community"}</button>` : ""}
      ${(isAdmin || (memberRole(group.id) === "owner" && !group.is_permanent)) ? `<div class="community-danger-zone"><p>Deleting a community permanently removes its messages, members, and invitations.</p><button class="community-button community-button-danger" type="button" data-action="delete-group"><i data-lucide="trash-2" class="h-4 w-4"></i> Delete community</button></div>` : ""}
      ${group.privacy === "invite_only" ? '<div class="community-field"><label for="community-direct-invite-uuid">Invite user by account ID</label><input id="community-direct-invite-uuid" name="invitee_user_id" placeholder="User UUID"><button class="community-button" type="button" data-action="direct-invite">Send direct invite</button></div>' : ""}
      <div><h3>Members</h3><div id="community-members">Loading members…</div></div>
      <div class="community-modal-actions"><button class="community-button" type="button" data-action="close-dialog">Done</button><button class="community-button primary" type="submit">Save settings</button></div>
    </form>`;
  content.onsubmit = (event) => {
    saveGroupSettings(event).catch(showError);
  };
  content.onclick = async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    try {
      if (button.dataset.action === "close-dialog") dialog.close();
      if (button.dataset.action === "delete-group") {
        const confirmation = await confirmDialog(`Permanently delete "${group.name}" and all of its messages, members, and invitations? This cannot be undone.`, { title: "Delete community", confirmLabel: "Delete", danger: true });
        if (!confirmation) return;
        button.disabled = true;
        await removeCommunityStorageFiles(group);
        const { error } = await db.rpc("delete_community", { p_group_id: group.id });
        if (error) throw error;
        dialog.close();
        activeGroupId = null;
        messages = [];
        await loadGroups();
        if (activeGroupId) await selectGroup(activeGroupId);
        showNotice("Community deleted.");
      }
      if (button.dataset.action === "toggle-permanent") {
        const permanent = !group.is_permanent;
        const confirmation = permanent
          ? "Make this community permanent? It becomes public and every existing and future account will be automatically joined."
          : "Remove permanent status? Existing members remain joined, but future users will not be auto-joined.";
        if (!await confirmDialog(confirmation, { title: permanent ? "Make community permanent" : "Remove permanent status", confirmLabel: "Continue" })) return;
        const { error } = await db.rpc("admin_set_group_permanent", { p_group_id: group.id, p_is_permanent: permanent });
        if (error) throw error;
        dialog.close();
        await loadGroups();
        showNotice(permanent ? "This is now a permanent community." : "Permanent status was removed.");
      }
      if (button.dataset.action === "direct-invite") {
        const input = content.querySelector('[name="invitee_user_id"]');
        if (!validUuid(input.value.trim())) throw new Error("Enter a valid user UUID.");
        await createDirectInvite(group.id, input.value.trim());
        input.value = "";
      }
      if (button.dataset.action === "revoke-invite") {
        const { error } = await db.rpc("revoke_group_invite", { p_invite_id: button.dataset.inviteId });
        if (error) throw error;
        showNotice("Invitation revoked.");
        await renderGroupInvites(group.id, content.querySelector("#community-group-invites"));
      }
      if (button.dataset.action === "member-action") {
        await manageMember(group.id, button.dataset.userId, button.dataset.memberAction);
        await loadMemberList(group.id, content.querySelector("#community-members"));
      }
      if (button.dataset.action === "transfer-ownership") {
        if (!await confirmDialog("Transfer community ownership? You will become an admin.", { title: "Transfer ownership", confirmLabel: "Transfer" })) return;
        const { error } = await db.rpc("transfer_group_ownership", {
          p_group_id: group.id,
          p_target_user_id: button.dataset.userId,
        });
        if (error) throw error;
        dialog.close();
        await loadGroups();
        showNotice("Community ownership transferred.");
      }
    } catch (error) {
      if (button.dataset.action === "delete-group") button.disabled = false;
      showError(error);
    }
  };
  window.lucide?.createIcons();
  dialog.showModal();
  await loadMemberList(group.id, content.querySelector("#community-members"));
}

async function loadMemberList(groupId, container) {
  const { data, error } = await db.from("group_members")
    .select("user_id,role,status")
    .eq("group_id", groupId)
    .order("joined_at", { ascending: true })
    .limit(100);
  if (error) throw error;
  container.innerHTML = data?.length ? data.map((member) => {
    const manageable = isGroupAdmin(groupId) && member.user_id !== currentUser.id && member.role !== "owner"
      && (member.role !== "admin" || memberRole(groupId) === "owner");
    if (member.status === "banned") {
      return `<div class="community-member-row"><span><strong>Banned member</strong><br><span class="community-member-id">${escapeHtml(shortId(member.user_id))}</span></span>${manageable ? `<button class="community-button subtle" type="button" data-action="member-action" data-user-id="${escapeHtml(member.user_id)}" data-member-action="unban">Unban</button>` : ""}</div>`;
    }
    const action = member.role === "admin" ? "demote_admin" : "promote_admin";
    return `<div class="community-member-row"><span><strong>${member.role === "owner" ? "Creator" : escapeHtml(member.role)}</strong><br><span class="community-member-id">${escapeHtml(shortId(member.user_id))}</span></span>
      ${manageable ? `<span>${member.role === "admin" ? `<button class="community-button subtle" type="button" data-action="member-action" data-user-id="${escapeHtml(member.user_id)}" data-member-action="demote_admin">Demote</button>` : `<button class="community-button subtle" type="button" data-action="member-action" data-user-id="${escapeHtml(member.user_id)}" data-member-action="kick">Kick</button><button class="community-button subtle" type="button" data-action="member-action" data-user-id="${escapeHtml(member.user_id)}" data-member-action="ban">Ban</button>${memberRole(groupId) === "owner" ? `<button class="community-button subtle" type="button" data-action="member-action" data-user-id="${escapeHtml(member.user_id)}" data-member-action="${action}">Make admin</button><button class="community-button subtle" type="button" data-action="transfer-ownership" data-user-id="${escapeHtml(member.user_id)}">Make owner</button>` : ""}`}</span>` : ""}
    </div>`;
  }).join("") : "<p>No active members yet.</p>";
}

async function renderGroupInvites(groupId, container) {
  const { data, error } = await db.from("group_invites")
    .select("id,invitee_user_id,expires_at,max_uses,use_count,created_at")
    .eq("group_id", groupId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  const openInvites = (data || []).filter((invite) =>
    invite.use_count < invite.max_uses && (!invite.expires_at || new Date(invite.expires_at) > new Date()));
  container.innerHTML = openInvites.length ? openInvites.map((invite) => `
    <div class="community-member-row">
      <span><strong>${invite.invitee_user_id ? `Direct invite · ${escapeHtml(shortId(invite.invitee_user_id))}` : "Invite link"}</strong><br>
      <span class="community-member-id">${invite.use_count}/${invite.max_uses} uses · expires ${escapeHtml(invite.expires_at ? new Date(invite.expires_at).toLocaleDateString() : "never")}</span></span>
      <button class="community-button subtle" type="button" data-action="revoke-invite" data-invite-id="${escapeHtml(invite.id)}">Revoke</button>
    </div>`).join("") : "<p>No active invitations.</p>";
}

async function openGroupReports() {
  const dialog = app.querySelector("#community-reports-dialog");
  const content = app.querySelector("#community-reports-content");
  const { data, error } = await db.from("group_message_reports")
    .select("id,group_id,message_id,reporter_id,reason,details,status,created_at")
    .in("status", ["open", "reviewed"])
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  content.innerHTML = `<div class="community-modal-heading"><div><h2>Community moderation</h2><p>Review reports for messages and communities.</p></div><button class="community-icon-button" type="button" data-action="close-reports" aria-label="Close"><i data-lucide="x" class="h-5 w-5"></i></button></div>
    ${data?.length ? data.map((report) => `<article class="community-report-card">
      <div class="community-report-meta"><strong>${report.message_id ? "Message report" : "Community report"} · ${escapeHtml(report.reason)}</strong><span>${escapeHtml(report.status.replaceAll("_", " "))} · ${escapeHtml(new Date(report.created_at).toLocaleString())}</span></div>
      <p>${escapeHtml(report.details || "No additional details provided.")}</p>
      <small>Community ${escapeHtml(shortId(report.group_id))} · Reporter ${escapeHtml(shortId(report.reporter_id))}${report.message_id ? ` · Message ${escapeHtml(shortId(report.message_id))}` : ""}</small>
      <div class="community-report-actions"><button class="community-button subtle" type="button" data-action="report-status" data-status="reviewed" data-report-id="${escapeHtml(report.id)}">Mark reviewed</button><button class="community-button subtle" type="button" data-action="report-status" data-status="dismissed" data-report-id="${escapeHtml(report.id)}">Dismiss</button><button class="community-button primary subtle" type="button" data-action="report-status" data-status="actioned" data-report-id="${escapeHtml(report.id)}">Take action</button></div>
    </article>`).join("") : "<p>No open community reports.</p>"}`;
  content.onclick = async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (button.dataset.action === "close-reports") {
      dialog.close();
      return;
    }
    if (button.dataset.action !== "report-status") return;
    button.disabled = true;
    try {
      const { error: updateError } = await db.from("group_message_reports").update({
        status: button.dataset.status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: currentUser.id,
      }).eq("id", button.dataset.reportId);
      if (updateError) throw updateError;
      button.closest(".community-report-card").remove();
      if (!content.querySelector(".community-report-card")) content.insertAdjacentHTML("beforeend", "<p>No open community reports.</p>");
      showNotice("Moderation report updated.");
    } catch (updateError) {
      showError(updateError);
    }
  };
  window.lucide?.createIcons();
  dialog.showModal();
}

async function saveGroupSettings(event) {
  event.preventDefault();
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form.id !== "community-settings-form") {
    throw new Error("Community settings form could not be found.");
  }
  const group = activeGroup();
  if (!group) throw new Error("The selected community could not be found.");
  const values = new FormData(form);
  const privacy = group.is_permanent ? "public" : String(values.get("privacy"));
  const { error } = await db.from("groups").update({
    name: String(values.get("name") || "").trim(),
    description: String(values.get("description") || "").trim(),
    icon_url: String(values.get("icon_url") || "").trim() || null,
    privacy,
  }).eq("id", group.id);
  if (error) throw error;
  app.querySelector("#community-settings-dialog").close();
  showNotice("Community settings saved.");
  await loadGroups();
}

async function manageMember(groupId, userId, action) {
  const { error } = await db.rpc("manage_group_member", {
    p_group_id: groupId,
    p_target_user_id: userId,
    p_action: action,
  });
  if (error) throw error;
  showNotice(`Member action completed: ${action.replaceAll("_", " ")}.`);
}

async function openDirectInvites() {
  const dialog = app.querySelector("#community-invite-dialog");
  const content = app.querySelector("#community-invite-content");
  content.innerHTML = `<div class="community-modal-heading"><div><h2>Your invitations</h2><p>Accept a direct invitation to join a private community.</p></div><button class="community-icon-button" type="button" data-action="close-dialog" aria-label="Close"><i data-lucide="x" class="h-5 w-5"></i></button></div>
    <div>${pendingInvites.length ? pendingInvites.map((invite) => `<div class="community-member-row"><span><strong>Community invitation</strong><br><span class="community-member-id">${escapeHtml(shortId(invite.group_id))} · ${escapeHtml(new Date(invite.created_at).toLocaleDateString())}</span></span><button class="community-button primary subtle" type="button" data-action="accept-direct-invite" data-invite-id="${escapeHtml(invite.id)}">Accept</button></div>`).join("") : "<p>You have no pending invitations.</p>"}</div>`;
  content.onclick = async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (button.dataset.action === "close-dialog") dialog.close();
    if (button.dataset.action === "accept-direct-invite") {
      button.disabled = true;
      try {
        const { data: groupId, error } = await db.rpc("accept_direct_group_invite", { p_invite_id: button.dataset.inviteId });
        if (error) throw error;
        dialog.close();
        showNotice("Invite accepted. Welcome to the community.");
        await loadGroups();
        if (groupId) await selectGroup(groupId);
      } catch (error) {
        showError(error);
      }
    }
  };
  window.lucide?.createIcons();
  dialog.showModal();
}

async function openInvites(group) {
  const dialog = app.querySelector("#community-invite-dialog");
  const content = app.querySelector("#community-invite-content");
  content.innerHTML = `<div class="community-modal-heading"><div><h2>Invite people</h2><p>Invite members to ${escapeHtml(group.name)}.</p></div><button class="community-icon-button" type="button" data-action="close-dialog" aria-label="Close"><i data-lucide="x" class="h-5 w-5"></i></button></div>
    <p>Invite links can be used up to 100 times and expire after 7 days. The secret is only shown in the link.</p>
    <button class="community-button primary" type="button" data-action="create-link"><i data-lucide="link" class="h-4 w-4"></i> Create invite link</button>
    <div class="community-field"><label for="community-direct-invite-user">Direct invite by account ID</label><input id="community-direct-invite-user" placeholder="User UUID"><button class="community-button" type="button" data-action="direct-invite">Send direct invite</button></div>
    <div id="community-invite-result"></div><div><h3>Active invitations</h3><div id="community-group-invites">Loading invitations…</div></div>`;
  content.onclick = async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (button.dataset.action === "close-dialog") dialog.close();
    if (button.dataset.action === "direct-invite") {
      const input = content.querySelector("#community-direct-invite-user");
      if (!validUuid(input.value.trim())) {
        showNotice("Enter a valid user UUID.", "error");
        return;
      }
      try {
        await createDirectInvite(group.id, input.value.trim());
        input.value = "";
        await renderGroupInvites(group.id, content.querySelector("#community-group-invites"));
      } catch (error) {
        showError(error);
      }
    }
    if (button.dataset.action === "revoke-invite") {
      try {
        const { error } = await db.rpc("revoke_group_invite", { p_invite_id: button.dataset.inviteId });
        if (error) throw error;
        showNotice("Invitation revoked.");
        await renderGroupInvites(group.id, content.querySelector("#community-group-invites"));
      } catch (error) {
        showError(error);
      }
    }
    if (button.dataset.action === "create-link") {
      button.disabled = true;
      try {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        const secret = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
        const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const { error } = await db.rpc("create_group_invite", {
          p_group_id: group.id,
          p_token_hash: hash,
          p_invitee_user_id: null,
          p_expires_at: expiresAt,
          p_max_uses: 100,
        });
        if (error) throw error;
        const inviteUrl = new URL(location.href);
        inviteUrl.searchParams.delete("invite");
        inviteUrl.hash = new URLSearchParams({ invite: secret }).toString();
        content.querySelector("#community-invite-result").innerHTML = `<label class="community-field">Invite link<input readonly value="${escapeHtml(inviteUrl.href)}"></label><button class="community-button" type="button" data-action="copy-link">Copy invite link</button>`;
        content.dataset.inviteUrl = inviteUrl.href;
      } catch (error) {
        showError(error);
      } finally {
        button.disabled = false;
      }
    }
    if (button.dataset.action === "copy-link") {
      try {
        await navigator.clipboard.writeText(content.dataset.inviteUrl);
        showNotice("Invite link copied.");
      } catch (error) {
        showError(error);
      }
    }
  };
  window.lucide?.createIcons();
  dialog.showModal();
  await renderGroupInvites(group.id, content.querySelector("#community-group-invites"));
}

async function createDirectInvite(groupId, inviteeUserId) {
  const { error } = await db.rpc("create_group_invite", {
    p_group_id: groupId,
    p_token_hash: null,
    p_invitee_user_id: inviteeUserId,
    p_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    p_max_uses: 1,
  });
  if (error) throw error;
  showNotice("A direct invitation was created for that account.");
}

async function sendMessage(event) {
  const form = event.target.closest("#community-compose, [data-reply-form]");
  if (!form) return;
  event.preventDefault();
  const group = activeGroup();
  if (!group || !isMember(group.id)) return;
  const submit = form.querySelector('[type="submit"]');
  const body = form.elements.body.value.trim();
  const topicTitle = String(form.elements.topic_title?.value || "").trim();
  const parentMessageId = form.dataset.replyForm || null;
  const files = Array.from(form.elements.attachments.files || []);
  if ((!parentMessageId && !topicTitle) || (!body && !files.length)) return;
  if (files.some((file) => file.size > 50 * 1024 * 1024)) {
    showNotice("Each attachment must be 50 MB or smaller.", "error");
    return;
  }
  submit.disabled = true;
  try {
    const { data: message, error } = await db.from("group_messages").insert({
      group_id: group.id,
      sender_id: currentUser.id,
      topic_title: parentMessageId ? "" : topicTitle,
      parent_message_id: parentMessageId,
      body,
    }).select("id,group_id,sender_id,topic_title,parent_message_id,body,created_at").single();
    if (error) throw error;
    if (files.length) {
      const uploadedPaths = [];
      try {
        const attachments = [];
        for (const file of files) {
          const safeName = file.name.replace(/[^\w.-]/g, "_");
          const path = `${currentUser.id}/${group.id}/${message.id}/${crypto.randomUUID()}-${safeName}`;
          const { error: uploadError } = await db.storage.from("group-attachments").upload(path, file, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });
          if (uploadError) throw new Error(`Could not upload "${file.name}": ${uploadError.message}`);
          uploadedPaths.push(path);
          attachments.push({
            group_id: group.id,
            message_id: message.id,
            uploader_id: currentUser.id,
            storage_object_path: path,
            mime_type: file.type || "application/octet-stream",
            byte_size: file.size,
          });
        }
        const { error: metadataError } = await db.from("group_message_attachments").insert(attachments);
        if (metadataError) throw metadataError;
      } catch (error) {
        let cleanupError = null;
        if (uploadedPaths.length) {
          const { error: removeError } = await db.storage.from("group-attachments").remove(uploadedPaths);
          cleanupError = removeError;
        }
        form.reset();
        await loadMessages();
        const cleanupNotice = cleanupError ? ` Uploaded files could not be cleaned up: ${cleanupError.message}` : "";
        showNotice(`Post saved, but its attachment${files.length === 1 ? "" : "s"} could not be saved: ${error.message}${cleanupNotice}`, "error");
        return;
      }
    }
    form.reset();
    if (parentMessageId) form.hidden = true;
    try {
      await loadMessages();
    } catch (error) {
      console.error("Community post was saved, but its attachments could not be displayed.", error);
      showNotice(`Post saved${files.length ? " and its files uploaded" : ""}, but the attachments could not be displayed: ${error.message}`, "error");
    }
  } catch (error) {
    showError(error);
  } finally {
    submit.disabled = false;
  }
}

async function initialize() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase?.createClient) {
    app.innerHTML = `<div class="community-fatal">SPRK account service is not configured.</div>`;
    return;
  }
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  currentUser = data.session?.user || null;
  if (!currentUser) {
    render();
    return;
  }
  const [profileResult, adminResult] = await Promise.all([
    db.from("profiles").select("display_name,is_premium,premium_until").eq("id", currentUser.id).maybeSingle(),
    db.rpc("is_sprk_admin"),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (adminResult.error) throw adminResult.error;
  profile = profileResult.data || {};
  isAdmin = Boolean(adminResult.data);
  render();
  await loadGroups();
  if (activeGroupId) {
    await loadMessages();
    await subscribeToGroup();
  }
}

const script = document.createElement("script");
script.src = clientUrl;
script.onload = () => initialize().catch((error) => {
  console.error("Could not initialize community.", error);
  app.innerHTML = `<div class="community-fatal">Community could not load: ${escapeHtml(error.message || "Please try again.")}</div>`;
});
script.onerror = () => {
  app.innerHTML = '<div class="community-fatal">Could not load the secure community service. Check your connection and try again.</div>';
};
document.head.append(script);
