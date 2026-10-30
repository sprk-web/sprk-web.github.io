import { getPrimarySupabaseClient } from "../js/supabaseClient.js";
import { getAppDataSupabaseClient, isAppDataConfigured } from "../js/appDataSupabaseClient.js";
import { confirmDialog, promptDialog } from "../js/dialogs.js";

const app = document.querySelector("#quests-app");
const isGoalsRoute = document.body.dataset.page === "quests";
const checkpointNames = [
  "Lecture / theory notes",
  "Formula sheet / short notes",
  "JEE Main PYQs",
  "JEE Advanced PYQs",
  "Chapter mock test",
];
const categories = ["Theory", "Problem Solving", "Revision", "Mock Test"];
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]));
const today = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};
const checkpointId = (chapterId, checkpoint) => `${chapterId}:${checkpoint}`;

let db;
let session;
let mainDb;
let user;
let profile;
let mainProfile = {};
let subjects = [];
let chapters = [];
let checkpointProgress = new Map();
let tasks = [];
let activityTasks = [];
let revisions = [];
let selectedSubject = "All";
let search = "";
const requestedDate = new URLSearchParams(location.search).get("date") || "";
let selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
  && !Number.isNaN(new Date(`${requestedDate}T00:00:00`).getTime())
  ? requestedDate
  : today();
let leaderboardPeriod = "weekly";

function isAppDataAuthError(error) {
  return /no suitable key|wrong key type|invalid.*jwt|jwt.*(invalid|signature|issuer)|unauthorized|forbidden|current SPRK session uses|issuer does not match|has role/i
    .test(error?.message || "");
}

function explainError(error) {
  const message = error?.message || String(error);
  if (/current SPRK session uses/i.test(message)) return message;
  if (/issuer does not match|has role|access token is malformed/i.test(message)) return message;
  if (isAppDataAuthError(error)) {
    return `${message} In app-data Authentication → Sign In / Providers → Third-Party Auth, add a Custom OIDC provider with issuer https://esknzhyvlzxxgylkczyl.supabase.co/auth/v1.`;
  }
  if (/relation .* does not exist|could not find the table/i.test(message)) {
    return `${message} Apply the current supabase/sprk_app_data_schema.sql in the app-data Supabase project.`;
  }
  return message;
}

function showError(error) {
  console.error("Could not load the SPRK study tracker.", error);
  app.innerHTML = `<section class="theme-card tracker-error">
    <span class="tracker-kicker">STUDY SPACE</span>
    <h1>We couldn’t open your tracker</h1>
    <p>${escapeHtml(explainError(error))}</p>
    <a class="tracker-button" href="../account/">Return to your account</a>
  </section>`;
}

function signedOut() {
  const returnPath = `${location.pathname}${location.search}`;
  app.innerHTML = `<section class="theme-card tracker-sign-in">
    <span class="tracker-kicker">YOUR STUDY SPACE</span>
    <h1>Keep your progress with you</h1>
    <p>Sign in to save syllabus progress, daily goals, and leaderboard settings to your SPRK account.</p>
    <a class="tracker-button" href="../account/?return=${encodeURIComponent(returnPath)}">Sign in to continue</a>
  </section>`;
}

