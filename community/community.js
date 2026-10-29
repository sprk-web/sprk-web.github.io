import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../js/config.js";

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
let pendingInvites = [];
let activeGroupId = null;
let messages = [];
let activeFilter = "joined";
let searchQuery = "";
let messageQuery = "";
let realtimeChannel = null;
let typingTimer = null;

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
    const matchesFilter = activeFilter === "discover"
      ? !isMember(group.id) && memberships.get(group.id)?.status !== "banned" && (group.privacy === "public" || isAdmin)
      : isMember(group.id);
    return matchesText && matchesFilter;
  });
  if (!visible.length) {
    return `<p class="community-list-empty">${activeFilter === "joined"
      ? "Your communities will appear here. Browse public communities or use an invite link to join."
      : "No public communities match that search yet."}</p>`;
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
  app.querySelectorAll(".community-filter").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.filter === activeFilter));
  });
  window.lucide?.createIcons();
}

function renderMessage(message) {
  const mine = message.sender_id === currentUser.id;
  const attachments = message.attachments || [];
  const text = message.body ? `<p>${escapeHtml(message.body)}</p>` : "";
  const fileHtml = attachments.map((attachment) => `<a class="community-attachment-link" href="${escapeHtml(attachment.url || "#")}" ${attachment.url ? 'target="_blank" rel="noopener noreferrer"' : ""}><i data-lucide="paperclip" class="h-4 w-4"></i>${escapeHtml(attachment.file_name || "Attachment")}</a>`).join("");
  return `<article class="community-message ${mine ? "mine" : ""}" data-message="${escapeHtml(message.id)}">
    ${mine ? "" : `<span class="community-message-avatar" title="${escapeHtml(message.sender_id)}">${escapeHtml(initialFor(message.sender_name || message.sender_id))}</span>`}
    <div>
      <div class="community-message-bubble">
        <div class="community-message-meta"><strong>${mine ? "You" : escapeHtml(message.sender_name || `Member ${shortId(message.sender_id)}`)}</strong><time datetime="${escapeHtml(message.created_at)}">${escapeHtml(new Date(message.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))}</time></div>
        ${text}${fileHtml}
      </div>
      <div class="community-message-tools"><button type="button" data-action="report-message" data-message-id="${escapeHtml(message.id)}">Report</button></div>
    </div>
  </article>`;
}

function renderMessages(scroll = false) {
  const container = app.querySelector("#community-messages");
  if (!container) return;
  const normalized = messageQuery.trim().toLowerCase();
  const visible = normalized
    ? messages.filter((message) => `${message.body} ${message.sender_id}`.toLowerCase().includes(normalized))
    : messages;
  container.innerHTML = visible.length
    ? visible.map(renderMessage).join("")
    : `<div class="community-empty-chat"><i data-lucide="${normalized ? "search-x" : "messages-square"}" class="h-8 w-8"></i><h2>${normalized ? "No matching messages" : "Start the conversation"}</h2><p>${normalized ? "Try another search." : "Say hello to your community. Your messages are only visible to its members."}</p></div>`;
  window.lucide?.createIcons();
  if (scroll) container.scrollTop = container.scrollHeight;
}

