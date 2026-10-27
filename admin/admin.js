import { SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_EMAILS } from "../js/config.js";

const app = document.querySelector("#admin-app");
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]));

let db;
let user;

function render(content) {
  app.innerHTML = content;
  window.lucide?.createIcons();
}

function fail(message) {
  render(`<section class="theme-card admin-access-card"><span class="admin-panel-icon"><i data-lucide="shield-check" class="h-5 w-5"></i></span><p class="admin-eyebrow">SITE MANAGEMENT</p><h1>Admin panel</h1><p class="admin-access-message">${escapeHtml(message)}</p><p class="admin-access-detail">Admin access is restricted by the email allowlist in js/config.js and Supabase row-level security. Do not put a service-role key in browser code.</p><a class="admin-action" href="../index.html">Return to site <span aria-hidden="true">→</span></a></section>`);
}

function setPublishStatus(message, kind = "info") {
  const element = document.querySelector("#publish-status");
  if (!element) return;
  element.textContent = message;
  element.className = `text-sm ${kind === "error" ? "text-red-600" : "text-[#666]"}`;
}

function safeFileName(name) {
  return name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-120) || "file";
}

async function uploadUpdateFile(file, folder) {
  if (file.size > 50 * 1024 * 1024) {
    throw new Error(`${file.name} is larger than the 50 MB upload limit.`);
  }
  const path = `updates/${folder}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error } = await db.storage.from("update-files").upload(path, file, {
    contentType: file.type || "application/octet-stream",
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  return { path, url: db.storage.from("update-files").getPublicUrl(path).data.publicUrl };
}

async function load() {
  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  user = data.session?.user;
  if (!user) {
    fail("Please sign in on the account page first.");
    return;
  }
  if (!ADMIN_EMAILS.some((email) => email && email !== "replace-with-your-email@example.com" && email.toLowerCase() === String(user.email).toLowerCase())) {
    fail("This account is not in ADMIN_EMAILS. Add your owner email to js/config.js, then refresh.");
    return;
  }

  const [updates, stats, views] = await Promise.all([
    db.from("site_updates").select("id,title,published,created_at").order("created_at", { ascending: false }).limit(100),
    db.from("site_analytics").select("id,event_type,device_type,region,created_at").eq("event_type", "page_view").order("created_at", { ascending: false }).limit(1000),
    db.from("site_analytics").select("id", { count: "exact", head: true }).eq("event_type", "page_view"),
  ]);
  const firstError = [updates, stats, views].find((result) => result.error);
  if (firstError) throw firstError.error;

  const all = stats.data || [];
  const count = views.count || 0;
  const devices = {};
  const regions = {};
  all.forEach((event) => {
    const device = event.device_type || "Unknown";
    const region = event.region || "Unknown";
    devices[device] = (devices[device] || 0) + 1;
    regions[region] = (regions[region] || 0) + 1;
  });
  const ranking = (items) => Object.entries(items).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([key, value]) => `<li class="flex justify-between gap-3 py-2"><span>${escapeHtml(key)}</span><strong>${value}</strong></li>`)
    .join("") || "<li>No data yet</li>";

  render(`<section class="admin-page space-y-6">
    <header class="admin-heading">
      <div><p class="admin-eyebrow">SITE MANAGEMENT</p><h1>Admin panel</h1><p>Publish announcements and review aggregate traffic.</p><span class="admin-account"><i data-lucide="user-round" class="h-4 w-4"></i>${escapeHtml(user.email)}</span></div>
      <button id="refresh" class="admin-refresh" type="button"><i data-lucide="refresh-cw" class="h-4 w-4"></i>Refresh data</button>
    </header>
    <div class="admin-metrics">
      <article class="admin-metric-card"><span class="admin-metric-icon"><i data-lucide="eye" class="h-5 w-5"></i></span><p>Recorded page views</p><strong>${count}</strong><span>All-time total</span></article>
      <article class="admin-metric-card"><span class="admin-metric-icon"><i data-lucide="megaphone" class="h-5 w-5"></i></span><p>Updates published</p><strong>${(updates.data || []).filter((item) => item.published).length}</strong><span>Visible to visitors</span></article>
      <article class="admin-metric-card"><span class="admin-metric-icon"><i data-lucide="activity" class="h-5 w-5"></i></span><p>Recent events loaded</p><strong>${all.length}</strong><span>Latest 1,000 page views</span></article>
    </div>
    <div class="admin-dashboard-grid">
      <form id="publish" class="theme-card admin-panel admin-publish-form">
        <div class="admin-panel-heading"><span class="admin-panel-icon"><i data-lucide="send" class="h-5 w-5"></i></span><div><h2>Publish an update</h2><p>Share a new announcement with your visitors.</p></div></div>
        <label class="grid gap-1 text-sm font-medium">Title<input name="title" class="theme-control px-3 py-2" maxlength="160" required></label>
        <label class="grid gap-1 text-sm font-medium">Text / message<textarea name="body" class="theme-control px-3 py-2" rows="5" maxlength="10000" placeholder="Optional if you attach an image or file"></textarea></label>
        <label class="grid gap-1 text-sm font-medium">Upload update image (optional)<input name="image_file" type="file" accept="image/*" class="theme-control px-3 py-2"><span class="text-xs font-normal text-[#666]">Images are stored in the public update-files bucket (50 MB maximum).</span></label>
        <label class="grid gap-1 text-sm font-medium">Or use an image URL<input name="image_url" type="url" class="theme-control px-3 py-2" placeholder="https://…"></label>
        <label class="grid gap-1 text-sm font-medium">Upload an attachment (optional)<input name="attachment_file" type="file" class="theme-control px-3 py-2"><span class="text-xs font-normal text-[#666]">Any file type; visitors can open or download it from the update.</span></label>
        <label class="grid gap-1 text-sm font-medium">Or use an attachment URL<input name="attachment_url" type="url" class="theme-control px-3 py-2" placeholder="https://…"></label>
        <label class="grid gap-1 text-sm font-medium">Attachment name<input name="attachment_name" class="theme-control px-3 py-2" maxlength="180" placeholder="Download notes.pdf"></label>
        <label class="flex items-center gap-2 text-sm"><input name="published" type="checkbox" checked> Publish immediately</label>
        <p id="publish-status" class="text-sm" role="status" aria-live="polite"></p>
        <button class="accent-button rounded-lg px-4 py-2 font-semibold" type="submit">Publish update</button>
        <p class="text-xs text-[#777]">Uploaded files are stored in Supabase Storage. Run supabase-storage.sql once to create the buckets and secure upload policies.</p>
      </form>
      <div class="admin-traffic-panels"><section class="theme-card admin-panel"><div class="admin-panel-heading"><span class="admin-panel-icon"><i data-lucide="monitor-smartphone" class="h-5 w-5"></i></span><div><h2>Traffic by device</h2><p>Devices in recent page views.</p></div></div><ul class="admin-ranking">${ranking(devices)}</ul></section><section class="theme-card admin-panel"><div class="admin-panel-heading"><span class="admin-panel-icon"><i data-lucide="map-pinned" class="h-5 w-5"></i></span><div><h2>Traffic by region</h2><p>Coarse visitor regions.</p></div></div><ul class="admin-ranking">${ranking(regions)}</ul></section></div>
    </div>
    <section class="theme-card admin-panel admin-table-panel"><div class="admin-panel-heading"><span class="admin-panel-icon"><i data-lucide="file-text" class="h-5 w-5"></i></span><div><h2>Updates database</h2><p>Manage published updates and drafts.</p></div></div><div class="overflow-x-auto"><table class="admin-table w-full text-left text-sm"><thead><tr><th class="p-3">Title</th><th class="p-3">Created</th><th class="p-3">Status</th><th class="p-3">Action</th></tr></thead><tbody>${(updates.data || []).map((item) => `<tr class="border-t border-slate-200"><td class="p-3 font-medium">${escapeHtml(item.title)}</td><td class="p-3">${escapeHtml(new Date(item.created_at).toLocaleString())}</td><td class="p-3"><span class="admin-status ${item.published ? "is-published" : "is-draft"}">${item.published ? "Published" : "Draft"}</span></td><td class="p-3"><button class="toggle-publish admin-action" data-id="${escapeHtml(item.id)}" data-published="${item.published ? "true" : "false"}">${item.published ? "Unpublish" : "Publish"}</button></td></tr>`).join("") || '<tr><td colspan="4" class="p-4">No updates created.</td></tr>'}</tbody></table></div></section>
    <section class="theme-card admin-panel admin-table-panel"><div class="admin-panel-heading"><span class="admin-panel-icon"><i data-lucide="chart-no-axes-column-increasing" class="h-5 w-5"></i></span><div><h2>Recent page views</h2><p>This table stores timestamp, page path, device category and coarse region only; it does not collect exact GPS coordinates.</p></div></div><div class="overflow-x-auto"><table class="admin-table w-full text-left text-sm"><thead><tr><th class="p-2">Time</th><th class="p-2">Device</th><th class="p-2">Region</th></tr></thead><tbody>${all.slice(0, 30).map((event) => `<tr class="border-t border-slate-200"><td class="p-2">${escapeHtml(new Date(event.created_at).toLocaleString())}</td><td class="p-2">${escapeHtml(event.device_type || "Unknown")}</td><td class="p-2">${escapeHtml(event.region || "Unknown")}</td></tr>`).join("") || '<tr><td colspan="3" class="p-3">No analytics recorded yet.</td></tr>'}</tbody></table></div></section>
  </section>`);

  document.querySelector("#refresh").onclick = () => load().catch((loadError) => fail(loadError.message));
  document.querySelector("#publish").onsubmit = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = String(form.get("body") || "").trim();
    let imageUrl = String(form.get("image_url") || "").trim() || null;
    let attachmentUrl = String(form.get("attachment_url") || "").trim() || null;
    let attachmentName = String(form.get("attachment_name") || "").trim() || null;
    const uploadedPaths = [];
    const imageFile = form.get("image_file");
    const attachmentFile = form.get("attachment_file");
    let updateSaved = false;

    if (!body && !imageUrl && !attachmentUrl && !imageFile?.size && !attachmentFile?.size) {
      setPublishStatus("Add text, an image, or an attachment.", "error");
      return;
    }

    const submitButton = formElement.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
      if (imageFile?.size) {
        setPublishStatus("Uploading update image…");
        const uploaded = await uploadUpdateFile(imageFile, "images");
        uploadedPaths.push(uploaded.path);
        imageUrl = uploaded.url;
      }
      if (attachmentFile?.size) {
        setPublishStatus("Uploading attachment…");
        const uploaded = await uploadUpdateFile(attachmentFile, "attachments");
        uploadedPaths.push(uploaded.path);
        attachmentUrl = uploaded.url;
        if (!attachmentName) attachmentName = attachmentFile.name;
      }
      const { error } = await db.from("site_updates").insert({
        title: String(form.get("title")).trim(),
        body: body || null,
        image_url: imageUrl,
        attachment_url: attachmentUrl,
        attachment_name: attachmentName,
        published: form.get("published") === "on",
        created_by: user.id,
      });
      if (error) throw error;
      updateSaved = true;
      setPublishStatus("Update saved.");
      formElement.reset();
      try {
        await load();
      } catch (refreshError) {
        fail(`Update saved, but the admin panel could not refresh: ${refreshError.message}`);
      }
    } catch (publishError) {
      if (!updateSaved && uploadedPaths.length) {
        const { error: cleanupError } = await db.storage.from("update-files").remove(uploadedPaths);
        if (cleanupError) {
          setPublishStatus(`${publishError.message} Uploaded files could not be cleaned up: ${cleanupError.message}`, "error");
          return;
        }
      }
      setPublishStatus(publishError.message, "error");
    } finally {
      const button = document.querySelector('#publish button[type="submit"]');
      if (button) button.disabled = false;
    }
  };

  document.querySelectorAll(".toggle-publish").forEach((button) => {
    button.onclick = async () => {
      const { error } = await db.from("site_updates")
        .update({ published: button.dataset.published !== "true" })
        .eq("id", button.dataset.id);
      if (error) window.alert(error.message);
      else load().catch((loadError) => fail(loadError.message));
    };
  });
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  fail("Supabase is not configured.");
} else {
  const script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  script.onload = () => {
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    load().catch((error) => fail(error.message));
  };
  script.onerror = () => fail("Could not load Supabase client.");
  document.head.append(script);
}
