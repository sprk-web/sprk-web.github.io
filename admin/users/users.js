import { confirmDialog, promptDialog } from "../../js/dialogs.js";
import { escapeHtml, formatDate, renderAdminNavigation, requireAdmin, showAdminError } from "../admin-common.js";

const app = document.querySelector("#admin-app");
const pageSize = 100;
let context;
let users = [];
let hasMore = true;
let loading = false;

function isPremium(user) {
  return Boolean(user.is_premium && (!user.premium_until || new Date(user.premium_until) > new Date()));
}

function renderRows(rows) {
  return rows.map((user) => {
    const premium = isPremium(user);
    return `<tr class="border-t border-slate-200">
      <td class="p-3"><strong>${escapeHtml(user.display_name || "Unnamed user")}</strong><small class="block font-mono text-xs text-slate-500">${escapeHtml(user.id)}</small></td>
      <td class="p-3">${escapeHtml(formatDate(user.created_at))}</td>
      <td class="p-3"><div class="flex flex-wrap gap-1">
        <span class="admin-status ${user.is_banned ? "is-banned" : "is-published"}">${user.is_banned ? "Banned" : "Active"}</span>
        ${user.is_admin ? '<span class="admin-status">Admin</span>' : ""}
        <span class="admin-status ${premium ? "is-premium" : ""}">${premium ? "Premium" : "Not premium"}</span>
      </div>${user.banned_at ? `<small class="mt-1 block">${escapeHtml(formatDate(user.banned_at))}</small>` : ""}</td>
      <td class="p-3"><div class="flex flex-wrap gap-2">
        ${user.is_admin || user.id === context.user.id
        ? '<span class="text-xs text-slate-500">Protected from ban</span>'
        : `<button class="admin-action ${user.is_banned ? "" : "admin-danger-action"}" type="button" data-user-id="${escapeHtml(user.id)}" data-banned="${user.is_banned}">${user.is_banned ? "Unban" : "Ban"}</button>`}
        <button class="admin-action" type="button" data-premium-user-id="${escapeHtml(user.id)}" data-premium="${premium}">${premium ? "Revoke Premium" : "Grant Premium"}</button>
      </div></td>
    </tr>`;
  }).join("") || '<tr><td colspan="4" class="p-4">No users match your search.</td></tr>';
}

function render() {
  app.innerHTML = `<section class="admin-page space-y-6">
    <h1 class="sr-only">Manage users</h1>
    ${renderAdminNavigation("users")}
    <div class="admin-page-actions"><button id="users-refresh" class="admin-refresh" type="button"><i data-lucide="refresh-cw" class="h-4 w-4"></i>Refresh users</button></div>
    <div id="users-feedback" class="admin-form-status" role="status" aria-live="polite" hidden></div>
    <section class="theme-card admin-panel admin-table-panel">
      <div class="admin-panel-heading"><span class="admin-panel-icon"><i data-lucide="users-round" class="h-5 w-5"></i></span><div><h2>User directory</h2><p id="users-count"></p></div></div>
      <div class="admin-list-controls"><label class="admin-search"><i data-lucide="search" class="h-4 w-4"></i><input id="users-search" type="search" placeholder="Search names or user IDs" aria-label="Search users"></label></div>
      <div class="overflow-x-auto"><table class="admin-table w-full text-left text-sm"><thead><tr><th class="p-3">User</th><th class="p-3">Joined</th><th class="p-3">Status</th><th class="p-3">Actions</th></tr></thead><tbody id="users-table-body"></tbody></table></div>
      <div class="p-4 text-center"><button id="users-more" class="admin-action" type="button">Load more users</button></div>
    </section>
    <p class="admin-data-note"><i data-lucide="shield-check" class="h-4 w-4"></i>Bans block access to the main SPRK database through row-level security and user-facing database actions. They do not revoke Supabase Auth sessions or restrict the separate app-data project. Administrator and your own accounts cannot be banned here.</p>
  </section>`;
  window.lucide?.createIcons();
  app.querySelector("#users-refresh").addEventListener("click", refreshUsers);
  app.querySelector("#users-search").addEventListener("input", applyFilter);
  app.querySelector("#users-table-body").addEventListener("click", handleAction);
  app.querySelector("#users-more").addEventListener("click", () => loadUsers(true).catch(showLoadError));
  applyFilter();
}

function applyFilter() {
  const query = app.querySelector("#users-search").value.trim().toLowerCase();
  const matchingUsers = users.filter((user) => `${user.display_name || ""} ${user.id}`.toLowerCase().includes(query));
  app.querySelector("#users-count").textContent = `Showing ${matchingUsers.length} matching profiles from ${users.length} loaded${hasMore ? " (more available)" : ""}.`;
  app.querySelector("#users-table-body").innerHTML = renderRows(matchingUsers);
  app.querySelector("#users-more").hidden = !hasMore;
}

