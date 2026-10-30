import { getPrimarySupabaseClient } from "../js/supabaseClient.js";
import { getAppDataSupabaseClient, isAppDataConfigured } from "../js/appDataSupabaseClient.js";

const app = document.querySelector("#preptrack-app");
const coreCheckpoints = [
  { key: "Lecture / theory notes", label: "Notes" },
  { key: "JEE Main PYQs", label: "Mains PYQ" },
  { key: "JEE Advanced PYQs", label: "Advanced PYQ" },
  { key: "Chapter mock test", label: "Chapter test" },
];
const notesCheckpointKeys = ["Lecture / theory notes", "Formula sheet / short notes"];
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]));
const progressKey = (chapterId, checkpoint) => `${chapterId}:${checkpoint}`;
const revisionOffsets = { 1: 3, 2: 14, 3: 45 };

let db;
let session;
let user;
let subjects = [];
let chapters = [];
let checkpointProgress = new Map();
let revisions = [];
let resources = [];
let tiers = [];
let resourceProgress = [];
let activeView = "syllabus";
let selectedSubject = "All";
let selectedClass = "All";
let search = "";

function showError(error) {
  console.error("Could not load the SPRK syllabus tracker.", error);
  const rawMessage = error?.message || String(error);
  const message = /relation .* does not exist|could not find the table|column .* does not exist/i.test(rawMessage)
    ? `${rawMessage} Apply the current supabase/sprk_app_data_schema.sql in the app-data Supabase project.`
    : rawMessage;
  app.innerHTML = `<section class="theme-card tracker-error">
    <span class="tracker-kicker">SYLLABUS TRACKER</span>
    <h1>We couldn’t open your tracker</h1>
    <p>${escapeHtml(message)}</p>
    <a class="tracker-button" href="../account/">Return to your account</a>
  </section>`;
}

function notify(message, isError = false) {
  let status = app.querySelector("#tracker-status");
  if (!status) {
    status = document.createElement("div");
    status.id = "tracker-status";
    status.className = "syllabus-toast";
    status.setAttribute("role", "status");
    app.prepend(status);
  }
  status.textContent = message;
  status.dataset.error = String(isError);
  status.hidden = false;
  window.clearTimeout(status.timer);
  status.timer = window.setTimeout(() => { status.hidden = true; }, 3500);
}

