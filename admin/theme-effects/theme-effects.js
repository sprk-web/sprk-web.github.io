import { confirmDialog } from "../../js/dialogs.js";
import { getAppDataSupabaseClient, isAppDataConfigured } from "../../js/appDataSupabaseClient.js";
import { validateThemeKeyframes } from "../../js/theme-effects.js";
import { escapeHtml, renderAdminNavigation, requireAdmin, showAdminError } from "../admin-common.js";

const app = document.querySelector("#admin-app");
const validId = /^[a-z0-9][a-z0-9_-]{1,79}$/;
const validCategory = /^[a-z][a-z0-9_-]{1,59}$/;
let context;
let effects = [];

function renderRows() {
  const body = app.querySelector("#theme-effects-body");
  body.innerHTML = effects.length ? effects.map((effect) => `<tr>
    <td><strong>${escapeHtml(effect.name)}</strong><small>${escapeHtml(effect.id)}</small></td>
    <td>${escapeHtml(effect.category)}</td>
    <td>${effect.premium_only ? "Premium" : `${Number(effect.price).toLocaleString()} Study Credits`}</td>
    <td>${effect.published ? "Published" : "Draft"}</td>
    <td><div class="theme-effect-actions"><button class="admin-action" type="button" data-edit-effect="${escapeHtml(effect.id)}">Edit</button><button class="admin-action" type="button" data-toggle-effect="${escapeHtml(effect.id)}">${effect.published ? "Unpublish" : "Publish"}</button><button class="admin-action admin-danger-action" type="button" data-delete-effect="${escapeHtml(effect.id)}">Delete</button></div></td>
  </tr>`).join("") : '<tr><td colspan="5">No effects yet. Publish the first effect below.</td></tr>';
}

function render() {
  app.innerHTML = `<section class="admin-page space-y-6">
    <h1 class="sr-only">Theme effects</h1>
    ${renderAdminNavigation("theme-effects")}
    <header class="admin-page-actions"><div></div><button id="theme-effects-refresh" class="admin-refresh" type="button"><i data-lucide="refresh-cw" class="h-4 w-4"></i>Refresh</button></header>
    <div id="theme-effects-feedback" class="admin-form-status" role="status" aria-live="polite" hidden></div>
    <div class="theme-effect-admin-layout">
      <form id="theme-effect-form" class="theme-card theme-effect-form">
        <h2 id="theme-effect-form-heading">Publish an effect</h2>
        <label>Effect ID <input class="theme-control px-3 py-2" name="id" maxlength="80" pattern="[a-z0-9][a-z0-9_-]{1,79}" placeholder="spring-blossom" required><small>Stable identifier; lowercase letters, digits, hyphens, or underscores. Do not change after purchase.</small></label>
        <label>Name <input class="theme-control px-3 py-2" name="name" maxlength="80" required placeholder="Spring blossom"></label>
        <label>Category <input class="theme-control px-3 py-2" name="category" maxlength="60" pattern="[a-z][a-z0-9_-]{1,59}" value="name_effects" required>
          <small>Use name_effects for leaderboard names. Categories are open-ended for future theme options.</small>
        </label>
        <label>Description <textarea class="theme-control px-3 py-2" name="description" rows="2" maxlength="240" placeholder="A spring-inspired animated gradient"></textarea></label>
        <label>Study Credits price <input class="theme-control px-3 py-2" name="price" type="number" min="0" max="1000000000" step="1" value="500" required></label>
        <label>CSS declarations <textarea class="theme-control px-3 py-2" name="css_code" required placeholder="color: #7c3aed;&#10;text-shadow: 0 0 8px #c4b5fd;"></textarea>
          <small>Enter CSS declarations only, without selectors or braces. They are applied to the user's leaderboard name. External URLs, HTML, and @import are rejected. CSS is not JavaScript.</small>
        </label>
        <label>Optional animation keyframes <textarea class="theme-control px-3 py-2" name="keyframes_code" placeholder="@keyframes spring-blossom-pulse {&#10;  from { text-shadow: 0 0 2px #86efac; }&#10;  to { text-shadow: 0 0 12px #f9a8d4; }&#10;}"></textarea>
          <small>Use only @keyframes blocks and prefix every animation with the effect ID plus a hyphen, e.g. spring-blossom-pulse.</small>
        </label>
        <label class="theme-effect-check"><input name="premium_only" type="checkbox"><span>Premium-only effect <small>Premium members unlock this without spending credits.</small></span></label>
        <label class="theme-effect-check"><input name="published" type="checkbox" checked><span>Publish effect</span></label>
        <div class="theme-effect-help">Example: <code>background: linear-gradient(90deg, #7c3aed, #ec4899); color: transparent; background-clip: text;</code></div>
        <div class="flex gap-2"><button class="admin-action" type="submit">Save effect</button><button class="admin-action" id="theme-effect-reset" type="button">New effect</button></div>
      </form>
      <section class="theme-card admin-panel">
        <div class="admin-panel-heading"><span class="admin-panel-icon"><i data-lucide="sparkles" class="h-5 w-5"></i></span><div><h2>Published and draft effects</h2><p>Effect codes live in the main database; prices are synchronized to app-data for safe credit purchases.</p></div></div>
        <div class="theme-effect-admin-table"><table><thead><tr><th>Name</th><th>Category</th><th>Cost</th><th>Status</th><th>Actions</th></tr></thead><tbody id="theme-effects-body"></tbody></table></div>
      </section>
    </div>
  </section>`;
  window.lucide?.createIcons();
  renderRows();
  app.querySelector("#theme-effect-form").addEventListener("submit", saveEffect);
  app.querySelector("#theme-effect-reset").addEventListener("click", resetForm);
  app.querySelector("#theme-effects-refresh").addEventListener("click", () => loadEffects().catch(showError));
  app.querySelector("#theme-effects-body").addEventListener("click", handleEffectAction);
}