function showFeedback(message, isError = false) {
  const region = app.querySelector("#users-feedback");
  if (!region) return;
  region.textContent = message;
  region.dataset.kind = isError ? "error" : "success";
  region.hidden = false;
}

function showLoadError(error) {
  showFeedback(`Could not load users: ${error.message}`, true);
}

async function loadUsers(append = false) {
  if (loading) return;
  loading = true;
  const start = append ? users.length : 0;
  const { data, error } = await context.db
    .from("profiles")
    .select("id,display_name,is_admin,is_premium,premium_until,is_banned,banned_at,created_at")
    .order("created_at", { ascending: false })
    .range(start, start + pageSize - 1);
  loading = false;
  if (error) throw error;
  if (!append) users = [];
  users.push(...(data || []));
  hasMore = (data || []).length === pageSize;
  render();
}

async function refreshUsers() {
  const previousCount = users.length;
  users = [];
  hasMore = true;
  await loadUsers();
  while (users.length < previousCount && hasMore) {
    await loadUsers(true);
  }
}

async function refreshUser(userId) {
  const { data, error } = await context.db
    .from("profiles")
    .select("id,display_name,is_admin,is_premium,premium_until,is_banned,banned_at,created_at")
    .eq("id", userId)
    .single();
  if (error) throw error;
  users = users.map((user) => user.id === userId ? data : user);
  render();
}

async function handleAction(event) {
  const premiumButton = event.target.closest("[data-premium-user-id]");
  if (premiumButton) {
    const user = users.find((item) => item.id === premiumButton.dataset.premiumUserId);
    if (!user) return;
    await changePremium(user, premiumButton.dataset.premium === "true");
    return;
  }
  const button = event.target.closest("[data-user-id]");
  if (!button) return;
  const user = users.find((item) => item.id === button.dataset.userId);
  if (!user || user.is_admin || user.id === context.user.id) return;
  const shouldBan = button.dataset.banned !== "true";
  const confirmed = await confirmDialog(
    shouldBan
      ? `Ban ${user.display_name || "this user"}? Access to core SPRK database features will be blocked.`
      : `Unban ${user.display_name || "this user"} and restore access to core SPRK database features?`,
    { title: shouldBan ? "Ban user" : "Unban user", confirmLabel: shouldBan ? "Ban user" : "Unban user", danger: shouldBan },
  );
  if (!confirmed) return;
  button.disabled = true;
  try {
    const { error } = await context.db.rpc("admin_set_user_ban", {
      p_target_user_id: user.id,
      p_is_banned: shouldBan,
    });
    if (error) throw error;
    await refreshUser(user.id);
    showFeedback(`${user.display_name || "User"} ${shouldBan ? "banned" : "unbanned"}.`);
  } catch (error) {
    showFeedback(`Could not ${shouldBan ? "ban" : "unban"} the user: ${error.message}`, true);
  }
}

async function changePremium(user, shouldBePremium) {
  let days = 30;
  if (shouldBePremium) {
    const answer = await promptDialog(
      `How many days of Premium should ${user.display_name || "this user"} receive? Existing active Premium time will be extended.`,
      "30",
      { title: "Grant Premium", confirmLabel: "Grant" },
    );
    if (answer === null) return;
    days = Number(answer);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      showFeedback("Enter a whole number from 1 to 3650 days.", true);
      return;
    }
  } else {
    const confirmed = await confirmDialog(
      `Revoke Premium access for ${user.display_name || "this user"}?`,
      { title: "Revoke Premium", confirmLabel: "Revoke", danger: true },
    );
    if (!confirmed) return;
  }
  try {
    const { error } = await context.db.rpc("admin_set_user_premium", {
      p_target_user_id: user.id,
      p_is_premium: shouldBePremium,
      p_days: days,
    });
    if (error?.code === "PGRST202" || error?.code === "42883") {
      throw new Error("The Premium grant function is missing from the main database API. Run supabase/fix-premium-grant.sql in the main database, then try again.");
    }
    if (error) throw error;
    await refreshUser(user.id);
    const updatedUser = users.find((item) => item.id === user.id);
    if (!updatedUser || isPremium(updatedUser) !== shouldBePremium) {
      throw new Error("The Premium update was not reflected in the user profile. Run the Premium grant SQL patch in the main database and try again.");
    }
    showFeedback(`${user.display_name || "User"}’s Premium ${shouldBePremium ? `granted for ${days} days` : "revoked"}.`);
  } catch (error) {
    showFeedback(`Could not ${shouldBePremium ? "grant" : "revoke"} Premium: ${error.message}`, true);
  }
}

async function initialize() {
  context = await requireAdmin(app);
  if (!context) return;
  await loadUsers();
}

initialize().catch((error) => showAdminError(app, error.message));
