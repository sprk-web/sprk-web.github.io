import { escapeHtml, formatDate, renderAdminNavigation, requireAdmin, showAdminError } from "../admin-common.js";
import { confirmDialog } from "../../js/dialogs.js";
import { PRESET_PROFILE_IMAGES } from "../../js/profile-images.js";

const app = document.querySelector("#admin-app");
let context;
let communities = [];
let iconPreviewUrl = null;
let selectedPresetIcon = null;

function render() {
  app.innerHTML = `<section class="admin-page space-y-6">
    <h1 class="sr-only">Manage communities</h1>
    ${renderAdminNavigation("communities", context.user.email)}
    <div class="admin-page-actions"><button id="communities-refresh" class="admin-refresh" type="button"><i data-lucide="refresh-cw" class="h-4 w-4"></i>Refresh</button></div>
    <div id="communities-feedback" class="admin-form-status" role="status" aria-live="polite" hidden></div>
    <div class="admin-update-layout">
      <form id="community-form" class="theme-card admin-panel admin-publish-form">
        <div class="admin-panel-heading"><span class="admin-panel-icon"><i data-lucide="users-round" class="h-5 w-5"></i></span><div><h2 id="community-form-title">Create a community</h2><p>All communities are public study forums.</p></div></div>
        <input name="id" type="hidden">
        <label class="grid gap-1 text-sm font-medium">Name<input name="name" class="theme-control px-3 py-2" required minlength="2" maxlength="80"></label>
        <label class="grid gap-1 text-sm font-medium">Description<textarea name="description" class="theme-control px-3 py-2" rows="4" maxlength="2000"></textarea></label>
        <label class="grid gap-1 text-sm font-medium">Community profile picture<input name="icon_file" class="theme-control px-3 py-2" type="file" accept="image/png,image/jpeg,image/webp,image/gif"><span class="text-xs text-[#777]">PNG, JPEG, WebP, or GIF; maximum 5 MB. Uploading a picture replaces the current icon URL.</span></label>
        <div id="community-icon-preview" class="flex items-center gap-3" aria-live="polite"></div>
        <fieldset class="community-preset-fieldset"><legend>Or choose a default picture</legend><div class="image-preset-grid">${PRESET_PROFILE_IMAGES.map(({ label, url }) => `<button class="image-preset-option" type="button" data-preset-icon="${escapeHtml(url)}" aria-label="${label}" aria-pressed="${selectedPresetIcon === url}"><img src="${escapeHtml(url)}" alt=""><span>${label}</span></button>`).join("")}</div></fieldset>
        <label class="grid gap-1 text-sm font-medium">Or use an image URL<input name="icon_url" class="theme-control px-3 py-2" type="url" maxlength="2048" placeholder="https://…"></label>
        <div class="flex flex-wrap gap-2"><button class="accent-button rounded-lg px-4 py-2 font-semibold" type="submit">Create community</button><button id="community-cancel-edit" class="admin-secondary-button" type="button" hidden>Cancel editing</button></div>
        <p class="text-xs text-[#777]">Members can join and reply to study topics. Only site administrators can create, edit, or delete communities.</p>
      </form>
      <section class="theme-card admin-panel admin-table-panel">
        <div class="admin-panel-heading"><span class="admin-panel-icon"><i data-lucide="library" class="h-5 w-5"></i></span><div><h2>Community directory</h2><p>Showing up to ${communities.length} communities.</p></div></div>
        <div class="admin-list-controls"><label class="admin-search"><i data-lucide="search" class="h-4 w-4"></i><input id="community-search" type="search" placeholder="Search communities" aria-label="Search communities"></label></div>
        <div class="overflow-x-auto"><table class="admin-table w-full text-left text-sm"><thead><tr><th class="p-3">Community</th><th class="p-3">Created</th><th class="p-3">Status</th><th class="p-3">Actions</th></tr></thead><tbody id="communities-table-body">${rowsMarkup(communities)}</tbody></table></div>
      </section>
    </div>
  </section>`;
  window.lucide?.createIcons();
  app.querySelector("#community-form").addEventListener("submit", saveCommunity);
  app.querySelector("#community-form").elements.icon_file.addEventListener("change", previewSelectedIcon);
  app.querySelector("#community-form").elements.icon_url.addEventListener("input", previewIconUrl);
  app.querySelectorAll("[data-preset-icon]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedPresetIcon = button.dataset.presetIcon;
      const form = app.querySelector("#community-form");
      form.elements.icon_file.value = "";
      form.elements.icon_url.value = "";
      clearIconPreview();
      renderIconPreview(selectedPresetIcon, "Selected default picture");
      updatePresetIconSelection();
    });
  });
  app.querySelector("#community-cancel-edit").addEventListener("click", resetEditor);
  app.querySelector("#communities-table-body").addEventListener("click", handleRowAction);
  app.querySelector("#communities-refresh").addEventListener("click", () => loadCommunities().catch(showLoadError));
  app.querySelector("#community-search").addEventListener("input", applyFilter);
}

