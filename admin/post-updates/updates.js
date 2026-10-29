import { SUPABASE_URL } from "../../js/config.js";
import { escapeHtml, formatDate, renderAdminNavigation, requireAdmin, showAdminError } from "../admin-common.js";

const app = document.querySelector("#admin-app");
let context;
let updates = [];

function setStatus(message, kind = "info") {
  const status = app.querySelector("#update-status");
  if (!status) return;
  status.textContent = message;
  status.dataset.kind = kind;
}

function formatFileSize(bytes) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
}

function syncUploadSelection(input) {
  const file = input.files?.[0];
  const selected = input.closest(".admin-upload-field").querySelector(".admin-upload-selected");
  selected.textContent = file ? `${file.name} · ${formatFileSize(file.size)}` : "No file selected";
  input.closest(".admin-upload-dropzone").dataset.selected = String(Boolean(file));
}

function render() {
  const visible = updates;
  app.innerHTML = `<section class="admin-page space-y-6">
    <h1 class="sr-only">Post updates</h1>
    ${renderAdminNavigation("updates", context.user.email)}
    <div class="admin-page-actions">
      <a class="admin-refresh" href="../../updates/"><i data-lucide="external-link" class="h-4 w-4"></i>View public updates</a>
    </div>
    <div class="admin-update-layout">
      <form id="update-form" class="theme-card admin-panel admin-publish-form">
        <div class="admin-panel-heading"><span class="admin-panel-icon"><i data-lucide="file-pen-line" class="h-5 w-5"></i></span><div><h2 id="editor-heading">Create an update</h2><p>Save a draft or publish it immediately.</p></div></div>
        <input name="id" type="hidden">
        <label class="grid gap-1 text-sm font-medium">Title<input name="title" class="theme-control px-3 py-2" maxlength="160" required></label>
        <label class="grid gap-1 text-sm font-medium">Category<select name="category" class="theme-control px-3 py-2"><option value="announcement">Announcement</option><option value="release">Release</option><option value="improvement">Improvement</option></select></label>
        <label class="grid gap-1 text-sm font-medium">Message<textarea name="body" class="theme-control px-3 py-2" rows="6" maxlength="10000" placeholder="Write an announcement for your visitors."></textarea></label>
        <label class="grid gap-1 text-sm font-medium">Image URL<input name="image_url" type="url" class="theme-control px-3 py-2" placeholder="https://…"></label>
        <div class="admin-upload-field">
          <span class="admin-upload-title">Upload image</span>
          <label class="admin-upload-dropzone">
            <input name="image_file" type="file" accept="image/*" aria-label="Upload an update image">
            <span class="admin-upload-icon"><i data-lucide="image-up" class="h-5 w-5"></i></span>
            <span class="admin-upload-copy"><strong>Choose an image</strong><small>JPG, PNG, GIF, SVG, or WebP · up to 50 MB</small></span>
            <span class="admin-upload-action">Browse</span>
          </label>
          <span class="admin-upload-selected" role="status">No file selected</span>
          <span class="admin-upload-hint">The uploaded image replaces the image URL.</span>
        </div>
        <label class="grid gap-1 text-sm font-medium">Attachment URL<input name="attachment_url" type="url" class="theme-control px-3 py-2" placeholder="https://…"></label>
        <div class="admin-upload-field">
          <span class="admin-upload-title">Upload attachment</span>
          <label class="admin-upload-dropzone">
            <input name="attachment_file" type="file" aria-label="Upload an update attachment">
            <span class="admin-upload-icon"><i data-lucide="file-up" class="h-5 w-5"></i></span>
            <span class="admin-upload-copy"><strong>Choose a file</strong><small>Documents, media, or other files · up to 50 MB</small></span>
            <span class="admin-upload-action">Browse</span>
          </label>
          <span class="admin-upload-selected" role="status">No file selected</span>
          <span class="admin-upload-hint">Any file type is supported.</span>
        </div>
        <label class="grid gap-1 text-sm font-medium">Attachment display name<input name="attachment_name" class="theme-control px-3 py-2" maxlength="180" placeholder="Download notes.pdf"></label>
        <label class="flex items-center gap-2 text-sm"><input name="published" type="checkbox" checked> Publish immediately</label>
        <p id="update-status" class="admin-form-status" role="status" aria-live="polite"></p>
        <div class="flex flex-wrap gap-2"><button class="accent-button rounded-lg px-4 py-2 font-semibold" type="submit">Save update</button><button id="cancel-edit" class="admin-secondary-button" type="button" hidden>Cancel editing</button></div>
        <p class="text-xs text-[#777]">Uploads require a configured <code>update-files</code> bucket and matching Supabase Storage policies. Never expose a service-role key in the browser.</p>
      </form>
      <section class="theme-card admin-panel admin-table-panel">
        <div class="admin-panel-heading"><span class="admin-panel-icon"><i data-lucide="newspaper" class="h-5 w-5"></i></span><div><h2>Updates library</h2><p>Showing the latest ${updates.length} of up to 500 updates.</p></div></div>
        <div class="admin-list-controls"><label class="admin-search"><i data-lucide="search" class="h-4 w-4"></i><input id="update-search" type="search" placeholder="Search title or message" aria-label="Search updates"></label><select id="update-filter" class="theme-control" aria-label="Filter by publishing status"><option value="all">All updates</option><option value="published">Published</option><option value="draft">Drafts</option></select></div>
        <div class="overflow-x-auto"><table class="admin-table w-full text-left text-sm"><thead><tr><th class="p-3">Update</th><th class="p-3">Created</th><th class="p-3">Status</th><th class="p-3">Actions</th></tr></thead><tbody id="updates-table-body"></tbody></table></div>
      </section>
    </div>
  </section>`;

  window.lucide?.createIcons();
  renderRows(visible);
  app.querySelector("#update-search").addEventListener("input", applyFilters);
  app.querySelector("#update-filter").addEventListener("change", applyFilters);
  app.querySelector("#update-form").addEventListener("submit", saveUpdate);
  app.querySelector("#update-form").addEventListener("change", (event) => {
    if (event.target.matches('input[type="file"]')) syncUploadSelection(event.target);
  });
  app.querySelector("#cancel-edit").addEventListener("click", resetEditor);
  app.querySelector("#updates-table-body").addEventListener("click", handleListAction);
}

