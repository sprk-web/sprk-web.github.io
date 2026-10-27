import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../js/config.js";

const app = document.querySelector("#updates-app");
const oneDay = 24 * 60 * 60 * 1000;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]));

function safeMediaUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function mediaType(url, name = "") {
  const path = `${new URL(url).pathname} ${name}`.toLowerCase();
  if (/\.(avif|gif|jpe?g|png|svg|webp)(?:\s|$)/.test(path)) return "image";
  if (/\.(mp4|m4v|mov|webm|ogv)(?:\s|$)/.test(path)) return "video";
  if (/\.(mp3|m4a|aac|wav|oga|ogg)(?:\s|$)/.test(path)) return "audio";
  if (/\.pdf(?:\s|$)/.test(path)) return "pdf";
  return "file";
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function isRecent(value, now = Date.now()) {
  const timestamp = new Date(value).getTime();
  const age = now - timestamp;
  return Number.isFinite(timestamp) && age >= 0 && age <= oneDay;
}

function renderEmpty(message, heading = "You're all caught up") {
  app.innerHTML = `<section class="updates-page">
    <header class="updates-hero">
      <div class="updates-hero-copy">
        <p class="updates-eyebrow"><span aria-hidden="true"></span>WHAT'S NEW</p>
        <h1>Updates</h1>
        <p>Product news, fresh ideas, and little improvements to your learning space.</p>
      </div>
    </header>
    <div class="theme-card updates-empty">
      <span class="updates-empty-icon"><i data-lucide="bell-ring"></i></span>
      <h2>${escapeHtml(heading)}</h2>
      <p>${escapeHtml(message)}</p>
    </div>
  </section>`;
  window.lucide?.createIcons();
}

function attachmentMarkup(update) {
  const imageUrl = safeMediaUrl(update.image_url);
  const attachmentUrl = safeMediaUrl(update.attachment_url);
  const title = update.title || "Update";
  const items = [];

  if (imageUrl) {
    items.push(`<button class="update-image-button" type="button" data-media-url="${escapeHtml(imageUrl)}" data-media-type="image" data-media-title="${escapeHtml(title)}" aria-label="View image: ${escapeHtml(title)}">
      <img class="update-image" loading="lazy" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}">
      <span class="update-image-action"><i data-lucide="expand"></i> View image</span>
    </button>`);
  }

  if (attachmentUrl) {
    const name = update.attachment_name || "Update attachment";
    const type = mediaType(attachmentUrl, name);
    const icon = { image: "image", video: "video", audio: "audio-lines", pdf: "file-text", file: "paperclip" }[type];
    if (type !== "file") {
      items.push(`<button class="update-attachment" type="button" data-media-url="${escapeHtml(attachmentUrl)}" data-media-type="${type}" data-media-title="${escapeHtml(name)}">
        <span class="update-attachment-icon"><i data-lucide="${icon}"></i></span>
        <span class="update-attachment-copy"><strong>${escapeHtml(name)}</strong><small>${type === "pdf" ? "PDF document · Open preview" : `${type[0].toUpperCase()}${type.slice(1)} media · View attachment`}</small></span>
        <i data-lucide="arrow-up-right" class="update-attachment-arrow"></i>
      </button>`);
    } else {
      items.push(`<a class="update-attachment" href="${escapeHtml(attachmentUrl)}" target="_blank" rel="noopener noreferrer">
        <span class="update-attachment-icon"><i data-lucide="${icon}"></i></span>
        <span class="update-attachment-copy"><strong>${escapeHtml(name)}</strong><small>Attachment · Open in a new tab</small></span>
        <i data-lucide="arrow-up-right" class="update-attachment-arrow"></i>
      </a>`);
    }
  }

  if ((update.image_url && !imageUrl) || (update.attachment_url && !attachmentUrl)) {
    console.warn("An update attachment was omitted because its URL was invalid.");
  }
  return items.length ? `<div class="update-media-list">${items.join("")}</div>` : "";
}

function renderUpdates(updates) {
  const recentCount = updates.filter((update) => isRecent(update.created_at)).length;
  app.innerHTML = `<section class="updates-page">
    <header class="updates-hero">
      <div class="updates-hero-copy">
        <p class="updates-eyebrow"><span aria-hidden="true"></span>WHAT'S NEW</p>
        <h1>Updates</h1>
        <p>Product news, fresh ideas, and little improvements to your learning space.</p>
        <div class="updates-hero-meta"><span><i data-lucide="newspaper"></i>${updates.length} ${updates.length === 1 ? "update" : "updates"}</span>${recentCount ? `<span class="updates-recent-summary"><i data-lucide="clock-3"></i>${recentCount} new in the last 24 hours</span>` : ""}</div>
      </div>
    </header>
    <div class="updates-feed-heading"><div><p>STAY IN THE LOOP</p><h2>What’s new</h2></div><label class="updates-search"><i data-lucide="search"></i><input id="updates-search" type="search" placeholder="Find an update" aria-label="Find an update"></label></div>
    <div class="updates-list">${updates.map((update) => {
      const recent = isRecent(update.created_at);
      return `<article class="update-card" data-search="${escapeHtml(`${update.title || ""} ${update.body || ""}`.toLowerCase())}">
        <div class="update-card-content">
          <div class="update-card-meta"><span class="update-category"><i data-lucide="sparkles"></i> SPRK NEWS</span>${recent ? '<span class="update-recent-tag"><span></span> Recent</span>' : ""}<time datetime="${escapeHtml(update.created_at || "")}">${escapeHtml(formatDate(update.created_at))}</time></div>
          <h3>${escapeHtml(update.title || "Update")}</h3>
          ${update.body ? `<p class="update-body">${escapeHtml(update.body)}</p>` : ""}
          ${attachmentMarkup(update)}
        </div>
      </article>`;
    }).join("")}</div>
    <div class="updates-no-results" hidden><i data-lucide="search-x"></i><strong>No matching updates</strong><span>Try a different title or keyword.</span></div>
    <dialog class="updates-media-dialog" aria-label="Update media preview">
      <div class="updates-media-dialog-bar"><span id="updates-media-title"></span><button class="updates-media-close" type="button" aria-label="Close media preview"><i data-lucide="x"></i></button></div>
      <div class="updates-media-stage"></div>
    </dialog>
  </section>`;

  const search = app.querySelector("#updates-search");
  search.addEventListener("input", () => {
    const query = search.value.trim().toLowerCase();
    let visibleCount = 0;
    app.querySelectorAll(".update-card").forEach((card) => {
      const matches = card.dataset.search.includes(query);
      card.hidden = !matches;
      if (matches) visibleCount += 1;
    });
    app.querySelector(".updates-no-results").hidden = visibleCount > 0;
  });

  const dialog = app.querySelector(".updates-media-dialog");
  const stage = dialog.querySelector(".updates-media-stage");
  app.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-media-url]");
    if (!trigger) return;
    const url = safeMediaUrl(trigger.dataset.mediaUrl);
    if (!url) {
      console.error("Could not open update media because its URL is invalid.");
      return;
    }
    const type = trigger.dataset.mediaType;
    const title = trigger.dataset.mediaTitle || "Update attachment";
    app.querySelector("#updates-media-title").textContent = title;
    if (type === "image") {
      stage.innerHTML = `<img src="${escapeHtml(url)}" alt="${escapeHtml(title)}">`;
    } else if (type === "video") {
      stage.innerHTML = `<video src="${escapeHtml(url)}" controls autoplay playsinline aria-label="${escapeHtml(title)}"></video>`;
    } else if (type === "audio") {
      stage.innerHTML = `<div class="updates-audio-preview"><i data-lucide="audio-lines"></i><strong>${escapeHtml(title)}</strong><audio src="${escapeHtml(url)}" controls></audio></div>`;
    } else {
      stage.innerHTML = `<iframe src="${escapeHtml(url)}" title="${escapeHtml(title)}" sandbox="allow-scripts allow-forms"></iframe>`;
    }
    window.lucide?.createIcons();
    dialog.showModal();
  });

  const closeDialog = () => {
    dialog.close();
    stage.replaceChildren();
  };
  dialog.querySelector(".updates-media-close").addEventListener("click", closeDialog);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog();
  });
  dialog.addEventListener("close", () => stage.replaceChildren());
  window.lucide?.createIcons();
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  renderEmpty("Supabase is not configured.", "Updates aren’t available yet");
} else {
  const script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  script.onload = async () => {
    try {
      const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data, error } = await db
        .from("site_updates")
        .select("id,title,body,image_url,attachment_url,attachment_name,created_at")
        .eq("published", true)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      if (!data?.length) {
        renderEmpty("There are no published updates yet.");
        return;
      }
      renderUpdates(data);
    } catch (error) {
      console.error("Could not load updates.", error);
      renderEmpty("Could not load updates. Check your connection and Supabase configuration.", "We couldn’t load updates");
    }
  };
  script.onerror = () => renderEmpty("Unable to load the updates service. Check your connection and try again.", "We couldn’t load updates");
  document.head.append(script);
}