function rowsMarkup(rows) {
  return rows.map((community) => `<tr class="border-t border-slate-200">
    <td class="p-3"><strong>${escapeHtml(community.name)}</strong><small class="block text-slate-500">${escapeHtml(community.description || "No description")}</small></td>
    <td class="p-3">${escapeHtml(formatDate(community.created_at))}</td>
    <td class="p-3"><span class="admin-status ${community.status === "active" ? "is-published" : "is-draft"}">${escapeHtml(community.status)}</span></td>
    <td class="p-3"><div class="admin-row-actions"><button class="admin-action" type="button" data-action="edit" data-id="${escapeHtml(community.id)}">Edit</button><button class="admin-action admin-danger-action" type="button" data-action="delete" data-id="${escapeHtml(community.id)}">Delete</button></div></td>
  </tr>`).join("") || '<tr><td colspan="4" class="p-4">No communities yet.</td></tr>';
}

function applyFilter() {
  const query = app.querySelector("#community-search").value.trim().toLowerCase();
  const matches = communities.filter((community) => `${community.name} ${community.description}`.toLowerCase().includes(query));
  app.querySelector("#communities-table-body").innerHTML = rowsMarkup(matches);
}

function showFeedback(message, isError = false) {
  const region = app.querySelector("#communities-feedback");
  if (!region) return;
  region.textContent = message;
  region.dataset.kind = isError ? "error" : "success";
  region.hidden = false;
}

function resetEditor() {
  const form = app.querySelector("#community-form");
  clearIconPreview();
  form.reset();
  form.elements.id.value = "";
  selectedPresetIcon = null;
  app.querySelector("#community-icon-preview").replaceChildren();
  app.querySelector("#community-form-title").textContent = "Create a community";
  form.querySelector('[type="submit"]').textContent = "Create community";
  app.querySelector("#community-cancel-edit").hidden = true;
}

function updatePresetIconSelection() {
  app.querySelectorAll("[data-preset-icon]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.presetIcon === selectedPresetIcon));
  });
}

function clearIconPreview() {
  if (iconPreviewUrl) URL.revokeObjectURL(iconPreviewUrl);
  iconPreviewUrl = null;
}

function renderIconPreview(url, label) {
  const preview = app.querySelector("#community-icon-preview");
  if (!preview) return;
  preview.innerHTML = url
    ? `<img src="${escapeHtml(url)}" alt="" class="h-12 w-12 rounded-full border border-slate-200 object-cover"><span class="text-xs text-[#777]">${escapeHtml(label)}</span>`
    : "";
}

function previewSelectedIcon(event) {
  clearIconPreview();
  const file = event.currentTarget.files?.[0];
  if (!file) {
    previewIconUrl();
    return;
  }
  selectedPresetIcon = null;
  updatePresetIconSelection();
  iconPreviewUrl = URL.createObjectURL(file);
  renderIconPreview(iconPreviewUrl, file.name);
}

function previewIconUrl() {
  const url = app.querySelector("#community-form").elements.icon_url.value.trim();
  if (!app.querySelector("#community-form").elements.icon_file.files?.length) {
    if (url) {
      selectedPresetIcon = null;
      updatePresetIconSelection();
    }
    renderIconPreview(url, url ? "URL preview" : "");
  }
}

function iconExtension(file) {
  const extensions = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  if (!extensions[file.type]) throw new Error("Choose a PNG, JPEG, WebP, or GIF image.");
  if (file.size > 5 * 1024 * 1024) throw new Error("The community picture must be 5 MB or smaller.");
  return extensions[file.type];
}