async function ensureProfile() {
  const { data: existing, error: selectError } = await db.from("tracker_profiles")
    .select("user_id,handle,avatar_url,leaderboard_opt_in,total_xp,current_streak,last_study_date,best_leaderboard_rank")
    .eq("user_id", user.id)
    .maybeSingle();
  if (selectError) throw selectError;

  const initialHandle = String(mainProfile.display_name || user.user_metadata?.display_name || user.email?.split("@")[0] || "Learner")
    .trim().slice(0, 80) || "Learner";
  if (existing) {
    if (existing.handle === initialHandle && existing.avatar_url === (mainProfile.avatar_url || null)) return existing;
    const { data, error } = await db.from("tracker_profiles").update({
      handle: initialHandle,
      avatar_url: mainProfile.avatar_url || null,
    }).eq("user_id", user.id)
      .select("user_id,handle,avatar_url,leaderboard_opt_in,total_xp,current_streak,last_study_date,best_leaderboard_rank")
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await db.from("tracker_profiles")
    .insert({ user_id: user.id, handle: initialHandle, avatar_url: mainProfile.avatar_url || null })
    .select("user_id,handle,avatar_url,leaderboard_opt_in,total_xp,current_streak,last_study_date,best_leaderboard_rank")
    .single();
  if (error?.code === "23505") {
    const { data: concurrentProfile, error: retryError } = await db.from("tracker_profiles")
      .select("user_id,handle,avatar_url,leaderboard_opt_in,total_xp,current_streak,last_study_date,best_leaderboard_rank")
      .eq("user_id", user.id)
      .single();
    if (retryError) throw retryError;
    return concurrentProfile;
  }
  if (error) throw error;
  return data;
}

async function loadTrackerData() {
  const results = await Promise.all([
    db.from("tracker_subjects").select("name,sort_order").order("sort_order"),
    db.from("tracker_chapters").select("id,subject,unit,title,weightage,sort_order").order("sort_order"),
    db.from("tracker_checkpoint_progress").select("chapter_id,checkpoint_key,completed_at,score,accuracy").eq("user_id", user.id),
    db.from("tracker_tasks").select("id,title,category,chapter_id,planned_for,priority,planned_minutes,problem_count,status,completed_at,created_at").eq("user_id", user.id).eq("planned_for", selectedDate).order("priority").order("created_at"),
    db.rpc("get_tracker_goal_activity"),
    db.from("tracker_revisions").select("chapter_id,stage,due_at,completed_at").eq("user_id", user.id).is("completed_at", null).order("due_at"),
  ]);
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
  subjects = results[0].data || [];
  chapters = results[1].data || [];
  checkpointProgress = new Map((results[2].data || []).map((item) => [
    checkpointId(item.chapter_id, item.checkpoint_key),
    item,
  ]));
  tasks = results[3].data || [];
  activityTasks = results[4].data || [];
  revisions = results[5].data || [];
}

function checkpointCount(chapterId) {
  return checkpointNames.filter((name) => checkpointProgress.get(checkpointId(chapterId, name))?.completed_at).length;
}

function progressSummary() {
  const total = chapters.length * checkpointNames.length;
  const completed = [...checkpointProgress.values()].filter((item) => item.completed_at).length;
  const completedChapters = chapters.filter((chapter) => checkpointCount(chapter.id) === checkpointNames.length).length;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  return { total, completed, completedChapters, percent };
}

function renderPage(content) {
  const summary = progressSummary();
  const topStats = isGoalsRoute
    ? `<section class="tracker-summary-grid tracker-goals-stats" aria-label="Daily goals statistics">
        <article class="theme-card tracker-stat"><span>Study streak</span><strong>${Number(profile.current_streak) || 0}<small> days</small></strong></article>
        <article class="theme-card tracker-stat"><span>Total XP</span><strong>${Number(profile.total_xp) || 0}</strong></article>
        <article class="theme-card tracker-stat"><span>Current rank</span><strong>${profile.current_leaderboard_rank ? `#${profile.current_leaderboard_rank}` : "—"}</strong></article>
        <article class="theme-card tracker-stat"><span>Highest rank</span><strong>${profile.best_leaderboard_rank ? `#${profile.best_leaderboard_rank}` : "—"}</strong></article>
      </section>`
    : `<section class="tracker-summary-grid" aria-label="Your progress">
        <article class="theme-card tracker-stat"><span>Overall syllabus</span><strong>${summary.percent}%</strong><small>${summary.completed} of ${summary.total} checkpoints</small><span class="tracker-progress"><i style="width:${summary.percent}%"></i></span></article>
        <article class="theme-card tracker-stat"><span>Chapters mastered</span><strong>${summary.completedChapters}<small> / ${chapters.length}</small></strong><small>All five checkpoints complete</small></article>
        <article class="theme-card tracker-stat"><span>Study streak</span><strong>${Number(profile.current_streak) || 0}<small> days</small></strong><small>Keep a daily rhythm</small></article>
        <article class="theme-card tracker-stat"><span>Total XP</span><strong>${Number(profile.total_xp) || 0}</strong><small>Earned from focused learning</small></article>
      </section>`;
  app.innerHTML = `<div class="tracker-page">
    ${isGoalsRoute ? `<button class="tracker-button tracker-floating-goal" type="button" id="open-goal-dialog"><i data-lucide="plus"></i>Add goal</button>` : ""}
    ${topStats}
    ${content}
  </div>`;
  window.lucide?.createIcons();
}

function visibleChapters() {
  const query = search.trim().toLowerCase();
  return chapters.filter((chapter) =>
    (selectedSubject === "All" || chapter.subject === selectedSubject)
    && (!query || `${chapter.subject} ${chapter.unit} ${chapter.title}`.toLowerCase().includes(query)));
}

function renderChapterCard(chapter) {
  const completed = checkpointCount(chapter.id);
  const percent = Math.round((completed / checkpointNames.length) * 100);
  const dueRevision = revisions.find((item) => item.chapter_id === chapter.id);
  const allDone = completed === checkpointNames.length;
  return `<article class="theme-card tracker-chapter">
    <div class="tracker-chapter-heading">
      <div><span class="tracker-kicker">${escapeHtml(chapter.subject)} · ${escapeHtml(chapter.unit)}</span><h3>${escapeHtml(chapter.title)}</h3></div>
      <span class="tracker-weight" title="Syllabus weight">Weight ${Number(chapter.weightage)}/5</span>
    </div>
    <div class="tracker-chapter-progress"><span>${completed}/5 checkpoints</span><span>${percent}%</span><span class="tracker-progress"><i style="width:${percent}%"></i></span></div>
    <div class="tracker-checkpoints">${checkpointNames.map((name) => {
      const progress = checkpointProgress.get(checkpointId(chapter.id, name));
      const checked = Boolean(progress?.completed_at);
      return `<label class="tracker-checkpoint"><input type="checkbox" data-checkpoint="${escapeHtml(name)}" data-chapter="${escapeHtml(chapter.id)}" ${checked ? "checked" : ""}><span>${escapeHtml(name)}</span></label>`;
    }).join("")}</div>
    <div class="tracker-chapter-actions">
      ${allDone && !dueRevision ? `<button class="tracker-button secondary" type="button" data-schedule-revision="${escapeHtml(chapter.id)}">Schedule spaced revision</button>` : ""}
      ${dueRevision ? `<span class="tracker-due-label">${new Date(dueRevision.due_at) <= new Date() ? "Revision due now" : `Next revision ${escapeHtml(new Date(dueRevision.due_at).toLocaleDateString())}`}</span>` : ""}
      <a class="tracker-text-link" href="../quests/?chapter=${encodeURIComponent(chapter.id)}">Plan a study session <i data-lucide="arrow-up-right"></i></a>
    </div>
  </article>`;
}

function renderSyllabus() {
  const filtered = visibleChapters();
  const due = revisions.filter((item) => new Date(item.due_at) <= new Date());
  return `<div class="tracker-toolbar">
    <label class="tracker-search"><i data-lucide="search"></i><input id="chapter-search" type="search" value="${escapeHtml(search)}" placeholder="Find a chapter" aria-label="Search syllabus chapters"></label>
    <label class="tracker-subject-filter"><span>Subject</span><select id="subject-filter"><option value="All">All subjects</option>${subjects.map((subject) => `<option value="${escapeHtml(subject.name)}" ${selectedSubject === subject.name ? "selected" : ""}>${escapeHtml(subject.name)}</option>`).join("")}</select></label>
  </div>
  ${due.length ? `<section class="theme-card tracker-revision-banner"><div><span class="tracker-kicker">SPACED REVISION</span><h2>${due.length} revision${due.length === 1 ? "" : "s"} ready</h2><p>Review completed chapters now to reinforce long-term recall.</p></div><a class="tracker-button secondary" href="../quests/">Open Daily Goals</a></section>` : ""}
  <div class="tracker-chapter-list">${filtered.map(renderChapterCard).join("") || `<section class="theme-card tracker-empty"><h2>No chapters match</h2><p>Try a different search or subject.</p></section>`}</div>`;
}

function renderTask(task) {
  const chapter = chapters.find((item) => item.id === task.chapter_id);
  return `<article class="tracker-task ${task.status === "completed" ? "is-complete" : ""}">
    <div class="tracker-task-main">
      <span class="tracker-task-status">${task.status === "completed" ? "✓" : task.status === "in_progress" ? "◷" : "○"}</span>
      <div><h3>${escapeHtml(task.title)}</h3><p>${escapeHtml(task.category)}${chapter ? ` · ${escapeHtml(chapter.title)}` : ""} · ${Number(task.planned_minutes)} min</p></div>
    </div>
    <div class="tracker-task-actions">
      ${task.status === "planned" ? `<button type="button" class="tracker-button secondary" data-start-task="${escapeHtml(task.id)}">Start</button>` : ""}
      ${task.status !== "completed" ? `<button type="button" class="tracker-button" data-complete-task="${escapeHtml(task.id)}">Complete</button>` : `<span class="tracker-xp-badge">Done · XP earned</span>`}
      ${task.status !== "completed" ? `<button type="button" class="tracker-icon-action" data-delete-task="${escapeHtml(task.id)}" aria-label="Delete ${escapeHtml(task.title)}"><i data-lucide="trash-2"></i></button>` : ""}
    </div>
  </article>`;
}

async function getLeaderboard(period) {
  const { data, error } = await db.rpc("get_tracker_leaderboard", { period });
  if (error) throw error;
  return data || [];
}

async function renderLeaderboard() {
  const [entries, allTimeEntries] = await Promise.all([
    getLeaderboard(leaderboardPeriod),
    leaderboardPeriod === "all_time" ? Promise.resolve(null) : getLeaderboard("all_time"),
  ]);
  const bestEntries = allTimeEntries || entries;
  const currentEntry = entries.find((entry) => entry.is_self);
  const allTimeEntry = bestEntries.find((entry) => entry.is_self);
  profile.current_leaderboard_rank = currentEntry ? Number(currentEntry.leaderboard_rank) : null;
  if (allTimeEntry) {
    const allTimeRank = Number(allTimeEntry.leaderboard_rank);
    const bestRank = Number(profile.best_leaderboard_rank) || allTimeRank;
    if (allTimeRank < bestRank) {
      const { error } = await db.from("tracker_profiles").update({ best_leaderboard_rank: allTimeRank }).eq("user_id", user.id);
      if (error) throw error;
      profile.best_leaderboard_rank = allTimeRank;
    }
  }
  const username = mainProfile.display_name?.trim() || user.user_metadata?.display_name || user.email?.split("@")[0] || profile.handle;
  return `<section class="theme-card tracker-leaderboard">
    <div class="tracker-panel-heading"><div><h2>Leaderboard</h2></div>
      <select id="leaderboard-period" aria-label="Leaderboard period"><option value="weekly" ${leaderboardPeriod === "weekly" ? "selected" : ""}>This week</option><option value="all_time" ${leaderboardPeriod === "all_time" ? "selected" : ""}>All time</option></select>
    </div>
    ${entries.length ? `<ol class="tracker-leaderboard-list">${entries.map((entry) => {
    const displayName = entry.is_self ? username : entry.display_handle;
    const picture = entry.avatar_url
      ? `<img src="${escapeHtml(entry.avatar_url)}" alt="">`
      : `<span aria-hidden="true">${escapeHtml(displayName.trim().slice(0, 1).toUpperCase() || "L")}</span>`;
    return `<li class="${entry.is_self ? "is-self" : ""}">
      <span class="tracker-rank">${Number(entry.leaderboard_rank)}</span><span class="tracker-leader-avatar">${picture}</span><span class="tracker-leader-name">${escapeHtml(displayName)}${entry.is_self ? " · You" : ""}</span><strong>${Number(entry.xp).toLocaleString()} XP</strong>
    </li>`;
  }).join("")}</ol>` : `<div class="tracker-leaderboard-empty"><span class="tracker-leaderboard-empty-icon"><i data-lucide="trophy"></i></span><strong>No rankings yet</strong><span>Complete a study goal to earn XP and join the leaderboard.</span></div>`}
  </section>`;
}

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function renderConsistencyHeatmap() {
  const completedByDate = new Map(activityTasks.map((activity) => [
    activity.activity_date,
    Number(activity.goals_completed),
  ]));
  const endDate = new Date();
  endDate.setHours(0, 0, 0, 0);
  const firstDate = new Date(endDate);
  firstDate.setDate(firstDate.getDate() - 364);
  firstDate.setDate(firstDate.getDate() - firstDate.getDay());
  const days = [];
  for (const date = new Date(firstDate); date <= endDate; date.setDate(date.getDate() + 1)) {
    const key = localDateKey(date);
    const count = completedByDate.get(key) || 0;
    const level = count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count <= 4 ? 3 : 4;
    days.push(`<span class="tracker-heatmap-day level-${level}" title="${key}: ${count} completed ${count === 1 ? "goal" : "goals"}" aria-label="${key}: ${count} completed ${count === 1 ? "goal" : "goals"}"></span>`);
  }
  return `<section class="theme-card tracker-heatmap" aria-label="Study consistency over the last year">
    <div class="tracker-panel-heading"><div><h2>Consistency</h2><p>Completed study goals over the last year</p></div></div>
    <div class="tracker-heatmap-scroll"><div class="tracker-heatmap-grid">${days.join("")}</div></div>
    <div class="tracker-heatmap-legend"><span>Less</span>${[0, 1, 2, 3, 4].map((level) => `<i class="level-${level}" aria-hidden="true"></i>`).join("")}<span>More</span></div>
  </section>`;
}

async function renderGoals() {
  const queryChapter = new URLSearchParams(location.search).get("chapter");
  const leaderboard = await renderLeaderboard();
  const done = tasks.filter((task) => task.status === "completed").length;
  return `<div class="tracker-goals-page">
  ${renderConsistencyHeatmap()}
  <section class="tracker-goals-layout">
    <div class="tracker-goal-column">
      <section class="theme-card tracker-panel tracker-today-panel">
        <div class="tracker-panel-heading"><div><h2>Daily goals</h2><p>${done} of ${tasks.length} goals completed</p></div><input id="goal-date" type="date" value="${escapeHtml(selectedDate)}" aria-label="Choose goals date"></div>
        <div class="tracker-task-list">${tasks.map(renderTask).join("") || `<div class="tracker-empty"><h3>No goals planned for this day</h3><p>Add a goal or choose another date to review your plan.</p></div>`}</div>
      </section>
    </div>
    <aside class="tracker-goals-aside">
      ${leaderboard}
    </aside>
  </section>
  <dialog id="goal-dialog" class="tracker-goal-dialog" aria-labelledby="goal-dialog-title">
    <section class="theme-card tracker-panel">
      <div class="tracker-panel-heading"><div><h2 id="goal-dialog-title">Add a daily goal</h2><p>Make your next study session specific.</p></div><button class="tracker-icon-action" type="button" data-close-goal-dialog aria-label="Close dialog"><i data-lucide="x"></i></button></div>
      <form id="task-form" class="tracker-task-form">
          <label class="tracker-field tracker-field-wide"><span>What will you work on?</span><input name="title" maxlength="120" placeholder="e.g. Revise Newton’s laws" required></label>
          <label class="tracker-field"><span>Study type</span><select name="category">${categories.map((category) => `<option>${escapeHtml(category)}</option>`).join("")}</select></label>
          <label class="tracker-field"><span>Chapter</span><select name="chapter_id"><option value="">Choose later</option>${chapters.map((chapter) => `<option value="${escapeHtml(chapter.id)}" ${queryChapter === chapter.id ? "selected" : ""}>${escapeHtml(chapter.subject)} · ${escapeHtml(chapter.title)}</option>`).join("")}</select></label>
          <label class="tracker-field"><span>Date</span><input type="date" name="planned_for" value="${escapeHtml(selectedDate)}" required></label>
          <label class="tracker-field"><span>Duration</span><select name="planned_minutes">${[15,25,30,45,60,90,120].map((minutes) => `<option value="${minutes}" ${minutes === 25 ? "selected" : ""}>${minutes} minutes</option>`).join("")}</select></label>
          <label class="tracker-field"><span>Priority</span><select name="priority"><option value="1">High</option><option value="2" selected>Normal</option><option value="3">Low</option></select></label>
          <div class="tracker-dialog-actions tracker-field-wide"><button class="tracker-button secondary" type="button" data-close-goal-dialog>Cancel</button><button class="tracker-button" type="submit"><i data-lucide="plus"></i>Add goal</button></div>
      </form>
    </section>
  </dialog>
  </div>`;
}

async function refresh() {
  await loadTrackerData();
  renderPage(isGoalsRoute ? await renderGoals() : renderSyllabus());
}

async function updateCheckpoint(input) {
  const chapterId = input.dataset.chapter;
  const checkpoint = input.dataset.checkpoint;
  const key = checkpointId(chapterId, checkpoint);
  const current = checkpointProgress.get(key);
  const { error } = await db.from("tracker_checkpoint_progress").upsert({
    user_id: user.id,
    chapter_id: chapterId,
    checkpoint_key: checkpoint,
    completed_at: input.checked ? new Date().toISOString() : null,
    score: current?.score ?? null,
    accuracy: current?.accuracy ?? null,
  }, { onConflict: "user_id,chapter_id,checkpoint_key" });
  if (error) throw error;
  const completedCount = checkpointCount(chapterId)
    + (input.checked && !current?.completed_at ? 1 : 0)
    - (!input.checked && current?.completed_at ? 1 : 0);
  if (input.checked && completedCount === checkpointNames.length) {
    const { error: awardError } = await db.rpc("award_tracker_chapter_milestone", { target_chapter_id: chapterId });
    if (awardError) throw awardError;
  }
  await refresh();
}

async function addTask(form) {
  const values = new FormData(form);
  const payload = {
    user_id: user.id,
    title: String(values.get("title") || "").trim(),
    category: String(values.get("category")),
    chapter_id: String(values.get("chapter_id") || "") || null,
    planned_for: String(values.get("planned_for")),
    priority: Number(values.get("priority")),
    planned_minutes: Number(values.get("planned_minutes")),
  };
  const { error } = await db.from("tracker_tasks").insert(payload);
  if (error) throw error;
  selectedDate = payload.planned_for;
  await refresh();
}

async function completeTask(taskId) {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) throw new Error("That study goal is no longer available.");
  let solvedCount = 0;
  if (task.category === "Problem Solving") {
    const response = await promptDialog("How many problems did you solve?", "0", { title: "Log completed problems", confirmLabel: "Save" });
    if (response === null) return;
    solvedCount = Number(response);
    if (!Number.isInteger(solvedCount) || solvedCount < 0 || solvedCount > 10000) {
      throw new Error("Enter a whole number between 0 and 10,000.");
    }
  }
  const { error } = await db.rpc("complete_tracker_task", { task_id: taskId, solved_count: solvedCount });
  if (error) throw error;
  await refresh();
}

async function scheduleRevision(chapterId) {
  const { error } = await db.rpc("schedule_tracker_revision", { target_chapter_id: chapterId });
  if (error) throw error;
  await refresh();
}

async function handleClick(event) {
  const button = event.target.closest("button");
  if (!button) return;
  try {
    if (button.id === "open-goal-dialog") {
      app.querySelector("#goal-dialog")?.showModal();
      return;
    }
    if (button.hasAttribute("data-close-goal-dialog")) {
      app.querySelector("#goal-dialog")?.close();
      return;
    }
    if (button.dataset.scheduleRevision) await scheduleRevision(button.dataset.scheduleRevision);
    if (button.dataset.completeTask) await completeTask(button.dataset.completeTask);
    if (button.dataset.startTask) {
      const { error } = await db.from("tracker_tasks").update({ status: "in_progress" }).eq("id", button.dataset.startTask);
      if (error) throw error;
      await refresh();
    }
    if (button.dataset.deleteTask) {
      if (!await confirmDialog("Delete this study goal?", { title: "Delete study goal", confirmLabel: "Delete", danger: true })) return;
      const { error } = await db.from("tracker_tasks").delete().eq("id", button.dataset.deleteTask);
      if (error) throw error;
      await refresh();
    }
  } catch (error) {
    showError(error);
  }
}

function bindEvents() {
  app.addEventListener("click", (event) => void handleClick(event));
  app.addEventListener("change", (event) => {
    const input = event.target;
    if (input.matches("[data-checkpoint]")) {
      input.disabled = true;
      void updateCheckpoint(input).catch(showError);
    }
    if (input.id === "subject-filter") {
      selectedSubject = input.value;
      renderPage(renderSyllabus());
    }
    if (input.id === "goal-date") {
      selectedDate = input.value || today();
      const next = new URL(location.href);
      next.searchParams.set("date", selectedDate);
      history.replaceState(null, "", next);
      void refresh().catch(showError);
    }
    if (input.id === "leaderboard-period") {
      leaderboardPeriod = input.value;
      void refresh().catch(showError);
    }
  });
  app.addEventListener("input", (event) => {
    if (event.target.id !== "chapter-search") return;
    search = event.target.value;
    const cursor = event.target.selectionStart;
    renderPage(renderSyllabus());
    const replacement = app.querySelector("#chapter-search");
    replacement?.focus();
    replacement?.setSelectionRange(cursor, cursor);
  });
  app.addEventListener("submit", (event) => {
    if (event.target.id === "task-form") {
      event.preventDefault();
      void addTask(event.target).catch(showError);
    }
  });
}

async function initialize() {
  if (!isAppDataConfigured()) throw new Error("The app-data Supabase project is not configured.");
  mainDb = getPrimarySupabaseClient();
  const { data, error } = await mainDb.auth.getSession();
  if (error) throw error;
  session = data.session;
  user = session?.user;
  if (!user) {
    signedOut();
    return;
  }
  const { data: accountProfile, error: accountProfileError } = await mainDb.from("profiles")
    .select("display_name,avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  if (accountProfileError) throw accountProfileError;
  mainProfile = accountProfile || {};
  db = getAppDataSupabaseClient(session);
  if (!db) throw new Error("The app-data Supabase client could not be created.");
  profile = await ensureProfile();
  await loadTrackerData();
  bindEvents();
  renderPage(isGoalsRoute ? await renderGoals() : renderSyllabus());
}

initialize().catch(showError);