function renderRows(items) {
  const body = app.querySelector("#updates-table-body");
  if (!body) return;
  body.innerHTML = items.map((item) => `<tr class="border-t border-slate-200">
    <td class="p-3"><strong>${escapeHtml(item.title || "Untitled update")}</strong>${item.body ? `<span class="admin-update-excerpt">${escapeHtml(item.body)}</span>` : ""}</td>
    <td class="p-3">${escapeHtml(formatDate(item.created_at))}</td>
    <td class="p-3"><span class="admin-status ${item.published ? "is-published" : "is-draft"}">${item.published ? "Published" : "Draft"}</span></td>
    <td class="p-3"><div class="admin-row-actions"><button class="admin-action" type="button" data-action="edit" data-id="${escapeHtml(item.id)}">Edit</button><button class="admin-action" type="button" data-action="toggle" data-id="${escapeHtml(item.id)}" data-published="${item.published ? "true" : "false"}">${item.published ? "Unpublish" : "Publish"}</button><button class="admin-action admin-danger-action" type="button" data-action="delete" data-id="${escapeHtml(item.id)}">Delete</button></div></td>
  </tr>`).join("") || '<tr><td colspan="4" class="p-4">No updates match these filters.</td></tr>';
}

function applyFilters() {
  const query = app.querySelector("#update-search").value.trim().toLowerCase();
  const filter = app.querySelector("#update-filter").value;
  const filtered = updates.filter((item) => {
    const matchesText = `${item.title || ""} ${item.body || ""}`.toLowerCase().includes(query);
    const matchesStatus = filter === "all" || (filter === "published" ? item.published : !item.published);
    return matchesText && matchesStatus;
  });
  renderRows(filtered);
}

function resetEditor() {
  const form = app.querySelector("#update-form");
  form.reset();
  form.elements.namedItem("id").value = "";
  app.querySelector("#editor-heading").textContent = "Create an update";
  form.querySelector('button[type="submit"]').textContent = "Save update";
  app.querySelector("#cancel-edit").hidden = true;
  app.querySelectorAll(".admin-upload-dropzone").forEach((dropzone) => {
    dropzone.dataset.selected = "false";
  });
  app.querySelectorAll(".admin-upload-selected").forEach((selected) => {
    selected.textContent = "No file selected";
  });
  setStatus("");
}

function editUpdate(id) {
  const item = updates.find((update) => String(update.id) === id);
  if (!item) return;
  const form = app.querySelector("#update-form");
  form.elements.namedItem("id").value = item.id;
  form.elements.title.value = item.title || "";
  form.elements.category.value = item.category || "announcement";
  form.elements.body.value = item.body || "";
  form.elements.image_url.value = item.image_url || "";
  form.elements.attachment_url.value = item.attachment_url || "";
  form.elements.attachment_name.value = item.attachment_name || "";
  form.elements.published.checked = Boolean(item.published);
  app.querySelector("#editor-heading").textContent = "Edit update";
  form.querySelector('button[type="submit"]').textContent = "Save changes";
  app.querySelector("#cancel-edit").hidden = false;
  setStatus("Editing an existing update. Leave its URL fields unchanged to keep the current media.");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function safeFileName(name) {
  return name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-120) || "file";
}

