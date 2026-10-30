import { confirmDialog } from "../js/dialogs.js";

import { getPrimarySupabaseClient } from "../js/supabaseClient.js";
import { getAppDataSupabaseClient, isAppDataConfigured } from "../js/appDataSupabaseClient.js";

const app = document.querySelector("#error-log-app");
const imageBucket = "tracker-error-images";
const imageLimit = 8 * 1024 * 1024;
const allowedImageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const imageExtensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]));

let db;
let session;
let user;
let subjects = [];
let chapters = [];
let questions = [];
const filters = { subject: "All", chapter: "All", difficulty: "All", status: "open", sort: "newest", query: "" };

function notify(message, isError = false) {
  let notice = app.querySelector("#error-log-notice");
  if (!notice) {
    notice = document.createElement("div");
    notice.id = "error-log-notice";
    notice.className = "error-log-notice";
    notice.setAttribute("role", "status");
    app.prepend(notice);
  }
  notice.textContent = message;
  notice.dataset.error = String(isError);
  notice.hidden = false;
  window.clearTimeout(notice.timer);
  notice.timer = window.setTimeout(() => { notice.hidden = true; }, 4500);
}

function showError(error) {
  console.error("Could not load the SPRK error question log.", error);
  const rawMessage = error?.message || String(error);
  const message = /relation .* does not exist|could not find the table|column .* does not exist/i.test(rawMessage)
    ? `${rawMessage} Apply error_log/migration.sql in the app-data Supabase project.`
    : rawMessage;
  app.innerHTML = `<section class="theme-card error-log-fatal"><span class="error-log-kicker">ERROR QUESTION LOG</span><h1>We couldn’t open your question log</h1><p>${escapeHtml(message)}</p><a class="error-log-button secondary" href="../syllabus_tracker/">Return to your syllabus tracker</a></section>`;
}

function updateChapterOptions(form) {
  const subject = form.elements.subject.value;
  const chapterSelect = form.elements.chapter_id;
  const options = chapters.filter((chapter) => chapter.subject === subject);
  chapterSelect.innerHTML = `<option value="">Choose a chapter</option>${options.map((chapter) => `<option value="${escapeHtml(chapter.id)}">${escapeHtml(chapter.title)}</option>`).join("")}`;
  chapterSelect.disabled = !options.length;
}