function chatMarkup(group) {
  if (!group) {
    return `<section class="community-empty-chat"><i data-lucide="users-round" class="h-10 w-10"></i><h2>Find your community</h2><p>Choose one of your communities, explore public groups, or accept an invite link to start chatting.</p></section>`;
  }
  const joined = isMember(group.id);
  const groupAdmin = isGroupAdmin(group.id);
  return `<header class="community-chat-header">
    <div class="community-chat-title">${groupAvatar(group)}<span><h2>${escapeHtml(group.name)}</h2><p>${escapeHtml(group.description || groupSubtitle(group))}</p></span></div>
    <div class="community-chat-tools">
      ${joined && group.privacy === "invite_only" && groupAdmin ? '<button class="community-icon-button" type="button" data-action="invite" title="Manage invites" aria-label="Manage invites"><i data-lucide="user-plus" class="h-5 w-5"></i></button>' : ""}
      ${(joined && groupAdmin) || isAdmin ? '<button class="community-icon-button" type="button" data-action="manage-group" title="Community settings" aria-label="Community settings"><i data-lucide="settings-2" class="h-5 w-5"></i></button>' : ""}
      ${joined && !group.is_permanent ? '<button class="community-icon-button" type="button" data-action="leave-group" title="Leave community" aria-label="Leave community"><i data-lucide="log-out" class="h-5 w-5"></i></button>' : ""}
      ${!joined && !memberships.has(group.id) && group.privacy === "public" ? '<button class="community-button primary subtle" type="button" data-action="join-group"><i data-lucide="plus" class="h-4 w-4"></i><span>Join</span></button>' : ""}
      ${memberships.get(group.id)?.status === "banned" ? '<span class="community-badge">Banned</span>' : ""}
      ${!joined && group.privacy === "invite_only" ? '<span class="community-badge">Invite-only</span>' : ""}
      <button class="community-icon-button" type="button" data-action="search-messages" title="Search messages" aria-label="Search messages"><i data-lucide="search" class="h-5 w-5"></i></button>
      ${joined ? '<button class="community-icon-button" type="button" data-action="report-group" title="Report community" aria-label="Report community"><i data-lucide="flag" class="h-5 w-5"></i></button>' : ""}
    </div>
  </header>
  ${joined ? `<input id="community-message-search" class="community-message-search" type="search" aria-label="Search messages" placeholder="Search in conversation…" ${messageQuery ? "" : "hidden"} value="${escapeHtml(messageQuery)}">
    <div id="community-messages" class="community-messages" aria-live="polite"></div><div id="community-typing" class="community-typing" aria-live="polite"></div>
    <form id="community-compose" class="community-compose">
      <div id="community-attachment-preview" class="community-attachment-preview" hidden></div>
      <div class="community-compose-box">
        <textarea name="body" rows="1" maxlength="4000" aria-label="Write a message" placeholder="Message ${escapeHtml(group.name)}…"></textarea>
        <div class="community-compose-actions">
          <label class="community-icon-button" title="Attach a file" aria-label="Attach a file"><i data-lucide="paperclip" class="h-5 w-5"></i><input id="community-attachment" type="file" hidden></label>
          <button class="community-icon-button" type="button" data-action="insert-emoji" title="Add an emoji" aria-label="Add an emoji"><i data-lucide="smile" class="h-5 w-5"></i></button>
          <button class="community-send" type="submit" aria-label="Send message"><i data-lucide="send" class="h-4 w-4"></i></button>
        </div>
      </div>
      <div class="community-compose-hint">Enter to send · Shift + Enter for a new line</div>
    </form>` : `<div class="community-empty-chat"><i data-lucide="${group.privacy === "public" ? "messages-square" : "lock-keyhole"}" class="h-9 w-9"></i><h2>${group.privacy === "public" ? "Join to see the conversation" : "Invite-only community"}</h2><p>${group.privacy === "public" ? "Join this public community to read and send messages." : "You need a valid invitation link from a community admin to join."}</p></div>`}`;
}

