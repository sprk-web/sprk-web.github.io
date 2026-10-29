import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../js/config.js";
import { recordContentEngagement } from "../js/analytics.js";

const app = document.querySelector("#updates-app");
const oneDay = 24 * 60 * 60 * 1000;
const pageSize = 20;
const categories = {
  release: { label: "Release", icon: "package-check" },
  announcement: { label: "Announcement", icon: "megaphone" },
  improvement: { label: "Improvement", icon: "sparkles" },
};
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

function updateCategory(update) {
  return Object.hasOwn(categories, update.category) ? update.category : "announcement";
}

function updatePermalink(id) {
  const url = new URL(window.location.href);
  url.searchParams.set("id", id);
  return url.href;
}

function sortUpdates(updates, sort) {
  return updates.sort((a, b) => {
    const first = new Date(a.created_at).getTime() || 0;
    const second = new Date(b.created_at).getTime() || 0;
    return sort === "oldest" ? first - second : second - first;
  });
}

function renderEmpty(message, heading = "You're all caught up") {
  app.innerHTML = `<section class="updates-page">
    <h1 class="sr-only">Updates</h1>
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

function renderUpdate(update) {
  const recent = isRecent(update.created_at);
  const category = updateCategory(update);
  const { label, icon } = categories[category];
  return `<article class="update-card" id="update-${escapeHtml(update.id)}" data-update-id="${escapeHtml(update.id)}" data-category="${category}" data-search="${escapeHtml(`${update.title || ""} ${update.body || ""}`.toLowerCase())}">
    <div class="update-card-content">
      <div class="update-card-meta"><span class="update-category update-category-${category}"><i data-lucide="${icon}"></i> ${label}</span>${recent ? '<span class="update-recent-tag"><span></span> Recent</span>' : ""}<time datetime="${escapeHtml(update.created_at || "")}">${escapeHtml(formatDate(update.created_at))}</time></div>
      <h3>${escapeHtml(update.title || "Update")}</h3>
      ${update.body ? `<p class="update-body">${escapeHtml(update.body)}</p>` : ""}
      ${attachmentMarkup(update)}
      <a class="update-share-link" href="${escapeHtml(updatePermalink(String(update.id)))}"><i data-lucide="link"></i> Permalink</a>
    </div>
  </article>`;
}

function renderCards(updates) {
  const list = app.querySelector(".updates-list");
  list.innerHTML = updates.map(renderUpdate).join("");
  window.lucide?.createIcons();
}

function updateSummary(updates) {
  app.querySelector("#updates-count").textContent = String(updates.length);
  const recentCount = updates.filter((update) => isRecent(update.created_at)).length;
  const recentSummary = app.querySelector("#updates-recent-summary");
  recentSummary.hidden = recentCount === 0;
  recentSummary.innerHTML = `<i data-lucide="clock-3"></i><span>${recentCount}</span> new in the last 24 hours`;
  window.lucide?.createIcons();
}

function renderUpdates(updates) {
  app.innerHTML = `<section class="updates-page">
    <div class="updates-feed-heading"><div><h1>What’s new</h1><div class="updates-summary"><span><i data-lucide="newspaper"></i><span id="updates-count">${updates.length}</span> <span>updates loaded</span></span><span class="updates-recent-summary" id="updates-recent-summary" hidden></span></div></div></div>
    <div class="updates-controls">
      <label class="updates-filter"><span>Category</span><select id="updates-category" aria-label="Filter by category"><option value="all">All categories</option><option value="release">Release</option><option value="announcement">Announcement</option><option value="improvement">Improvement</option></select></label>
      <label class="updates-filter"><span>Sort</span><select id="updates-sort" aria-label="Sort updates"><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
      <label class="updates-search"><i data-lucide="search"></i><input id="updates-search" type="search" placeholder="Find an update" aria-label="Find an update"></label>
    </div>
    <div class="updates-list"></div>
    <div class="updates-no-results" hidden><i data-lucide="search-x"></i><strong>No matching updates</strong><span>Try a different category or keyword.</span></div>
    <div class="updates-load-more-wrap"${hasMore ? "" : " hidden"}><button class="updates-load-more" type="button">Load more</button><span class="updates-load-error" role="alert" hidden></span></div>
    <dialog class="updates-media-dialog" aria-label="Update media preview">
      <div class="updates-media-dialog-bar"><span id="updates-media-title"></span><button class="updates-media-close" type="button" aria-label="Close media preview"><i data-lucide="x"></i></button></div>
      <div class="updates-media-stage"></div>
    </dialog>
  </section>`;

  renderCards(updates);
  updateSummary(updates);
  const search = app.querySelector("#updates-search");
  const categoryFilter = app.querySelector("#updates-category");
  const sort = app.querySelector("#updates-sort");
  const loadMoreButton = app.querySelector(".updates-load-more");
  const loadMoreWrap = app.querySelector(".updates-load-more-wrap");
  const loadError = app.querySelector(".updates-load-error");
  const applyFilters = () => {
    const query = search.value.trim().toLowerCase();
    const category = categoryFilter.value;
    let visibleCount = 0;
    app.querySelectorAll(".update-card").forEach((card) => {
      const matches = card.dataset.search.includes(query)
        && (category === "all" || card.dataset.category === category);
      card.hidden = !matches;
      if (matches) visibleCount += 1;
    });
    const noResults = app.querySelector(".updates-no-results");
    noResults.hidden = visibleCount > 0;
    noResults.querySelector("span").textContent = hasMore
      ? "Load more to search additional updates."
      : "Try a different category or keyword.";
  };
  search.addEventListener("input", applyFilters);
  categoryFilter.addEventListener("change", applyFilters);
  sort.addEventListener("change", async () => {
    loadMoreButton.disabled = true;
    loadError.hidden = true;
    try {
      await loadFirstPage(sort.value);
    } catch (error) {
      console.error("Could not sort updates.", error);
      loadError.textContent = "Could not reload updates in that order. Please try again.";
      loadError.hidden = false;
    } finally {
      loadMoreButton.disabled = false;
    }
  });
  loadMoreButton.addEventListener("click", async () => {
    loadMoreButton.disabled = true;
    loadError.hidden = true;
    try {
      await loadNextPage(sort.value);
      loadMoreWrap.hidden = !hasMore;
    } catch (error) {
      console.error("Could not load more updates.", error);
      loadError.textContent = "Could not load more updates. Please try again.";
      loadError.hidden = false;
    } finally {
      loadMoreButton.disabled = false;
    }
  });

  const dialog = app.querySelector(".updates-media-dialog");
  const stage = dialog.querySelector(".updates-media-stage");
  app.addEventListener("click", (event) => {
    const contentAction = event.target.closest(".update-card a, .update-card button[data-media-url]");
    if (contentAction) {
      const card = contentAction.closest(".update-card");
      if (card) recordContentEngagement(card.dataset.updateId);
    }
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
  applyFilters();
}

let loadedUpdates = [];
let nextOffset = 0;
let hasMore = false;
const linkedUpdateId = new URL(window.location.href).searchParams.get("id");
let linkedUpdate = null;
let activeSort = "newest";
let db;
const updateColumns = "id,title,body,image_url,attachment_url,attachment_name,category,created_at";

function updatesQuery(sort) {
  return db
    .from("site_updates")
    .select(updateColumns)
    .eq("published", true)
    .order("created_at", { ascending: sort === "oldest" });
}

async function loadFirstPage(sort = activeSort) {
  const { data, error } = await updatesQuery(sort).range(0, pageSize - 1);
  if (error) throw error;

  const firstPage = data || [];
  const hasNextPage = firstPage.length === pageSize;

  if (linkedUpdateId && !firstPage.some((update) => String(update.id) === linkedUpdateId)) {
    if (!linkedUpdate) {
      const { data: linkedData, error: linkedError } = await db.from("site_updates")
        .select(updateColumns)
        .eq("published", true)
        .eq("id", linkedUpdateId)
        .maybeSingle();
      if (linkedError) throw linkedError;
      linkedUpdate = linkedData;
    }
    if (linkedUpdate) firstPage.push(linkedUpdate);
  }
  loadedUpdates = sortUpdates(firstPage, sort);
  nextOffset = data?.length || 0;
  hasMore = hasNextPage;
  activeSort = sort;

  if (!loadedUpdates.length) {
    renderEmpty("There are no published updates yet.");
    return;
  }
  if (!app.querySelector(".updates-list")) {
    renderUpdates(loadedUpdates);
  } else {
    renderCards(loadedUpdates);
    app.querySelector(".updates-load-more-wrap").hidden = !hasMore;
    app.querySelector("#updates-search").dispatchEvent(new Event("input"));
  }
  updateSummary(loadedUpdates);

  if (linkedUpdateId) {
    document.getElementById(`update-${linkedUpdateId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

async function loadNextPage(sort) {
  const { data, error } = await updatesQuery(sort).range(nextOffset, nextOffset + pageSize - 1);
  if (error) throw error;
  const existingIds = new Set(loadedUpdates.map((update) => String(update.id)));
  const newUpdates = (data || []).filter((update) => !existingIds.has(String(update.id)));
  loadedUpdates.push(...newUpdates);
  sortUpdates(loadedUpdates, sort);
  nextOffset += (data || []).length;
  hasMore = (data || []).length === pageSize;
  renderCards(loadedUpdates);
  updateSummary(loadedUpdates);
  app.querySelector(".updates-load-more-wrap").hidden = !hasMore;
  app.querySelector("#updates-search").dispatchEvent(new Event("input"));
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  renderEmpty("Supabase is not configured.", "Updates aren’t available yet");
} else {
  const script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  script.onload = async () => {
    try {
      db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      await loadFirstPage();
    } catch (error) {
      console.error("Could not load updates.", error);
      renderEmpty("Could not load updates. Check your connection, Supabase configuration, and the update categories database migration.", "We couldn’t load updates");
    }
  };
  script.onerror = () => renderEmpty("Unable to load the updates service. Check your connection and try again.", "We couldn’t load updates");
  document.head.append(script);
}
