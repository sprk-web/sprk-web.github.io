import { CONTRIBUTION_CONFIG } from "../js/config.js";
import { getAppDataSupabaseClient, isAppDataConfigured } from "../js/appDataSupabaseClient.js";
import { getPrimarySupabaseClient } from "../js/supabaseClient.js";

const app = document.querySelector("#resources-app");
const subjects = ["All subjects", "Physics", "Chemistry", "Mathematics", "General"];
const resourceTypes = [
  ["video", "Video / lecture"],
  ["course", "Course"],
  ["notes", "Notes / reference"],
  ["practice", "Practice questions"],
  ["other", "Other"],
];
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]));

let db;
let user;
let resources = [];
let rewards = {};
let search = "";
let subject = "All subjects";
let notice = "";
let noticeKind = "";

function showError(error) {
  console.error("Could not load the SPRK resource library.", error);
  const message = error?.message || String(error);
  const setupHint = /relation .* does not exist|could not find the table/i.test(message)
    ? " Apply supabase/sprk_app_data_schema.sql in the app-data Supabase project."
    : "";
  app.innerHTML = `<section class="resources-error"><p class="resources-kicker">RESOURCE LIBRARY</p><h1>We couldn’t open the library</h1><p>${escapeHtml(message + setupHint)}</p></section>`;
}

function renderResource(resource) {
  const typeLabel = resourceTypes.find(([value]) => value === resource.resource_type)?.[1] || "Resource";
  const typeIcon = {
    video: "circle-play",
    course: "graduation-cap",
    notes: "notebook-text",
    practice: "brain",
    other: "link",
  }[resource.resource_type] || "link";
  let host = "";
  try {
    host = new URL(resource.url).hostname.replace(/^www\./, "");
  } catch {
    host = "Online resource";
  }
  return `<article class="resource-card">
    <div class="resource-card-heading">
      <span class="resource-card-type"><i data-lucide="${typeIcon}" class="h-4 w-4"></i>${escapeHtml(typeLabel)}</span>
      <span class="resource-card-badge">${escapeHtml(resource.subject)}</span>
    </div>
    <h3>${escapeHtml(resource.title)}</h3>
    <p>${escapeHtml(resource.description)}</p>
    <div class="resource-card-footer">
      <div class="resource-card-meta"><span>${escapeHtml(host)}</span>${resource.created_at ? `<span>·</span><span>${escapeHtml(new Date(resource.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }))}</span>` : ""}</div>
      <a class="resource-open-link" href="${escapeHtml(resource.url)}" target="_blank" rel="noopener noreferrer">Open <i data-lucide="arrow-up-right" class="h-4 w-4"></i></a>
    </div>
  </article>`;
}