function render() {
  if (!currentUser) {
    app.innerHTML = `<section class="community-page"><div class="community-signin"><i data-lucide="users-round" class="h-10 w-10"></i><h1>Find your people</h1><p>Sign in to discover communities and join conversations. Premium members can create one.</p><a class="community-button primary" href="../account/?return=${encodeURIComponent("/community/")}">Sign in to continue</a></div></section>`;
    const signInLink = app.querySelector(".community-signin a");
    signInLink.href = `../account/?return=${encodeURIComponent(`${location.pathname}${location.search}${location.hash}`)}`;
    window.lucide?.createIcons();
    return;
  }
  const group = activeGroup();
  app.innerHTML = `<div class="community-page">
    <div class="community-topbar">
      <div class="community-heading"><div><h1>Community</h1><p>Good conversations start with a shared curiosity.</p></div></div>
      <div class="community-actions">
        <button id="community-direct-invites" class="community-button" type="button"><i data-lucide="mail" class="h-4 w-4"></i> Invites${pendingInvites.length ? ` (${pendingInvites.length})` : ""}</button>
        <button id="community-use-invite" class="community-button" type="button"><i data-lucide="link-2" class="h-4 w-4"></i> Use invite link</button>
        ${isAdmin ? '<button id="community-moderation" class="community-button" type="button"><i data-lucide="shield-check" class="h-4 w-4"></i> Moderation</button>' : ""}
        ${isPremium() ? '<button id="community-create" class="community-button primary" type="button"><i data-lucide="plus" class="h-4 w-4"></i> Create community</button>' : ""}
        ${!isPremium() ? '<a class="community-button community-premium-link" href="../account/">Premium members can create communities <i data-lucide="arrow-up-right" class="h-4 w-4"></i></a>' : ""}
      </div>
    </div>
    <div id="community-notice" class="community-notice" role="status" hidden></div>
    <div class="community-layout">
      <aside class="community-directory" aria-label="Your communities">
        <div class="community-directory-head"><h2>Communities</h2><input id="community-search" class="community-search" type="search" placeholder="Search communities…" aria-label="Search communities"></div>
        <div class="community-filter-row"><button type="button" class="community-filter" data-filter="joined" aria-pressed="true">Joined</button><button type="button" class="community-filter" data-filter="discover" aria-pressed="false">Discover</button></div>
        <div id="community-group-list" class="community-group-list"></div>
      </aside>
      <section id="community-chat" class="community-chat" aria-label="Community chat">${chatMarkup(group)}</section>
    </div>
  </div>
  <dialog id="community-create-dialog" class="community-modal">
    <form id="community-create-form">
      <div class="community-modal-heading"><div><h2>Create a community</h2><p>Start a space for people to share ideas and stay connected.</p></div><button class="community-icon-button" type="button" data-action="close-dialog" aria-label="Close"><i data-lucide="x" class="h-5 w-5"></i></button></div>
      <label class="community-field">Community name<input name="name" required minlength="2" maxlength="80" placeholder="e.g. Physics Explorers"></label>
      <label class="community-field">Description<textarea name="description" maxlength="2000" rows="3" placeholder="What brings this community together?"></textarea></label>
      <label class="community-field">Icon URL<input name="icon_url" type="url" maxlength="2048" placeholder="https://…"><span class="community-field-hint">Or upload an image below.</span></label>
      <label class="community-field">Upload icon<input name="icon_file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label>
      <fieldset class="community-field" style="border:0;padding:0"><legend>Privacy</legend><div class="community-choice-row">
        <label class="community-choice"><input type="radio" name="privacy" value="public" checked><span><strong>Public</strong><small>Anyone can discover and join.</small></span></label>
        <label class="community-choice"><input type="radio" name="privacy" value="invite_only"><span><strong>Invite-only</strong><small>Join with a link or direct invite.</small></span></label>
      </div></fieldset>
      <div class="community-modal-actions"><button class="community-button" type="button" data-action="close-dialog">Cancel</button><button class="community-button primary" type="submit">Create community</button></div>
    </form>
  </dialog>
  <dialog id="community-settings-dialog" class="community-modal"><div class="community-modal-content" id="community-settings-content"></div></dialog>
  <dialog id="community-invite-dialog" class="community-modal"><div class="community-modal-content" id="community-invite-content"></div></dialog>
  <dialog id="community-reports-dialog" class="community-modal community-reports-modal"><div class="community-modal-content" id="community-reports-content"></div></dialog>`;
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
  app.querySelectorAll(".community-filter").forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      renderDirectory();
    });
  });
  app.querySelector("#community-group-list").addEventListener("click", (event) => {
    const row = event.target.closest("[data-group]");
    if (row) selectGroup(row.dataset.group).catch(showError);
  });
  app.querySelector("#community-create")?.addEventListener("click", () => app.querySelector("#community-create-dialog").showModal());
  app.querySelector("#community-create-dialog").addEventListener("click", (event) => {
    if (event.target.closest('[data-action="close-dialog"]')) {
      app.querySelector("#community-create-dialog").close();
    }
  });
  app.querySelector("#community-create-form").addEventListener("submit", createGroup);
  app.querySelector("#community-use-invite").addEventListener("click", useInvitePrompt);
  app.querySelector("#community-direct-invites").addEventListener("click", () => openDirectInvites().catch(showError));
  app.querySelector("#community-moderation")?.addEventListener("click", () => openGroupReports().catch(showError));
  app.querySelector("#community-chat").addEventListener("click", handleChatAction);
  app.querySelector("#community-chat").addEventListener("submit", sendMessage);
  app.querySelector("#community-chat").addEventListener("input", (event) => {
    if (event.target.matches("#community-message-search")) {
      messageQuery = event.target.value;
      renderMessages();
    }
  });
  app.querySelector("#community-chat").addEventListener("change", (event) => {
    if (event.target.matches("#community-attachment")) {
      const file = event.target.files?.[0];
      const preview = app.querySelector("#community-attachment-preview");
      if (preview) {
        preview.hidden = !file;
        preview.textContent = file ? `${file.name} · ${formatBytes(file.size)} (click attachment icon to change)` : "";
      }
    }
  });
  app.querySelector("#community-chat").addEventListener("keydown", (event) => {
    if (event.target.matches("#community-compose textarea") && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.target.closest("form").requestSubmit();
    }
  });
}

function showError(error) {
  console.error("Community action failed.", error);
  showNotice(error.message || "That community action failed. Please try again.", "error");
}