async function ensureProfile() {
  const { data: existing, error: selectError } = await db.from("tracker_profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return;
  const handle = String(user.user_metadata?.display_name || user.email?.split("@")[0] || "Learner")
    .trim().slice(0, 80) || "Learner";
  const { error } = await db.from("tracker_profiles").insert({ user_id: user.id, handle });
  if (error?.code === "23505") return;
  if (error) throw error;
}

async function loadData() {
  const results = await Promise.all([
    db.from("tracker_subjects").select("name,sort_order").order("sort_order"),
    db.from("tracker_chapters").select("id,subject,unit,title,weightage,sort_order,class_level").order("sort_order"),
    db.from("tracker_checkpoint_progress").select("chapter_id,checkpoint_key,completed_at,score,accuracy").eq("user_id", user.id),
    db.from("tracker_revisions").select("chapter_id,stage,due_at,completed_at").eq("user_id", user.id).order("stage"),
    db.from("tracker_resources").select("id,subject,unit_name,chapter_id,name").eq("user_id", user.id).order("created_at"),
    db.from("tracker_resource_tiers").select("id,resource_id,name,sort_order").order("sort_order"),
    db.from("tracker_resource_progress").select("tier_id,chapter_id,completed_at").eq("user_id", user.id),
  ]);
  const failure = results.find((result) => result.error);
  if (failure?.error) throw failure.error;
  subjects = results[0].data || [];
  chapters = results[1].data || [];
  checkpointProgress = new Map((results[2].data || []).map((item) => [progressKey(item.chapter_id, item.checkpoint_key), item]));
  revisions = results[3].data || [];
  resources = results[4].data || [];
  tiers = results[5].data || [];
  resourceProgress = results[6].data || [];
}

function progressFor(chapterId, checkpoint) {
  return checkpointProgress.get(progressKey(chapterId, checkpoint));
}

function notesComplete(chapterId) {
  return notesCheckpointKeys.every((key) => Boolean(progressFor(chapterId, key)?.completed_at));
}

function checkpointComplete(chapterId, key) {
  if (key === "Lecture / theory notes") return notesComplete(chapterId);
  return Boolean(progressFor(chapterId, key)?.completed_at);
}

function tiersForChapter(chapterId) {
  return resources.filter((resource) => {
    const chapter = chapters.find((item) => item.id === chapterId);
    return resource.subject === chapter?.subject
      && (!resource.unit_name || resource.unit_name === chapter?.unit)
      && (!resource.chapter_id || resource.chapter_id === chapterId);
  }).flatMap((resource) => tiers
    .filter((tier) => tier.resource_id === resource.id)
    .map((tier) => ({ ...tier, resourceName: resource.name })));
}

function tierComplete(chapterId, tierId) {
  return resourceProgress.some((item) => item.chapter_id === chapterId && item.tier_id === tierId && item.completed_at);
}

function chapterHealth(chapterId) {
  const tiersForThisChapter = tiersForChapter(chapterId);
  const done = coreCheckpoints.filter((checkpoint) => checkpointComplete(chapterId, checkpoint.key)).length
    + tiersForThisChapter.filter((tier) => tierComplete(chapterId, tier.id)).length;
  const total = coreCheckpoints.length + tiersForThisChapter.length;
  return total ? Math.round((done / total) * 100) : 0;
}

function completedAtForChapter(chapterId) {
  const times = [...checkpointProgress.values()]
    .filter((item) => item.chapter_id === chapterId && item.completed_at)
    .map((item) => new Date(item.completed_at).getTime());
  return times.length ? new Date(Math.max(...times)) : null;
}

function latestReview(chapterId) {
  return revisions.filter((item) => item.chapter_id === chapterId && item.completed_at)
    .reduce((latest, item) => !latest || new Date(item.completed_at) > new Date(latest) ? item.completed_at : latest, null);
}

function activeRevision(chapterId) {
  return revisions.find((item) => item.chapter_id === chapterId && !item.completed_at && Number(item.stage) <= 3);
}

function revisionPlanExists(chapterId) {
  return revisions.some((item) => item.chapter_id === chapterId && Number(item.stage) <= 3);
}

function chapterMilestonesComplete(chapterId) {
  return notesComplete(chapterId)
    && ["JEE Main PYQs", "JEE Advanced PYQs", "Chapter mock test"].every((key) => progressFor(chapterId, key)?.completed_at);
}

function readinessPercent(subject, keys) {
  const list = chapters.filter((chapter) => subject === "All" || chapter.subject === subject);
  const checks = list.flatMap((chapter) => keys.map((key) => checkpointComplete(chapter.id, key)));
  return checks.length ? Math.round(checks.filter(Boolean).length / checks.length * 100) : 0;
}

function testScore(chapterId) {
  return progressFor(chapterId, "Chapter mock test")?.score ?? "";
}

function subjectSummary(subject) {
  const list = chapters.filter((chapter) => subject === "All" || chapter.subject === subject);
  return {
    health: list.length ? Math.round(list.reduce((sum, chapter) => sum + chapterHealth(chapter.id), 0) / list.length) : 0,
    mains: readinessPercent(subject, ["Lecture / theory notes", "JEE Main PYQs", "Chapter mock test"]),
    advanced: readinessPercent(subject, ["Lecture / theory notes", "JEE Advanced PYQs", "Chapter mock test"]),
  };
}

function renderDashboard() {
  const summaries = subjects.map((subject) => ({ name: subject.name, ...subjectSummary(subject.name) }));
  const overall = subjectSummary("All");
  const weak = chapters.map((chapter) => ({ chapter, score: testScore(chapter.id) }))
    .filter((item) => item.score !== "")
    .sort((a, b) => Number(a.score) - Number(b.score))
    .slice(0, 5);
  return `<section class="syllabus-dashboard">
    <div class="syllabus-readiness-grid">
      <article class="theme-card syllabus-readiness"><span>Overall syllabus health</span><strong>${overall.health}%</strong><div class="tracker-progress"><i style="width:${overall.health}%"></i></div><small>${chapters.length} JEE chapters tracked</small></article>
      <article class="theme-card syllabus-readiness"><span>JEE Mains ready</span><strong>${overall.mains}%</strong><div class="tracker-progress"><i style="width:${overall.mains}%"></i></div><small>Notes + Mains PYQ + chapter test</small></article>
      <article class="theme-card syllabus-readiness"><span>JEE Advanced ready</span><strong>${overall.advanced}%</strong><div class="tracker-progress"><i style="width:${overall.advanced}%"></i></div><small>Notes + Advanced PYQ + chapter test</small></article>
    </div>
    <div class="syllabus-analytics-grid">
      <section class="theme-card syllabus-analytics"><div class="tracker-panel-heading"><div><h2>Subject progress</h2><p>Completion and readiness at a glance</p></div></div>
        <div class="syllabus-subject-metrics">${summaries.map((item) => `<article><div><strong>${escapeHtml(item.name)}</strong><span>${item.health}% complete</span></div><div class="tracker-progress"><i style="width:${item.health}%"></i></div><div class="syllabus-metric-foot"><span>Mains ${item.mains}%</span><span>Advanced ${item.advanced}%</span></div></article>`).join("")}</div>
      </section>
      <section class="theme-card syllabus-analytics"><div class="tracker-panel-heading"><div><h2>Weak spots</h2><p>Lowest chapter-test scores</p></div></div>
        ${weak.length ? `<div class="syllabus-weak-list">${weak.map(({ chapter, score }) => `<div><span><strong>${escapeHtml(chapter.title)}</strong><small>${escapeHtml(chapter.subject)}</small></span><strong class="${Number(score) < 60 ? "is-weak" : ""}">${escapeHtml(score)}%</strong></div>`).join("")}</div>` : `<p class="syllabus-muted">Add test scores to see your focus areas.</p>`}
      </section>
    </div>
  </section>`;
}

function renderChapterRow(chapter) {
  const chapterTiers = tiersForChapter(chapter.id);
  const revision = activeRevision(chapter.id);
  const reviewedAt = latestReview(chapter.id);
  const completedAt = completedAtForChapter(chapter.id);
  const decayDate = reviewedAt || completedAt;
  const decayed = decayDate && Date.now() - new Date(decayDate).getTime() >= 30 * 86400000;
  const health = chapterHealth(chapter.id);
  const checkButton = (key, label) => `<label class="syllabus-toggle" title="${label}">
    <input type="checkbox" data-progress="${escapeHtml(key)}" data-chapter="${escapeHtml(chapter.id)}" ${checkpointComplete(chapter.id, key) ? "checked" : ""} aria-label="${label} for ${escapeHtml(chapter.title)}">
    <span>${checkpointComplete(chapter.id, key) ? "Done" : "Mark"}</span>
  </label>`;
  const bookContent = chapterTiers.length
    ? `<details class="syllabus-book-details"><summary>${chapterTiers.filter((tier) => tierComplete(chapter.id, tier.id)).length}/${chapterTiers.length} levels</summary><div>${chapterTiers.map((tier) => `<label><input type="checkbox" data-tier="${escapeHtml(tier.id)}" data-chapter="${escapeHtml(chapter.id)}" ${tierComplete(chapter.id, tier.id) ? "checked" : ""}><span>${escapeHtml(tier.resourceName)} · ${escapeHtml(tier.name)}</span></label>`).join("")}</div></details>`
    : `<button class="syllabus-add-tier" type="button" data-open-resource data-chapter="${escapeHtml(chapter.id)}">Add book</button>`;
  const score = testScore(chapter.id);
  return `<tr>
    <th scope="row"><strong>${escapeHtml(chapter.title)}</strong><small>${escapeHtml(chapter.unit)} · Weight ${Number(chapter.weightage)}/5</small></th>
    <td>${checkButton("Lecture / theory notes", "Notes complete")}</td>
    <td>${bookContent}</td>
    <td>${checkButton("JEE Main PYQs", "JEE Mains PYQs complete")}</td>
    <td>${checkButton("JEE Advanced PYQs", "JEE Advanced PYQs complete")}</td>
    <td><div class="syllabus-test-control">${checkButton("Chapter mock test", "Chapter test complete")}<label class="syllabus-score"><span>Score</span><input type="number" min="0" max="100" step="0.1" value="${escapeHtml(score)}" data-score="${escapeHtml(chapter.id)}" aria-label="Chapter test score out of 100"></label></div></td>
    <td><div class="syllabus-revision-cell">${revision ? `<span class="syllabus-stage ${new Date(revision.due_at) <= new Date() ? "is-due" : ""}">R${Number(revision.stage)} · ${new Date(revision.due_at) <= new Date() ? "Due" : new Date(revision.due_at).toLocaleDateString()}</span>` : !revisionPlanExists(chapter.id) && chapterMilestonesComplete(chapter.id) ? `<button type="button" class="syllabus-add-tier" data-schedule-revision="${escapeHtml(chapter.id)}">Start R1 plan</button>` : `<span class="syllabus-stage is-empty">Not scheduled</span>`}${decayed ? `<span class="syllabus-decay">30+ days</span>` : ""}</div></td>
    <td><span class="syllabus-health ${health >= 80 ? "is-strong" : health < 40 ? "is-low" : ""}"><i style="width:${health}%"></i><b>${health}%</b></span></td>
  </tr>`;
}

function renderSyllabusTable() {
  const query = search.trim().toLowerCase();
  const filtered = chapters.filter((chapter) =>
    (selectedSubject === "All" || chapter.subject === selectedSubject)
    && (selectedClass === "All" || String(chapter.class_level || "") === selectedClass)
    && (!query || `${chapter.subject} ${chapter.unit} ${chapter.title}`.toLowerCase().includes(query)));
  const groups = new Map();
  filtered.forEach((chapter) => {
    const key = `${chapter.subject}|${chapter.class_level || "Unassigned"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(chapter);
  });
  const dueCount = chapters.filter((chapter) => {
    const item = activeRevision(chapter.id);
    return item && new Date(item.due_at) <= new Date();
  }).length;
  return `<div class="tracker-toolbar syllabus-toolbar">
    <label class="tracker-search"><i data-lucide="search"></i><input id="chapter-search" type="search" value="${escapeHtml(search)}" placeholder="Find a chapter" aria-label="Search syllabus chapters"></label>
    <label class="tracker-subject-filter"><span>Subject</span><select id="subject-filter"><option value="All">All subjects</option>${subjects.map((subject) => `<option value="${escapeHtml(subject.name)}" ${selectedSubject === subject.name ? "selected" : ""}>${escapeHtml(subject.name)}</option>`).join("")}</select></label>
    <label class="tracker-subject-filter"><span>Class</span><select id="class-filter"><option value="All">All classes</option><option value="11" ${selectedClass === "11" ? "selected" : ""}>Class 11</option><option value="12" ${selectedClass === "12" ? "selected" : ""}>Class 12</option></select></label>
  </div>
  ${dueCount ? `<div class="syllabus-inline-alert"><i data-lucide="bell-ring"></i>${dueCount} revision${dueCount === 1 ? "" : "s"} ready · <button type="button" data-view="revisions">Review now</button></div>` : ""}
  <div class="syllabus-groups">${[...groups].map(([key, group]) => {
    const [subject, className] = key.split("|");
    return `<section class="theme-card syllabus-group"><header><div><span class="tracker-kicker">${escapeHtml(subject)}</span><h2>${className === "Unassigned" ? "Class not set" : `Class ${escapeHtml(className)}`}</h2></div><span>${group.length} chapters</span></header>
      <div class="syllabus-table-wrap"><table class="syllabus-table"><thead><tr><th>Chapter</th><th>Notes</th><th>Custom books</th><th>Mains PYQ</th><th>Advanced PYQ</th><th>Chapter test</th><th>Revision status</th><th>Chapter health</th></tr></thead><tbody>${group.map(renderChapterRow).join("")}</tbody></table></div>
    </section>`;
  }).join("") || `<section class="theme-card tracker-empty"><h2>No chapters match</h2><p>Try a different search or class.</p></section>`}</div>`;
}

function renderRevisions() {
  const rows = revisions.filter((item) => Number(item.stage) <= 3).map((item) => ({
    item,
    chapter: chapters.find((chapter) => chapter.id === item.chapter_id),
  })).filter((row) => row.chapter);
  const pending = rows.filter(({ item }) => !item.completed_at);
  const complete = rows.filter(({ item }) => item.completed_at);
  const reviewDate = (chapter) => latestReview(chapter.id) || completedAtForChapter(chapter.id);
  const decayRows = chapters.filter((chapter) => {
    const date = reviewDate(chapter);
    return date && Date.now() - new Date(date).getTime() >= 30 * 86400000;
  });
  const renderCard = ({ item, chapter }) => `<article class="syllabus-radar-card ${new Date(item.due_at) <= new Date() && !item.completed_at ? "is-due" : ""}">
    <div><span class="syllabus-stage-pill">R${Number(item.stage)}</span><strong>${escapeHtml(chapter.title)}</strong><small>${escapeHtml(chapter.subject)} · ${escapeHtml(chapter.unit)}</small></div>
    <span class="syllabus-radar-date">${item.completed_at ? `Reviewed ${new Date(item.completed_at).toLocaleDateString()}` : `Due ${new Date(item.due_at).toLocaleDateString()}`}</span>
    ${!item.completed_at ? `<button type="button" class="tracker-button ${new Date(item.due_at) > new Date() ? "secondary" : ""}" data-complete-revision="${escapeHtml(chapter.id)}" data-stage="${Number(item.stage)}" ${new Date(item.due_at) > new Date() ? "disabled" : ""}>${new Date(item.due_at) > new Date() ? "Upcoming" : "Mark reviewed"}</button>` : ""}
  </article>`;
  return `<section class="theme-card syllabus-panel">
    <div class="tracker-panel-heading"><div><span class="tracker-kicker">SPACED REPETITION</span><h2>Revision radar</h2><p>R1 after 3 days · R2 after 14 days · R3 after 45 days</p></div></div>
    <div class="syllabus-radar-columns"><section><h3>Upcoming & due <span>${pending.length}</span></h3>${pending.length ? pending.sort((a, b) => new Date(a.item.due_at) - new Date(b.item.due_at)).map(renderCard).join("") : `<p class="syllabus-muted">No revisions scheduled. Complete a chapter’s core milestones to start its radar.</p>`}</section>
      <section><h3>Decay watch <span>${decayRows.length}</span></h3>${decayRows.length ? decayRows.map((chapter) => `<article class="syllabus-decay-card"><span class="syllabus-decay">30+ days</span><strong>${escapeHtml(chapter.title)}</strong><small>${escapeHtml(chapter.subject)} · Last reviewed ${new Date(reviewDate(chapter)).toLocaleDateString()}</small></article>`).join("") : `<p class="syllabus-muted">No chapters have been idle for 30+ days.</p>`}</section>
    </div>
    ${complete.length ? `<details class="syllabus-history"><summary>Revision history · ${complete.length}</summary><div>${complete.map(renderCard).join("")}</div></details>` : ""}
  </section>`;
}

function renderDialogs() {
  return `<dialog id="resource-dialog" class="tracker-goal-dialog syllabus-dialog" aria-labelledby="resource-dialog-title"><section class="theme-card tracker-panel">
    <div class="tracker-panel-heading"><div><h2 id="resource-dialog-title">Add a custom book</h2><p>Create your own chapter milestones or apply it across a subject.</p></div><button class="tracker-icon-action" type="button" data-close-dialog aria-label="Close dialog">×</button></div>
    <form id="resource-form" class="syllabus-form">
      <label class="tracker-field"><span>Subject</span><select name="subject" required>${subjects.map((subject) => `<option>${escapeHtml(subject.name)}</option>`).join("")}</select></label>
      <label class="tracker-field"><span>Book / resource name</span><input name="name" maxlength="80" placeholder="e.g. N Awasthi" required></label>
      <label class="tracker-field syllabus-field-wide"><span>Milestone tiers (comma-separated)</span><input name="tiers" maxlength="500" placeholder="Level 1, Level 2, Level 3" value="Level 1, Level 2, Level 3" required></label>
      <label class="tracker-field syllabus-field-wide"><span>Apply to</span><select name="scope"><option value="subject">All chapters in this subject</option><option value="unit">All chapters in a unit</option><option value="chapter">One chapter only</option></select></label>
      <label class="tracker-field syllabus-field-wide" data-resource-unit-field hidden><span>Unit</span><select name="unit_name"></select></label>
      <label class="tracker-field syllabus-field-wide" data-resource-chapter-field hidden><span>Chapter</span><select name="chapter_id"></select></label>
      <div class="tracker-dialog-actions syllabus-field-wide"><button class="tracker-button secondary" type="button" data-close-dialog>Cancel</button><button class="tracker-button" type="submit">Save milestones</button></div>
    </form>
  </section></dialog>`;
}

function render() {
  const contents = activeView === "revisions" ? renderRevisions() : renderSyllabusTable();
  app.innerHTML = `<div class="tracker-page syllabus-page">
    <h1 class="sr-only">Syllabus tracker</h1>
    <button class="tracker-button syllabus-floating-action" type="button" data-open-resource><i data-lucide="plus"></i> Add a book</button>
    ${renderDashboard()}
    <nav class="syllabus-tabs" aria-label="Syllabus tracker views">
      <button type="button" data-view="syllabus" class="${activeView === "syllabus" ? "is-active" : ""}">Chapter master table</button>
      <button type="button" data-view="revisions" class="${activeView === "revisions" ? "is-active" : ""}">Revision radar</button>
      <a href="../error_log/">Error question log</a>
    </nav>
    ${contents}
    ${renderDialogs()}
  </div>`;
  window.lucide?.createIcons();
}

async function setCheckpoint(chapterId, checkpoint, completed) {
  const keys = checkpoint === "Lecture / theory notes" ? notesCheckpointKeys : [checkpoint];
  for (const key of keys) {
    const current = progressFor(chapterId, key);
    const { error } = await db.from("tracker_checkpoint_progress").upsert({
      user_id: user.id,
      chapter_id: chapterId,
      checkpoint_key: key,
      completed_at: completed ? current?.completed_at || new Date().toISOString() : null,
      score: current?.score ?? null,
      accuracy: current?.accuracy ?? null,
    }, { onConflict: "user_id,chapter_id,checkpoint_key" });
    if (error) throw error;
  }
  const isComplete = (key) => keys.includes(key) ? completed : Boolean(progressFor(chapterId, key)?.completed_at);
  const allCoreComplete = [...notesCheckpointKeys, "JEE Main PYQs", "JEE Advanced PYQs", "Chapter mock test"]
    .every(isComplete);
  if (completed && allCoreComplete) {
    const { error: awardError } = await db.rpc("award_tracker_chapter_milestone", { target_chapter_id: chapterId });
    if (awardError) throw awardError;
    if (!revisionPlanExists(chapterId)) {
      const { error: revisionError } = await db.rpc("schedule_tracker_revision", { target_chapter_id: chapterId });
      if (revisionError) throw revisionError;
    }
  }
  await refresh();
}

async function saveScore(input) {
  const score = input.value === "" ? null : Number(input.value);
  if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) throw new Error("Enter a test score between 0 and 100.");
  const current = progressFor(input.dataset.score, "Chapter mock test");
  const { error } = await db.from("tracker_checkpoint_progress").upsert({
    user_id: user.id,
    chapter_id: input.dataset.score,
    checkpoint_key: "Chapter mock test",
    completed_at: current?.completed_at || null,
    score,
    accuracy: current?.accuracy ?? null,
  }, { onConflict: "user_id,chapter_id,checkpoint_key" });
  if (error) throw error;
  await refresh();
  notify("Chapter test score saved.");
}

async function toggleTier(chapterId, tierId, checked) {
  const { error } = await db.from("tracker_resource_progress").upsert({
    user_id: user.id,
    tier_id: tierId,
    chapter_id: chapterId,
    completed_at: checked ? new Date().toISOString() : null,
  }, { onConflict: "user_id,tier_id,chapter_id" });
  if (error) throw error;
  await refresh();
}

async function createResource(form) {
  const values = new FormData(form);
  const subject = String(values.get("subject"));
  const name = String(values.get("name") || "").trim();
  const tierNames = [...new Set(String(values.get("tiers") || "").split(",").map((tier) => tier.trim()).filter(Boolean))];
  const scope = String(values.get("scope"));
  const unitName = String(values.get("unit_name") || "");
  if (!name || !tierNames.length) throw new Error("Enter a book name and at least one milestone tier.");
  if (scope === "unit" && !unitName) throw new Error("Choose a unit for this resource.");
  const chapterId = String(values.get("chapter_id") || "");
  const { data: resource, error: resourceError } = await db.from("tracker_resources")
    .insert({
      user_id: user.id,
      subject,
      name,
      unit_name: scope === "unit" ? unitName : null,
      chapter_id: scope === "chapter" ? chapterId : null,
    }).select("id").single();
  if (resourceError) throw resourceError;
  try {
    const { error: tierError } = await db.from("tracker_resource_tiers").insert(tierNames.map((tierName, index) => ({
      resource_id: resource.id,
      name: tierName,
      sort_order: index,
    })));
    if (tierError) throw tierError;
  } catch (error) {
    const { error: cleanupError } = await db.from("tracker_resources").delete().eq("id", resource.id);
    if (cleanupError) {
      throw new Error(`${error.message} The incomplete resource also could not be removed: ${cleanupError.message}`);
    }
    throw error;
  }
  app.querySelector("#resource-dialog")?.close();
  await refresh();
  const destination = scope === "subject" ? `all ${subject} chapters`
    : scope === "unit" ? `${unitName} chapters`
      : "the selected chapter";
  notify(`${name} added to ${destination}.`);
}

async function refresh() {
  await loadData();
  render();
}

function updateResourceChapterOptions(form) {
  const subject = form.elements.subject.value;
  const chapterSelect = form.elements.chapter_id;
  const unitSelect = form.elements.unit_name;
  unitSelect.innerHTML = [...new Set(chapters.filter((chapter) => chapter.subject === subject).map((chapter) => chapter.unit))]
    .map((unit) => `<option value="${escapeHtml(unit)}">${escapeHtml(unit)}</option>`).join("");
  chapterSelect.innerHTML = chapters.filter((chapter) => chapter.subject === subject)
    .map((chapter) => `<option value="${escapeHtml(chapter.id)}">${escapeHtml(chapter.title)}</option>`).join("");
}

function openResource(chapterId = "") {
  const dialog = app.querySelector("#resource-dialog");
  const form = app.querySelector("#resource-form");
  form.reset();
  const chapter = chapters.find((item) => item.id === chapterId);
  if (chapter) form.elements.subject.value = chapter.subject;
  updateResourceChapterOptions(form);
  if (chapter) {
    form.elements.scope.value = "chapter";
    form.elements.chapter_id.value = chapter.id;
  }
  form.querySelector("[data-resource-chapter-field]").hidden = form.elements.scope.value !== "chapter";
  form.querySelector("[data-resource-unit-field]").hidden = form.elements.scope.value !== "unit";
  dialog.showModal();
}

async function handleClick(event) {
  const button = event.target.closest("button");
  if (!button) return;
  try {
    if (button.dataset.view) {
      activeView = button.dataset.view;
      render();
    } else if (button.hasAttribute("data-open-resource")) openResource(button.dataset.chapter || "");
    else if (button.hasAttribute("data-close-dialog")) button.closest("dialog")?.close();
    else if (button.dataset.scheduleRevision) {
      const { error } = await db.rpc("schedule_tracker_revision", { target_chapter_id: button.dataset.scheduleRevision });
      if (error) throw error;
      await refresh();
      notify("R1 scheduled for 3 days from now.");
    }
    else if (button.dataset.completeRevision) {
      const { error } = await db.rpc("complete_tracker_revision", {
        target_chapter_id: button.dataset.completeRevision,
        target_stage: Number(button.dataset.stage),
      });
      if (error) throw error;
      await refresh();
      notify("Revision marked complete. Your next checkpoint is scheduled.");
    }
  } catch (error) {
    console.error("Could not update the syllabus tracker.", error);
    notify(error?.message || String(error), true);
  }
}

function bindEvents() {
  app.addEventListener("click", (event) => void handleClick(event));
  app.addEventListener("change", (event) => {
    const target = event.target;
    if (target.matches("[data-progress]")) {
      target.disabled = true;
      void setCheckpoint(target.dataset.chapter, target.dataset.progress, target.checked)
        .catch((error) => { notify(error?.message || String(error), true); void refresh().catch(showError); });
    } else if (target.matches("[data-tier]")) {
      target.disabled = true;
      void toggleTier(target.dataset.chapter, target.dataset.tier, target.checked)
        .catch((error) => { notify(error?.message || String(error), true); void refresh().catch(showError); });
    } else if (target.id === "subject-filter") {
      selectedSubject = target.value;
      render();
    } else if (target.id === "class-filter") {
      selectedClass = target.value;
      render();
    } else if (target.closest("#resource-form") && target.name === "subject") {
      const form = app.querySelector("#resource-form");
      updateResourceChapterOptions(form);
    } else if (target.closest("#resource-form") && target.name === "scope") {
      app.querySelector("[data-resource-chapter-field]").hidden = target.value !== "chapter";
      app.querySelector("[data-resource-unit-field]").hidden = target.value !== "unit";
    }
  });
  app.addEventListener("input", (event) => {
    if (event.target.id !== "chapter-search") return;
    search = event.target.value;
    const position = event.target.selectionStart;
    render();
    const replacement = app.querySelector("#chapter-search");
    replacement?.focus();
    replacement?.setSelectionRange(position, position);
  });
  app.addEventListener("focusout", (event) => {
    if (!event.target.matches("[data-score]")) return;
    void saveScore(event.target).catch((error) => notify(error?.message || String(error), true));
  });
  app.addEventListener("submit", (event) => {
    if (event.target.id === "resource-form") {
      event.preventDefault();
      void createResource(event.target).catch((error) => notify(error?.message || String(error), true));
    }
  });
}

async function initialize() {
  if (!isAppDataConfigured()) throw new Error("The app-data Supabase project is not configured.");
  const mainDb = getPrimarySupabaseClient();
  const { data, error } = await mainDb.auth.getSession();
  if (error) throw error;
  session = data.session;
  user = session?.user;
  if (!user) {
    const returnPath = `${location.pathname}${location.search}`;
    app.innerHTML = `<section class="theme-card tracker-sign-in"><span class="tracker-kicker">YOUR STUDY SPACE</span><h1>Track your JEE preparation</h1><p>Sign in with your SPRK account to keep your chapter progress, resources, and revision plan synced.</p><a class="tracker-button" href="../account/?return=${encodeURIComponent(returnPath)}">Sign in to continue</a></section>`;
    return;
  }
  db = getAppDataSupabaseClient(session);
  if (!db) throw new Error("The app-data Supabase client could not be created.");
  await ensureProfile();
  await loadData();
  bindEvents();
  render();
}

initialize().catch(showError);