function render() {
  const visible = resources.filter((resource) => {
    const matchesSubject = subject === "All subjects" || resource.subject === subject;
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [resource.title, resource.description, resource.subject, resource.url]
      .some((value) => String(value || "").toLowerCase().includes(query));
    return matchesSubject && matchesSearch;
  });
  app.innerHTML = `<section class="resources-page">
    <header class="resources-toolbar">
      <label class="resources-search"><i data-lucide="search" class="h-5 w-5"></i><input id="resource-search" type="search" value="${escapeHtml(search)}" placeholder="Search resources, subjects, topics…" aria-label="Search resources"></label>
      <span class="resources-result-count">${visible.length} ${visible.length === 1 ? "resource" : "resources"}</span>
      <div class="resources-filter-row" aria-label="Filter by subject">
        ${subjects.map((value) => `<button class="resources-filter ${subject === value ? "is-active" : ""}" type="button" data-resource-subject="${escapeHtml(value)}" aria-pressed="${subject === value}">${escapeHtml(value === "All subjects" ? "All" : value)}</button>`).join("")}
      </div>
    </header>
    ${visible.length ? `<div class="resources-grid">${visible.map(renderResource).join("")}</div>` : `<section class="resources-empty">
      <span class="resources-empty-icon"><i data-lucide="${search || subject !== "All subjects" ? "search-x" : "library"}" class="h-7 w-7"></i></span>
      <h2>${resources.length ? "No matching resources" : "A library starts with one good link"}</h2>
      <p>${resources.length ? "Try another search or subject." : "Share a free resource you found useful and help another student get started."}</p>
    </section>`}
    <dialog id="resource-dialog" class="resources-dialog" aria-labelledby="resource-dialog-title">
      <div class="resources-dialog-header">
        <div><p class="resources-kicker">COMMUNITY CONTRIBUTION</p><h2 id="resource-dialog-title">Share a resource</h2><p>Add a free link that helped you learn.</p></div>
        <button class="resources-close" type="button" data-close-resource-dialog aria-label="Close dialog"><i data-lucide="x" class="h-5 w-5"></i></button>
      </div>
      ${user ? `<form id="resource-form" class="resources-form">
        <label class="resources-field">Resource name<input name="title" minlength="2" maxlength="120" placeholder="e.g. Electrostatics revision lecture" required></label>
        <label class="resources-field">Subject<select name="subject" required>${subjects.slice(1).map((value) => `<option value="${value}">${value}</option>`).join("")}</select></label>
        <label class="resources-field resources-field-wide">Resource link<input name="url" type="url" maxlength="2048" placeholder="https://…" required></label>
        <label class="resources-field">Format<select name="resource_type" required>${resourceTypes.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>
        <label class="resources-field resources-field-wide">A short recommendation<textarea name="description" maxlength="500" placeholder="What makes this useful? What should learners expect?" required></textarea></label>
        <label class="resources-checkbox resources-field-wide"><input name="is_free" type="checkbox" required><span>This link gives free access to the learning material. I’m sharing the link, not uploading someone else’s content.</span></label>
        ${rewards.resource ? `<div class="resources-reward"><i data-lucide="sparkles" class="h-4 w-4"></i> Contribution reward: <strong>${Number(rewards.resource.currency_amount)} ${escapeHtml(CONTRIBUTION_CONFIG.currencyName)}</strong> + <strong>${Number(rewards.resource.xp_amount)} XP</strong></div>` : ""}
        <p id="resources-notice" class="resources-notice resources-field-wide" data-kind="${escapeHtml(noticeKind)}" role="status">${escapeHtml(notice)}</p>
        <div class="resources-dialog-actions resources-field-wide"><button class="resources-cancel" type="button" data-close-resource-dialog>Cancel</button><button class="resources-button" type="submit"><i data-lucide="send" class="h-4 w-4"></i> Publish resource</button></div>
      </form>` : `<div class="resources-signin"><p>Sign in to share resources and earn contribution rewards.</p><a class="resources-button" href="../account/?return=${encodeURIComponent("/resources/")}">Sign in</a></div>`}
    </dialog>
    ${user ? `<button class="resources-fab" type="button" id="open-resource-dialog"><i data-lucide="plus" class="h-5 w-5"></i><span>Publish resource</span></button>` : `<a class="resources-fab" href="../account/?return=${encodeURIComponent("/resources/")}"><i data-lucide="plus" class="h-5 w-5"></i><span>Sign in to publish</span></a>`}
  </section>`;
  window.lucide?.createIcons();

  app.querySelector("#resource-search").addEventListener("input", (event) => {
    search = event.currentTarget.value;
    renderResourceResults();
  });
  app.querySelectorAll("[data-resource-subject]").forEach((button) => button.addEventListener("click", () => {
    subject = button.dataset.resourceSubject;
    render();
  }));
  app.querySelector("#open-resource-dialog")?.addEventListener("click", () => {
    app.querySelector("#resource-dialog").showModal();
  });
  app.querySelectorAll("[data-close-resource-dialog]").forEach((button) => button.addEventListener("click", () => {
    app.querySelector("#resource-dialog").close();
  }));
  app.querySelector("#resource-dialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });
  app.querySelector("#resource-form")?.addEventListener("submit", submitResource);
}

function renderResourceResults() {
  const visible = resources.filter((resource) => {
    const matchesSubject = subject === "All subjects" || resource.subject === subject;
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [resource.title, resource.description, resource.subject, resource.url]
      .some((value) => String(value || "").toLowerCase().includes(query));
    return matchesSubject && matchesSearch;
  });
  const container = app.querySelector(".resources-page");
  if (!container) return;
  const existing = app.querySelector(".resources-grid, .resources-empty");
  const results = document.createElement("div");
  results.innerHTML = visible.length
    ? `<div class="resources-grid">${visible.map(renderResource).join("")}</div>`
    : `<section class="resources-empty"><span class="resources-empty-icon"><i data-lucide="search-x" class="h-7 w-7"></i></span><h2>No matching resources</h2><p>Try another search or subject.</p></section>`;
  existing?.replaceWith(...results.children);
  app.querySelector(".resources-result-count").textContent = `${visible.length} ${visible.length === 1 ? "resource" : "resources"}`;
  window.lucide?.createIcons();
}

async function submitResource(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const values = new FormData(form);
  const title = String(values.get("title") || "").trim();
  const description = String(values.get("description") || "").trim();
  const url = String(values.get("url") || "").trim();
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    setNotice("Enter a valid public web link.", "error");
    return;
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    setNotice("Only http and https resource links are allowed.", "error");
    return;
  }
  if (!values.get("is_free")) {
    setNotice("Confirm that the shared learning material is free to access.", "error");
    return;
  }

  button.disabled = true;
  button.textContent = "Adding resource…";
  notice = "";
  noticeKind = "";
  try {
    const { error } = await db.from("shared_resources").insert({
      owner_id: user.id,
      title,
      description,
      url: parsedUrl.href,
      subject: String(values.get("subject")),
      resource_type: String(values.get("resource_type")),
      status: "published",
    });
    if (error) throw error;
    const reward = rewards.resource;
    notice = reward
      ? `Resource added. You earned ${Number(reward.currency_amount)} ${CONTRIBUTION_CONFIG.currencyName} and ${Number(reward.xp_amount)} XP.`
      : "Resource added to the library. Your contribution rewards were recorded.";
    noticeKind = "success";
    form.reset();
    try {
      resources = await loadResources();
    } catch (refreshError) {
      console.error("The resource was added, but the library could not refresh.", refreshError);
      notice += " Refresh the page to see it in the library.";
    }
    render();
    app.querySelector("#resource-dialog").showModal();
  } catch (error) {
    console.error("Could not add a resource to the SPRK library.", error);
    setNotice(/duplicate key/i.test(error?.message || "")
      ? "That resource link is already in the library."
      : error?.message || "Could not add this resource. Please try again.", "error");
    const submitButton = app.querySelector('#resource-form button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Add to library";
    }
  }
}

function setNotice(message, kind) {
  notice = message;
  noticeKind = kind;
  const status = app.querySelector("#resources-notice");
  if (!status) return;
  status.textContent = message;
  status.dataset.kind = kind;
}

async function loadResources() {
  const { data, error } = await db.from("shared_resources")
    .select("id,title,description,url,subject,resource_type,created_at")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data || [];
}

async function initialize() {
  try {
    if (!isAppDataConfigured()) throw new Error("Add the app-data Supabase project URL and publishable key in js/config.js.");
    const primary = getPrimarySupabaseClient();
    const { data: sessionData, error: sessionError } = await primary.auth.getSession();
    if (sessionError) throw sessionError;
    user = sessionData.session?.user || null;
    db = getAppDataSupabaseClient(sessionData.session);
    const [resourceRows, rewardResult] = await Promise.all([
      loadResources(),
      db.from("contribution_reward_settings").select("task_key,currency_amount,xp_amount"),
    ]);
    if (rewardResult.error) throw rewardResult.error;
    resources = resourceRows;
    rewards = Object.fromEntries((rewardResult.data || []).map((reward) => [reward.task_key, reward]));
    render();
  } catch (error) {
    showError(error);
  }
}

initialize();