async function loadGroups() {
  const [groupResult, membershipResult, inviteResult] = await Promise.all([
    db.from("groups")
      .select("id,creator_id,name,description,icon_url,privacy,is_permanent,status,created_at")
      .eq("status", "active")
      .order("is_permanent", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
    db.from("group_members").select("group_id,role,status").eq("user_id", currentUser.id),
    db.from("group_invites").select("id,group_id,created_at,expires_at")
      .eq("invitee_user_id", currentUser.id).is("revoked_at", null).eq("use_count", 0)
      .order("created_at", { ascending: false }).limit(50),
  ]);
  if (groupResult.error) throw groupResult.error;
  if (membershipResult.error) throw membershipResult.error;
  if (inviteResult.error) throw inviteResult.error;
  groups = groupResult.data || [];
  memberships = new Map((membershipResult.data || []).map((membership) => [membership.group_id, membership]));
  pendingInvites = (inviteResult.data || []).filter((invite) => !invite.expires_at || new Date(invite.expires_at) > new Date());
  if (!groups.some((group) => group.id === activeGroupId && isMember(group.id))) {
    activeGroupId = groups.find((group) => isMember(group.id))?.id || null;
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
  const messageList = app.querySelector("#community-messages");
  if (messageList) messageList.scrollTop = messageList.scrollHeight;
}

async function loadMessages() {
  const group = activeGroup();
  if (!group || !isMember(group.id)) {
    messages = [];
    return;
  }
  const { data, error } = await db.from("group_messages")
    .select("id,group_id,sender_id,body,created_at")
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
    for (const attachment of attachmentRows || []) {
      const { data: signed, error: signedError } = await db.storage.from("group-attachments").createSignedUrl(attachment.storage_object_path, 300);
      if (signedError) throw signedError;
      const values = byMessage.get(attachment.message_id) || [];
      values.push({ url: signed.signedUrl, file_name: attachment.storage_object_path.split("/").pop() });
      byMessage.set(attachment.message_id, values);
    }
    messages = rows.map((row) => ({ ...row, attachments: byMessage.get(row.id) || [] }));
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
  realtimeChannel = db.channel(`community:${group.id}`, {
    config: { presence: { key: currentUser.id } },
  });
  realtimeChannel
    .on("postgres_changes", { event: "*", schema: "public", table: "group_messages", filter: `group_id=eq.${group.id}` }, (payload) => {
      const row = payload.new;
      if (!row?.id) return;
      if (payload.eventType === "DELETE") {
        messages = messages.filter((message) => message.id !== payload.old.id);
      } else if (row.status !== "visible") {
        messages = messages.filter((message) => message.id !== row.id);
      } else if (!messages.some((message) => message.id === row.id)) {
        messages.push({ ...row, attachments: [] });
      } else {
        messages = messages.map((message) => message.id === row.id ? { ...message, ...row } : message);
      }
      renderMessages(true);
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
    .on("presence", { event: "sync" }, () => {
      const presence = realtimeChannel.presenceState();
      const others = Object.values(presence).flat().filter((entry) => entry.user_id !== currentUser.id && entry.typing);
      const typing = app.querySelector("#community-typing");
      if (typing) typing.textContent = others.length ? `${others.length === 1 ? "Someone is" : "People are"} typing…` : "";
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await realtimeChannel.track({ user_id: currentUser.id, typing: false });
      }
    });
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
    activeFilter = "joined";
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
    if (action === "join-group") await joinPublicGroup(group.id);
    if (action === "leave-group") await leaveGroup(group.id);
    if (action === "search-messages") {
      const input = app.querySelector("#community-message-search");
      input.hidden = !input.hidden;
      if (!input.hidden) input.focus();
      else { input.value = ""; messageQuery = ""; renderMessages(); }
    }
    if (action === "report-group") await reportTarget(group.id, null);
    if (action === "report-message") await reportTarget(group.id, button.dataset.messageId);
    if (action === "manage-group") await openSettings(group);
    if (action === "invite") await openInvites(group);
    if (action === "insert-emoji") {
      const textarea = app.querySelector("#community-compose textarea");
      textarea.value += " 🙂";
      textarea.focus();
    }
    if (action === "close-dialog") button.closest("dialog").close();
  } catch (error) {
    showError(error);
  }
}

async function joinPublicGroup(groupId) {
  const { error } = await db.rpc("join_public_group", { p_group_id: groupId });
  if (error) throw error;
  showNotice("You joined the community.");
  activeFilter = "joined";
  await loadGroups();
  await selectGroup(groupId);
}

async function leaveGroup(groupId) {
  if (!window.confirm("Leave this community? You can rejoin public communities later.")) return;
  const { error } = await db.rpc("leave_group", { p_group_id: groupId });
  if (error) throw error;
  showNotice("You left the community.");
  activeGroupId = null;
  await loadGroups();
  if (activeGroupId) await selectGroup(activeGroupId);
}

async function useInvitePrompt() {
  const inviteUrl = window.prompt("Paste the community invite link:");
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
    activeFilter = "joined";
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
  activeFilter = "joined";
  await loadGroups();
  const groupId = typeof data === "string" ? data : data?.group_id;
  if (groupId) await selectGroup(groupId);
}

async function reportTarget(groupId, messageId) {
  const reason = window.prompt("Report reason: harassment, spam, unsafe, or other", "other");
  if (!reason) return;
  const normalizedReason = reason.trim().toLowerCase();
  if (!["harassment", "spam", "unsafe", "other"].includes(normalizedReason)) throw new Error("Choose harassment, spam, unsafe, or other.");
  const details = window.prompt("Add details for the moderation team (optional):", "") || "";
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
        const confirmation = window.confirm(`Permanently delete "${group.name}" and all of its messages, members, and invitations? This cannot be undone.`);
        if (!confirmation) return;
        button.disabled = true;
        await removeCommunityStorageFiles(group);
        const { error } = await db.rpc("delete_community", { p_group_id: group.id });
        if (error) throw error;
        dialog.close();
        activeGroupId = null;
        messages = [];
        activeFilter = "joined";
        await loadGroups();
        if (activeGroupId) await selectGroup(activeGroupId);
        showNotice("Community deleted.");
      }
      if (button.dataset.action === "toggle-permanent") {
        const permanent = !group.is_permanent;
        const confirmation = permanent
          ? "Make this community permanent? It becomes public and every existing and future account will be automatically joined."
          : "Remove permanent status? Existing members remain joined, but future users will not be auto-joined.";
        if (!window.confirm(confirmation)) return;
        const { error } = await db.rpc("admin_set_group_permanent", { p_group_id: group.id, p_is_permanent: permanent });
        if (error) throw error;
        dialog.close();
        activeFilter = "joined";
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
        if (!window.confirm("Transfer community ownership? You will become an admin.")) return;
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
        activeFilter = "joined";
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
  const form = event.target.closest("#community-compose");
  if (!form) return;
  event.preventDefault();
  const group = activeGroup();
  if (!group || !isMember(group.id)) return;
  const submit = form.querySelector('[type="submit"]');
  const body = form.elements.body.value.trim();
  const fileInput = form.querySelector("#community-attachment");
  const file = fileInput.files?.[0];
  if (!body && !file) return;
  if (file && file.size > 50 * 1024 * 1024) {
    showNotice("Attachments must be 50 MB or smaller.", "error");
    return;
  }
  submit.disabled = true;
  try {
    const { data: message, error } = await db.from("group_messages").insert({
      group_id: group.id,
      sender_id: currentUser.id,
      body,
    }).select("id,group_id,sender_id,body,created_at").single();
    if (error) throw error;
    if (file) {
      try {
        const path = `${currentUser.id}/${group.id}/${message.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
        const { error: uploadError } = await db.storage.from("group-attachments").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
        if (uploadError) throw uploadError;
        const { error: metadataError } = await db.from("group_message_attachments").insert({
          group_id: group.id,
          message_id: message.id,
          uploader_id: currentUser.id,
          storage_object_path: path,
          mime_type: file.type || "application/octet-stream",
          byte_size: file.size,
        });
        if (metadataError) throw metadataError;
      } catch (error) {
        form.reset();
        await loadMessages();
        showNotice(`Message sent, but its attachment could not be saved: ${error.message}`, "error");
        return;
      }
    }
    form.reset();
    const preview = app.querySelector("#community-attachment-preview");
    if (preview) { preview.hidden = true; preview.textContent = ""; }
    await loadMessages();
  } catch (error) {
    showError(error);
  } finally {
    submit.disabled = false;
  }
}

async function notifyTyping(typing) {
  if (!realtimeChannel) return;
  await realtimeChannel.track({ user_id: currentUser.id, typing });
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
  await acceptInviteFromUrl();
  if (activeGroupId && isMember(activeGroupId)) {
    await loadMessages();
    await subscribeToGroup();
  }
  const chat = app.querySelector("#community-chat");
  chat.addEventListener("input", (event) => {
    if (event.target.matches("#community-compose textarea")) {
      notifyTyping(true).catch(showError);
      window.clearTimeout(typingTimer);
      typingTimer = window.setTimeout(() => notifyTyping(false).catch(showError), 1200);
    }
  });
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