function showFeedback(message, isError = false) {
  const node = app.querySelector("#theme-effects-feedback");
  node.textContent = message;
  node.dataset.kind = isError ? "error" : "success";
  node.hidden = false;
}

function resetForm() {
  const form = app.querySelector("#theme-effect-form");
  form.reset();
  form.elements.id.disabled = false;
  form.elements.price.value = "500";
  app.querySelector("#theme-effect-form-heading").textContent = "Publish an effect";
}

async function syncCatalog() {
  if (!isAppDataConfigured()) throw new Error("App-data Supabase is not configured.");
  const { data, error } = await context.db.auth.getSession();
  if (error) throw error;
  let session = data.session;
  if (!session) throw new Error("Your sign-in session has expired. Sign in again before synchronizing the theme-effect catalog.");
  if (session.expires_at && session.expires_at <= Math.floor(Date.now() / 1000) + 60) {
    const { data: refreshed, error: refreshError } = await context.db.auth.refreshSession();
    if (refreshError) throw refreshError;
    session = refreshed.session;
    if (!session) throw new Error("Your sign-in session has expired. Sign in again before synchronizing the theme-effect catalog.");
  }
  context.session = session;
  const appData = getAppDataSupabaseClient(session);
  if (!appData) throw new Error("The app-data Supabase client is unavailable.");
  const { error: syncError } = await appData.rpc("sync_theme_effect_catalog", {
    p_effects: effects.map(({ id, name, category, description, css_code, keyframes_code, price, premium_only, published }) => ({
      id, name, category, description, css_code, keyframes_code, price, premium_only, published,
    })),
  });
  if (syncError) throw syncError;
}