async function saveCommunity(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  const values = new FormData(form);
  const id = String(values.get("id") || "");
  const image = values.get("icon_file");
  const oldCommunity = id ? communities.find((community) => community.id === id) : null;
  const oldIconPath = oldCommunity ? communityIconPath(oldCommunity) : null;
  const uploadedImage = image instanceof File && image.size > 0;
  const payload = {
    name: String(values.get("name") || "").trim(),
    description: String(values.get("description") || "").trim(),
    icon_url: uploadedImage ? oldCommunity?.icon_url || null : String(values.get("icon_url") || "").trim() || selectedPresetIcon || null,
    privacy: "public",
  };
  button.disabled = true;
  let saved = false;
  let iconSaved = false;
  try {
    const extension = uploadedImage ? iconExtension(image) : null;
    const result = id
      ? await context.db.from("groups").update(payload).eq("id", id).select("id").maybeSingle()
      : await context.db.from("groups").insert({ ...payload, creator_id: context.user.id }).select("id").single();
    if (result.error) throw result.error;
    if (id && !result.data) throw new Error("Community was not found or you do not have permission to edit it.");
    saved = true;
    if (uploadedImage) {
      const path = `${context.user.id}/${result.data.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await context.db.storage.from("community-icons").upload(path, image, {
        contentType: image.type,
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const { data: publicUrl } = context.db.storage.from("community-icons").getPublicUrl(path);
      const { error: iconError } = await context.db.from("groups")
        .update({ icon_url: publicUrl.publicUrl })
        .eq("id", result.data.id);
      if (iconError) {
        const { error: cleanupError } = await context.db.storage.from("community-icons").remove([path]);
        if (cleanupError) throw new Error(`${iconError.message}; uploaded image cleanup failed: ${cleanupError.message}`);
        throw iconError;
      }
      iconSaved = true;
      if (oldIconPath && oldIconPath !== path) {
        const { error: removeError } = await context.db.storage.from("community-icons").remove([oldIconPath]);
        if (removeError) throw removeError;
      }
    } else if (oldIconPath && payload.icon_url !== oldCommunity.icon_url) {
      const { error: removeError } = await context.db.storage.from("community-icons").remove([oldIconPath]);
      if (removeError) throw removeError;
    }
    resetEditor();
    await loadCommunities();
    showFeedback(id ? "Community updated." : "Community created.");
  } catch (error) {
    const message = saved && uploadedImage && !iconSaved
      ? "Community saved, but its picture could not be uploaded"
      : saved
        ? "Community saved, but the list or old picture could not be refreshed"
        : "Could not save community";
    showFeedback(`${message}: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

function communityIconPath(community) {
  if (!community.icon_url) return null;
  try {
    const marker = "__community-icon-marker__";
    const markerUrl = new URL(context.db.storage.from("community-icons").getPublicUrl(marker).data.publicUrl);
    const iconUrl = new URL(community.icon_url);
    const prefix = markerUrl.pathname.slice(0, -marker.length);
    if (iconUrl.origin !== markerUrl.origin || !iconUrl.pathname.startsWith(prefix)) return null;
    const path = decodeURIComponent(iconUrl.pathname.slice(prefix.length));
    const [uploaderId, communityId] = path.split("/");
    if (communityId !== community.id || !/^[0-9a-f-]{36}$/i.test(uploaderId || "")) return null;
    return path;
  } catch {
    return null;
  }
}

async function removeCommunityFiles(community) {
  const paths = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await context.db.from("group_message_attachments")
      .select("storage_object_path").eq("group_id", community.id).range(offset, offset + 499);
    if (error) throw error;
    paths.push(...(data || []).map((attachment) => attachment.storage_object_path));
    if (!data || data.length < 500) break;
  }
  for (let offset = 0; offset < paths.length; offset += 100) {
    const { error } = await context.db.storage.from("group-attachments").remove(paths.slice(offset, offset + 100));
    if (error) throw error;
  }
  const iconPath = communityIconPath(community);
  if (iconPath) {
    const { error } = await context.db.storage.from("community-icons").remove([iconPath]);
    if (error) throw error;
  }
}

async function handleRowAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const community = communities.find((row) => row.id === button.dataset.id);
  if (!community) return;
  if (button.dataset.action === "edit") {
    const form = app.querySelector("#community-form");
    clearIconPreview();
    form.elements.id.value = community.id;
    form.elements.name.value = community.name;
    form.elements.description.value = community.description || "";
    form.elements.icon_url.value = community.icon_url || "";
    form.elements.icon_file.value = "";
    selectedPresetIcon = PRESET_PROFILE_IMAGES.find(({ url }) => url === community.icon_url)?.url || null;
    updatePresetIconSelection();
    renderIconPreview(community.icon_url, "Current picture");
    app.querySelector("#community-form-title").textContent = "Edit community";
    form.querySelector('[type="submit"]').textContent = "Save changes";
    app.querySelector("#community-cancel-edit").hidden = false;
    form.elements.name.focus();
    return;
  }
  if (!await confirmDialog(`Permanently delete "${community.name}" and all discussion posts and attachments? This cannot be undone.`, { title: "Delete community", confirmLabel: "Delete", danger: true })) return;
  button.disabled = true;
  let deleted = false;
  try {
    await removeCommunityFiles(community);
    const { error } = await context.db.rpc("delete_community", { p_group_id: community.id });
    if (error) throw error;
    deleted = true;
    await loadCommunities();
    showFeedback("Community and its discussion data deleted.");
  } catch (error) {
    showFeedback(`${deleted ? "Community deleted, but the list could not be refreshed" : "Could not delete community"}: ${error.message}`, true);
    if (button.isConnected) button.disabled = false;
  }
}

async function loadCommunities() {
  const { data, error } = await context.db.from("groups")
    .select("id,creator_id,name,description,icon_url,privacy,status,created_at")
    .order("created_at", { ascending: false }).limit(500);
  if (error) throw error;
  communities = data || [];
  render();
}

function showLoadError(error) {
  showAdminError(app, `Could not load communities: ${error.message}`);
}

async function initialize() {
  context = await requireAdmin(app);
  if (context) await loadCommunities();
}

initialize().catch(showLoadError);