async function uploadFile(file, folder) {
  if (file.size > 50 * 1024 * 1024) throw new Error(`${file.name} is larger than the 50 MB upload limit.`);
  const path = `updates/${folder}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error } = await context.db.storage.from("update-files").upload(path, file, {
    contentType: file.type || "application/octet-stream",
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  return { path, url: context.db.storage.from("update-files").getPublicUrl(path).data.publicUrl };
}

async function saveUpdate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  const body = String(values.get("body") || "").trim();
  let imageUrl = String(values.get("image_url") || "").trim() || null;
  let attachmentUrl = String(values.get("attachment_url") || "").trim() || null;
  let attachmentName = String(values.get("attachment_name") || "").trim() || null;
  const imageFile = values.get("image_file");
  const attachmentFile = values.get("attachment_file");
  if (!body && !imageUrl && !attachmentUrl && !imageFile?.size && !attachmentFile?.size) {
    setStatus("Add a message, image, or attachment before saving.", "error");
    return;
  }

  const id = String(values.get("id") || "");
  const uploadedPaths = [];
  let saved = false;
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    if (imageFile?.size) {
      setStatus("Uploading image…");
      const uploaded = await uploadFile(imageFile, "images");
      uploadedPaths.push(uploaded.path);
      imageUrl = uploaded.url;
    }
    if (attachmentFile?.size) {
      setStatus("Uploading attachment…");
      const uploaded = await uploadFile(attachmentFile, "attachments");
      uploadedPaths.push(uploaded.path);
      attachmentUrl = uploaded.url;
      if (!attachmentName) attachmentName = attachmentFile.name;
    }
    const payload = {
      title: String(values.get("title") || "").trim(),
      category: String(values.get("category") || "announcement"),
      body: body || null,
      image_url: imageUrl,
      attachment_url: attachmentUrl,
      attachment_name: attachmentName,
      published: values.get("published") === "on",
    };
    const result = id
      ? await context.db.from("site_updates").update(payload).eq("id", id).select("id").maybeSingle()
      : await context.db.from("site_updates").insert({ ...payload, created_by: context.user.id });
    if (result.error) throw result.error;
    if (id && !result.data) throw new Error("The update could not be found or you do not have permission to edit it.");
    saved = true;
    resetEditor();
    try {
      await loadUpdates();
      setStatus(id ? "Update changes saved." : "Update created.");
    } catch (refreshError) {
      setStatus(`Update saved, but the list could not be refreshed: ${refreshError.message}`, "error");
    }
  } catch (error) {
    if (!saved && uploadedPaths.length) {
      const { error: cleanupError } = await context.db.storage.from("update-files").remove(uploadedPaths);
      if (cleanupError) {
        setStatus(`${error.message} Uploaded files could not be cleaned up: ${cleanupError.message}`, "error");
        submit.disabled = false;
        return;
      }
    }
    setStatus(error.message, "error");
  } finally {
    const currentSubmit = app.querySelector('#update-form button[type="submit"]');
    if (currentSubmit) currentSubmit.disabled = false;
  }
}

function storedFilePath(url) {
  try {
    const parsed = new URL(url);
    if (parsed.host !== new URL(SUPABASE_URL).host) return null;
    const marker = "/storage/v1/object/public/update-files/";
    const index = parsed.pathname.indexOf(marker);
    return index < 0 ? null : decodeURIComponent(parsed.pathname.slice(index + marker.length));
  } catch {
    return null;
  }
}

async function handleListAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const item = updates.find((update) => String(update.id) === button.dataset.id);
  if (!item) return;
  if (button.dataset.action === "edit") {
    editUpdate(button.dataset.id);
    return;
  }
  button.disabled = true;
  try {
    if (button.dataset.action === "toggle") {
      const { data, error } = await context.db.from("site_updates").update({ published: button.dataset.published !== "true" }).eq("id", item.id).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("The update could not be found or you do not have permission to change its status.");
      await loadUpdates();
    } else if (button.dataset.action === "delete" && window.confirm(`Delete “${item.title || "Untitled update"}”? This cannot be undone.`)) {
      const { data, error } = await context.db.from("site_updates").delete().eq("id", item.id).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("The update could not be found or you do not have permission to delete it.");
      const paths = [item.image_url, item.attachment_url].map(storedFilePath).filter(Boolean);
      let cleanupMessage = "";
      if (paths.length) {
        const { error: storageError } = await context.db.storage.from("update-files").remove([...new Set(paths)]);
        if (storageError) cleanupMessage = `Update deleted, but its stored files could not be removed: ${storageError.message}`;
      }
      await loadUpdates();
      if (cleanupMessage) setStatus(cleanupMessage, "error");
    }
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    button.disabled = false;
  }
}

async function loadUpdates() {
  const { data, error } = await context.db.from("site_updates")
    .select("id,title,body,image_url,attachment_url,attachment_name,category,published,created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  updates = data || [];
  render();
}

async function start() {
  context = await requireAdmin(app, "../../account/");
  if (!context) return;
  try {
    await loadUpdates();
  } catch (error) {
    showAdminError(app, `Could not load updates: ${error.message}`, "../../account/");
  }
}

start().catch((error) => showAdminError(app, error.message, "../../account/"));