async function saveEffectToDatabase(effect) {
  const save = () => context.db.from("theme_effects").upsert({
    ...effect,
    created_by: context.user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  let result = await save();
  if (!result.error || !/jwt expired/i.test(result.error.message || "")) return result;

  const { data, error } = await context.db.auth.refreshSession();
  if (error) throw error;
  if (!data.session) throw new Error("Your sign-in session has expired. Sign in again before saving the effect.");
  context.session = data.session;
  context.user = data.session.user;
  result = await save();
  return result;
}

async function loadEffects() {
  const { data, error } = await context.db.from("theme_effects")
  .select("id,name,category,description,css_code,keyframes_code,price,premium_only,published,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  effects = data || [];
  renderRows();
  await syncCatalog();
}

async function saveEffect(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const effectId = form.elements.id.value;
  const effect = Object.fromEntries(new FormData(form));
  effect.id = String(effect.id || effectId || "").trim();
  effect.name = String(effect.name || "").trim();
  effect.description = String(effect.description || "").trim();
  effect.css_code = String(effect.css_code || "").trim();
  effect.keyframes_code = String(effect.keyframes_code || "").trim();
  effect.price = Number(effect.price);
  effect.category = String(effect.category || "");
  effect.premium_only = form.elements.premium_only.checked;
  effect.published = form.elements.published.checked;
  if (!validId.test(effect.id)) return showFeedback("Effect ID must be a lowercase slug with 2–80 characters.", true);
  if (!validCategory.test(effect.category)) return showFeedback("Use a lowercase category such as name_effects.", true);
  if (!Number.isSafeInteger(effect.price) || effect.price < 0 || effect.price > 1000000000) {
    return showFeedback("Enter a whole-number price between 0 and 1,000,000,000.", true);
  }
  if (effect.premium_only) effect.price = 0;
  else if (effect.price < 1) return showFeedback("Paid effects need a Study Credits price of at least 1.", true);
  if (!effect.css_code || /[{}<>]|@import|url\s*\(|expression\s*\(|javascript:/i.test(effect.css_code)) {
    return showFeedback("Enter safe CSS declarations only. Selectors, braces, HTML, @import, and external URLs are not supported.", true);
  }
  if (effect.keyframes_code) {
    try {
      validateThemeKeyframes(effect.id, effect.keyframes_code);
    } catch (error) {
      return showFeedback(error.message, true);
    }
  }
  try {
    const { error } = await saveEffectToDatabase(effect);
    if (error) throw error;
  } catch (error) {
    showFeedback(`Could not save the effect: ${error.message}`, true);
    return;
  }
  try {
    await loadEffects();
  } catch (error) {
    showFeedback(`Effect was saved, but its list or catalog could not be refreshed: ${error.message}`, true);
    return;
  }
  showFeedback("Effect saved and synchronized to the Study Credits catalog.");
  resetForm();
}

async function handleEffectAction(event) {
  const editButton = event.target.closest("[data-edit-effect]");
  const toggleButton = event.target.closest("[data-toggle-effect]");
  const deleteButton = event.target.closest("[data-delete-effect]");
  if (editButton) {
    const effect = effects.find(({ id }) => id === editButton.dataset.editEffect);
    if (!effect) return;
    const form = app.querySelector("#theme-effect-form");
    for (const key of ["id", "name", "category", "description", "css_code", "keyframes_code", "price"]) {
      form.elements[key].value = effect[key] ?? "";
    }
    form.elements.id.disabled = true;
    form.elements.premium_only.checked = effect.premium_only;
    form.elements.published.checked = effect.published;
    app.querySelector("#theme-effect-form-heading").textContent = `Edit ${effect.name}`;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (toggleButton) {
    const effect = effects.find(({ id }) => id === toggleButton.dataset.toggleEffect);
    if (!effect) return;
    try {
      const { error } = await context.db.from("theme_effects")
        .update({ published: !effect.published })
        .eq("id", effect.id);
      if (error) throw error;
      await loadEffects();
      showFeedback(`${effect.name} ${effect.published ? "unpublished" : "published"}.`);
    } catch (error) {
      showFeedback(`Could not update effect: ${error.message}`, true);
    }
  } else if (deleteButton) {
    const effect = effects.find(({ id }) => id === deleteButton.dataset.deleteEffect);
    if (!effect) return;
    const confirmed = await confirmDialog(
      `Delete "${effect.name}" from the effects list? It will be disabled in the active app-data catalog. Existing unlocks will not be refunded.`,
      { title: "Delete theme effect", confirmLabel: "Delete effect", danger: true },
    );
    if (!confirmed) return;
    deleteButton.disabled = true;
    let deleted = false;
    try {
      const { data, error } = await context.db.from("theme_effects")
        .delete()
        .eq("id", effect.id)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("The effect was not deleted. Check your admin permissions and try again.");
      deleted = true;
      const form = app.querySelector("#theme-effect-form");
      if (form.elements.id.value === effect.id) resetForm();
      effects = effects.filter(({ id }) => id !== effect.id);
      renderRows();
      await syncCatalog();
      showFeedback(`${effect.name} was deleted and removed from the active catalog. Existing purchases were not refunded.`);
    } catch (error) {
      if (deleted) {
        showFeedback(`${effect.name} was deleted, but the app-data catalog could not be synchronized: ${error.message}`, true);
      } else {
        deleteButton.disabled = false;
        showFeedback(`Could not delete effect: ${error.message}`, true);
      }
    }
  }
}

function showError(error) {
  showFeedback(`Could not load theme effects: ${error.message}`, true);
}

async function initialize() {
  context = await requireAdmin(app);
  if (!context) return;
  render();
  await loadEffects();
}

initialize().catch((error) => showAdminError(app, error.message));