function renderQuestion(question) {
  const chapter = chapters.find((item) => item.id === question.chapter_id);
  const tags = Array.isArray(question.tags) ? question.tags : [];
  return `<article class="error-log-card">
    <div class="error-log-card-top">
      <button type="button" class="error-log-star ${question.is_starred ? "is-starred" : ""}" data-star="${escapeHtml(question.id)}" aria-label="${question.is_starred ? "Unstar" : "Star"} question">${question.is_starred ? "★" : "☆"}</button>
      <div class="error-log-card-copy">
        <h2>${escapeHtml(chapter?.title || "Chapter removed")}</h2>
        <p>${escapeHtml(question.question)}</p>
        ${question.notes ? `<p class="error-log-notes">${escapeHtml(question.notes)}</p>` : ""}
        ${question.image_url ? `<a href="${escapeHtml(question.image_url)}" target="_blank" rel="noopener noreferrer"><img class="error-log-image" src="${escapeHtml(question.image_url)}" alt="Image attached to question" loading="lazy"></a>` : ""}
        <div class="error-log-meta"><span class="error-log-badge">${escapeHtml(chapter?.subject || "Subject unavailable")}</span><span class="error-log-badge">${escapeHtml(question.difficulty)}</span><span class="error-log-badge priority">Priority ${Number(question.priority)}/5</span><span class="error-log-badge">${escapeHtml(new Date(question.created_at).toLocaleDateString())}</span></div>
        ${tags.length ? `<div class="error-log-tags">${tags.map((tag) => `<span class="error-log-tag">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      </div>
      <div class="error-log-card-actions">${question.status === "resolved"
        ? '<span class="error-log-badge">Done</span>'
        : `<button class="error-log-button secondary" type="button" data-resolve="${escapeHtml(question.id)}">Mark done</button>`}
        <button class="error-log-button danger" type="button" data-delete="${escapeHtml(question.id)}">Delete</button>
      </div>
    </div>
  </article>`;
}

function visibleQuestions() {
  const query = filters.query.trim().toLowerCase();
  const visible = questions.filter((question) => {
    const chapter = chapters.find((item) => item.id === question.chapter_id);
    const matchesText = !query || `${question.question} ${question.notes || ""} ${chapter?.title || ""} ${chapter?.subject || ""} ${(question.tags || []).join(" ")}`.toLowerCase().includes(query);
    return (filters.subject === "All" || chapter?.subject === filters.subject)
      && (filters.chapter === "All" || question.chapter_id === filters.chapter)
      && (filters.difficulty === "All" || question.difficulty === filters.difficulty)
      && (filters.status === "all" || (filters.status === "resolved") === (question.status === "resolved"))
      && matchesText;
  });
  const difficultyRank = { Easy: 1, Medium: 2, Hard: 3 };
  const sorters = {
    newest: (a, b) => new Date(b.created_at) - new Date(a.created_at),
    oldest: (a, b) => new Date(a.created_at) - new Date(b.created_at),
    priority_high: (a, b) => Number(b.priority) - Number(a.priority) || new Date(b.created_at) - new Date(a.created_at),
    priority_low: (a, b) => Number(a.priority) - Number(b.priority) || new Date(b.created_at) - new Date(a.created_at),
    difficulty_high: (a, b) => difficultyRank[b.difficulty] - difficultyRank[a.difficulty] || new Date(b.created_at) - new Date(a.created_at),
    difficulty_low: (a, b) => difficultyRank[a.difficulty] - difficultyRank[b.difficulty] || new Date(b.created_at) - new Date(a.created_at),
  };
  return visible.sort(sorters[filters.sort] || sorters.newest);
}

function render() {
  const subjectOptions = subjects.map((subject) => `<option value="${escapeHtml(subject.name)}" ${filters.subject === subject.name ? "selected" : ""}>${escapeHtml(subject.name)}</option>`).join("");
  const chapterOptions = chapters.filter((chapter) => filters.subject === "All" || chapter.subject === filters.subject)
    .map((chapter) => `<option value="${escapeHtml(chapter.id)}" ${filters.chapter === chapter.id ? "selected" : ""}>${escapeHtml(chapter.title)}</option>`).join("");
  const rows = visibleQuestions();
  app.innerHTML = `<div class="error-log-page">
    <h1 class="sr-only">Error and starred question log</h1>
    <button class="error-log-button error-log-floating-action" type="button" data-open-question><i data-lucide="plus" class="h-4 w-4"></i> Log a question</button>
    <div id="error-log-notice" class="error-log-notice" role="status" hidden></div>
    <section class="theme-card error-log-panel" aria-label="Saved questions">
      <div class="error-log-toolbar">
        <label>Search<input id="error-log-search" type="search" value="${escapeHtml(filters.query)}" placeholder="Search questions, chapters, tags"></label>
        <label>Subject<select id="error-log-subject"><option value="All">All subjects</option>${subjectOptions}</select></label>
        <label>Chapter<select id="error-log-chapter"><option value="All">All chapters</option>${chapterOptions}</select></label>
        <label>Difficulty<select id="error-log-difficulty"><option value="All">All levels</option>${["Easy", "Medium", "Hard"].map((item) => `<option ${filters.difficulty === item ? "selected" : ""}>${item}</option>`).join("")}</select></label>
        <label>Status<select id="error-log-status"><option value="open" ${filters.status === "open" ? "selected" : ""}>To revisit</option><option value="resolved" ${filters.status === "resolved" ? "selected" : ""}>Done</option><option value="all" ${filters.status === "all" ? "selected" : ""}>All questions</option></select></label>
        <label>Sort by<select id="error-log-sort">
          <option value="newest" ${filters.sort === "newest" ? "selected" : ""}>Newest first</option>
          <option value="oldest" ${filters.sort === "oldest" ? "selected" : ""}>Oldest first</option>
          <option value="priority_high" ${filters.sort === "priority_high" ? "selected" : ""}>Highest priority</option>
          <option value="priority_low" ${filters.sort === "priority_low" ? "selected" : ""}>Lowest priority</option>
          <option value="difficulty_high" ${filters.sort === "difficulty_high" ? "selected" : ""}>Hardest first</option>
          <option value="difficulty_low" ${filters.sort === "difficulty_low" ? "selected" : ""}>Easiest first</option>
        </select></label>
      </div>
      <div class="error-log-list">${rows.map(renderQuestion).join("") || `<div class="error-log-empty"><h2>No questions found</h2><p>${questions.length ? "Try changing the filters." : "Log a question to save it for your next revision."}</p></div>`}</div>
    </section>
  </div>
  <dialog id="error-log-dialog" class="error-log-dialog" aria-labelledby="error-log-dialog-title">
    <section class="error-log-dialog-content">
      <div class="error-log-dialog-heading"><div><h2 id="error-log-dialog-title">Log a question</h2><p>Subject, chapter, difficulty, and priority are required.</p></div><button class="error-log-button secondary" type="button" data-close-dialog aria-label="Close dialog">Close</button></div>
      <div id="error-log-form-notice" class="error-log-notice" role="status" hidden></div>
      <form id="error-log-form" class="error-log-form">
        <label class="error-log-field"><span>Subject *</span><select name="subject" required><option value="">Choose a subject</option>${subjects.map((subject) => `<option value="${escapeHtml(subject.name)}">${escapeHtml(subject.name)}</option>`).join("")}</select></label>
        <label class="error-log-field"><span>Chapter *</span><select name="chapter_id" required disabled><option value="">Choose a subject first</option></select></label>
        <label class="error-log-field"><span>Difficulty *</span><select name="difficulty" required><option value="">Choose difficulty</option><option>Easy</option><option>Medium</option><option>Hard</option></select></label>
        <label class="error-log-field"><span>Priority (1–5) *</span><select name="priority" required><option value="">Choose priority</option>${[1, 2, 3, 4, 5].map((priority) => `<option value="${priority}">${priority}${priority === 5 ? " · Highest" : priority === 1 ? " · Lowest" : ""}</option>`).join("")}</select></label>
        <label class="error-log-field error-log-field-wide"><span>Question / prompt *</span><textarea name="question" maxlength="2000" rows="4" required placeholder="Write the question or a short identifier"></textarea></label>
        <label class="error-log-field error-log-field-wide"><span>Why revisit it? (optional)</span><textarea name="notes" maxlength="1000" rows="2" placeholder="Mistake, concept, or source"></textarea></label>
        <label class="error-log-field error-log-field-wide"><span>Tags (optional, comma-separated)</span><input name="tags" maxlength="500" placeholder="e.g. sign error, rotational motion"></label>
        <label class="error-log-field error-log-field-wide"><span>Question image (optional, max 8 MB)</span><input name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label>
        <label class="error-log-star-check"><input name="is_starred" type="checkbox"> Star this question</label>
        <div class="error-log-form-actions"><button class="error-log-button secondary" type="button" data-close-dialog>Cancel</button><button class="error-log-button" type="submit">Save question</button></div>
      </form>
    </section>
  </dialog>`;
  window.lucide?.createIcons();
}

async function loadData() {
  const results = await Promise.all([
    db.from("tracker_subjects").select("name,sort_order").order("sort_order"),
    db.from("tracker_chapters").select("id,subject,title,sort_order").order("sort_order"),
    db.from("tracker_error_questions")
      .select("id,chapter_id,question,notes,is_starred,status,created_at,difficulty,priority,tags,image_path")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);
  const failure = results.find((result) => result.error);
  if (failure?.error) throw failure.error;
  subjects = results[0].data || [];
  chapters = results[1].data || [];
  const rows = results[2].data || [];
  questions = await Promise.all(rows.map(async (question) => {
    if (!question.image_path) return { ...question, image_url: null };
    const { data, error } = await db.storage.from(imageBucket).createSignedUrl(question.image_path, 3600);
    if (error) throw error;
    return { ...question, image_url: data.signedUrl };
  }));
}

async function saveQuestion(form) {
  const values = new FormData(form);
  const image = values.get("image");
  const chapterId = String(values.get("chapter_id") || "");
  const subject = String(values.get("subject") || "");
  const chapter = chapters.find((item) => item.id === chapterId && item.subject === subject);
  if (!chapter) throw new Error("Choose a chapter that belongs to the selected subject.");
  const hasImage = image instanceof File && image.size > 0;
  if (hasImage && !allowedImageTypes.includes(image.type)) throw new Error("Choose a JPG, PNG, WebP, or GIF image.");
  if (hasImage && image.size > imageLimit) throw new Error("Question images must be 8 MB or smaller.");
  const tags = [...new Set(String(values.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean))];
  if (tags.length > 12 || tags.some((tag) => tag.length > 40)) throw new Error("Use up to 12 tags, with no more than 40 characters each.");
  const questionText = String(values.get("question") || "").trim();
  if (!questionText) throw new Error("Enter the question or a short prompt.");

  let imagePath = null;
  if (hasImage) {
    imagePath = `${user.id}/${crypto.randomUUID()}.${imageExtensions[image.type]}`;
    const { error } = await db.storage.from(imageBucket).upload(imagePath, image, { contentType: image.type, upsert: false });
    if (error) throw error;
  }
  try {
    const { error } = await db.from("tracker_error_questions").insert({
      user_id: user.id,
      chapter_id: chapterId,
      question: questionText,
      notes: String(values.get("notes") || "").trim(),
      is_starred: values.has("is_starred"),
      difficulty: String(values.get("difficulty")),
      priority: Number(values.get("priority")),
      tags,
      image_path: imagePath,
    });
    if (error) throw error;
  } catch (error) {
    if (imagePath) {
      const { error: cleanupError } = await db.storage.from(imageBucket).remove([imagePath]);
      if (cleanupError) {
        throw new Error(`${error.message || String(error)} The uploaded image could not be removed: ${cleanupError.message}`);
      }
    }
    throw error;
  }
  app.querySelector("#error-log-dialog").close();
  await loadData();
  render();
  notify("Question saved to your log.");
}

function handleChange(event) {
  const target = event.target;
  if (target.id === "error-log-subject") {
    filters.subject = target.value;
    filters.chapter = "All";
    render();
    return;
  } else if (target.id === "error-log-chapter") filters.chapter = target.value;
  else if (target.id === "error-log-difficulty") filters.difficulty = target.value;
  else if (target.id === "error-log-status") filters.status = target.value;
  else if (target.id === "error-log-sort") filters.sort = target.value;
  else if (target.matches("#error-log-form [name='subject']")) {
    updateChapterOptions(target.form);
    return;
  } else return;
  render();
}

async function handleClick(event) {
  const button = event.target.closest("button");
  if (!button) return;
  try {
    if (button.hasAttribute("data-open-question")) {
      const form = app.querySelector("#error-log-form");
      form.reset();
      app.querySelector("#error-log-form-notice").hidden = true;
      updateChapterOptions(form);
      app.querySelector("#error-log-dialog").showModal();
    } else if (button.hasAttribute("data-close-dialog")) {
      button.closest("dialog")?.close();
    } else if (button.dataset.star) {
      const question = questions.find((item) => item.id === button.dataset.star);
      if (!question) throw new Error("That question is no longer available.");
      const { error } = await db.from("tracker_error_questions").update({ is_starred: !question.is_starred }).eq("id", question.id).eq("user_id", user.id);
      if (error) throw error;
      await loadData();
      render();
    } else if (button.dataset.resolve) {
      const { error } = await db.from("tracker_error_questions").update({ status: "resolved" }).eq("id", button.dataset.resolve).eq("user_id", user.id);
      if (error) throw error;
      await loadData();
      render();
      notify("Question marked done.");
    } else if (button.dataset.delete) {
      const question = questions.find((item) => item.id === button.dataset.delete);
      if (!question) throw new Error("That question is no longer available.");
      const imageNote = question.image_path ? " Its attached image will also be deleted." : "";
      if (!await confirmDialog(`Delete this question permanently?${imageNote}`, { title: "Delete study question", confirmLabel: "Delete", danger: true })) return;
      button.disabled = true;
      const { error } = await db.from("tracker_error_questions")
        .delete()
        .eq("id", question.id)
        .eq("user_id", user.id);
      if (error) throw error;
      let imageCleanupError;
      if (question.image_path) {
        const { error: storageError } = await db.storage.from(imageBucket).remove([question.image_path]);
        imageCleanupError = storageError;
      }
      await loadData();
      render();
      if (imageCleanupError) {
        notify(`Question deleted, but its attached image could not be removed: ${imageCleanupError.message}`, true);
      } else {
        notify("Question deleted.");
      }
    }
  } catch (error) {
    console.error("Could not update the SPRK error question log.", error);
    button.disabled = false;
    notify(error?.message || String(error), true);
  }
}

function bindEvents() {
  app.addEventListener("click", (event) => void handleClick(event));
  app.addEventListener("change", handleChange);
  app.addEventListener("input", (event) => {
    if (event.target.id !== "error-log-search") return;
    filters.query = event.target.value;
    const position = event.target.selectionStart;
    render();
    const replacement = app.querySelector("#error-log-search");
    replacement?.focus();
    replacement?.setSelectionRange(position, position);
  });
  app.addEventListener("submit", (event) => {
    if (event.target.id !== "error-log-form") return;
    event.preventDefault();
    const form = event.target;
    const submit = form.querySelector('[type="submit"]');
    app.querySelector("#error-log-form-notice").hidden = true;
    submit.disabled = true;
    void saveQuestion(form).catch((error) => {
      console.error("Could not save an SPRK error question.", error);
      const notice = app.querySelector("#error-log-form-notice");
      notice.textContent = error?.message || String(error);
      notice.dataset.error = "true";
      notice.hidden = false;
    }).finally(() => { submit.disabled = false; });
  });
}

async function initialize() {
  if (!isAppDataConfigured()) throw new Error("The app-data Supabase project is not configured.");
  const primaryDb = getPrimarySupabaseClient();
  const { data, error } = await primaryDb.auth.getSession();
  if (error) throw error;
  session = data.session;
  user = session?.user;
  if (!user) {
    const returnPath = `${location.pathname}${location.search}`;
    app.innerHTML = `<section class="theme-card error-log-sign-in"><span class="error-log-kicker">YOUR STUDY SPACE</span><h1>Sign in to your question log</h1><p>Keep your tricky questions, images, and revision priorities synced to your SPRK account.</p><a class="error-log-button" href="../account/?return=${encodeURIComponent(returnPath)}">Sign in to continue</a></section>`;
    return;
  }
  db = getAppDataSupabaseClient(session);
  if (!db) throw new Error("The app-data Supabase client could not be created.");
  bindEvents();
  await loadData();
  render();
}

initialize().catch(showError);
