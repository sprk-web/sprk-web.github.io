import { CONTRIBUTION_CONFIG } from "../../js/config.js";
import { confirmDialog } from "../../js/dialogs.js";
import { escapeHtml, formatDate, renderAdminNavigation, requireAdmin, showAdminError } from "../admin-common.js";

const app = document.querySelector("#admin-app");
let context;
let gifts = [];
let loading = true;

function giftStatus(gift) {
  if (gift.disabled_at) return "Revoked";
  if (gift.expires_at && new Date(gift.expires_at) <= new Date()) return "Expired";
  if (gift.redemption_count >= gift.max_redemptions) return "Fully redeemed";
  return "Active";
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function statusClass(status) {
  if (status === "Active") return "is-published";
  if (status === "Revoked") return "is-banned";
  return "is-draft";
}

function giftRows(rows) {
  if (loading) return '<tr><td colspan="7"><div class="gift-table-message"><span class="gift-loading-indicator"></span>Loading gift credits…</div></td></tr>';
  if (!rows.length) {
    const hasGifts = gifts.length > 0;
    return `<tr><td colspan="7"><div class="gift-table-message"><span class="gift-empty-icon"><i data-lucide="${hasGifts ? "search-x" : "ticket"}" class="h-5 w-5"></i></span><strong>${hasGifts ? "No matching gifts" : "No gift codes yet"}</strong><span>${hasGifts ? "Try a different search or status filter." : "Create your first gift code using the form."}</span></div></td></tr>`;
  }
  return rows.map((gift) => {
    const status = giftStatus(gift);
    const isActive = status === "Active";
    const link = gift.code ? new URL("../../account/", location.href) : null;
    if (link) link.searchParams.set("gift", gift.code);
    return `<tr>
      <td><div class="gift-amount">${escapeHtml(formatNumber(gift.credit_amount))} <span>${escapeHtml(CONTRIBUTION_CONFIG.currencyName)}</span></div><small class="gift-id">Gift · ${escapeHtml(gift.id.slice(0, 8))}</small></td>
      <td>${gift.code
        ? `<div class="gift-value-cell"><code class="gift-code-value">${escapeHtml(gift.code)}</code><button class="gift-copy-button" type="button" data-copy-gift-code="${escapeHtml(gift.id)}" aria-label="Copy gift code"><i data-lucide="copy" class="h-4 w-4"></i></button></div>`
        : '<span class="gift-unavailable">Unavailable for older gifts</span>'}</td>
      <td>${link
        ? `<div class="gift-link-cell"><input class="gift-link-value" type="text" readonly aria-label="Gift link" value="${escapeHtml(link.href)}"><button class="gift-copy-button" type="button" data-copy-gift-link="${escapeHtml(gift.id)}" aria-label="Copy gift link"><i data-lucide="copy" class="h-4 w-4"></i></button></div>`
        : '<span class="gift-unavailable">Unavailable for older gifts</span>'}</td>
      <td><div class="gift-redemption"><strong>${escapeHtml(formatNumber(gift.redemption_count))}</strong><span> / ${escapeHtml(formatNumber(gift.max_redemptions))}</span></div><div class="gift-progress" role="progressbar" aria-label="Redemption progress" aria-valuenow="${Number(gift.redemption_count)}" aria-valuemin="0" aria-valuemax="${Number(gift.max_redemptions)}"><span style="width:${Math.min(100, Number(gift.redemption_count) / Number(gift.max_redemptions) * 100)}%"></span></div></td>
      <td><span class="gift-expiry">${escapeHtml(gift.expires_at ? formatDate(gift.expires_at) : "Never expires")}</span></td>
      <td><span class="admin-status ${statusClass(status)}">${escapeHtml(status)}</span></td>
      <td><div class="gift-actions">${isActive ? `<button class="gift-revoke-button" type="button" data-revoke-gift="${escapeHtml(gift.id)}" aria-label="Revoke gift ${escapeHtml(gift.id.slice(0, 8))}"><i data-lucide="ban" class="h-4 w-4"></i><span>Revoke</span></button>` : ""}
        ${Number(gift.redemption_count) === 0 ? `<button class="gift-delete-button" type="button" data-delete-gift="${escapeHtml(gift.id)}" aria-label="Delete gift ${escapeHtml(gift.id.slice(0, 8))}"><i data-lucide="trash-2" class="h-4 w-4"></i><span>Delete</span></button>` : ""}
        ${!isActive && Number(gift.redemption_count) > 0 ? '<span class="gift-no-action">In history</span>' : ""}</div></td>
    </tr>`;
  }).join("");
}

function renderGiftList() {
  const query = app.querySelector("#gift-search").value.trim().toLowerCase();
  const filter = app.querySelector("#gift-status-filter").value;
  const matchingGifts = gifts.filter((gift) => {
    const status = giftStatus(gift);
    const matchesSearch = `${gift.id} ${gift.code || ""} ${gift.credit_amount} ${gift.max_redemptions}`.toLowerCase().includes(query);
    return matchesSearch && (filter === "all" || status === filter);
  });
  app.querySelector("#gift-list-count").textContent = loading
    ? "Loading recent gift codes…"
    : `${matchingGifts.length.toLocaleString()} of ${gifts.length.toLocaleString()} recent gift codes`;
  app.querySelector("#gifts-table-body").innerHTML = giftRows(matchingGifts);
  window.lucide?.createIcons();
}

function render() {
  app.innerHTML = `<section class="admin-page gift-admin-page">
    <h1 class="sr-only">Gift credits</h1>
    ${renderAdminNavigation("gifts")}
    <header class="gift-page-header">
      <button id="gifts-refresh" class="admin-refresh" type="button"><i data-lucide="refresh-cw" class="h-4 w-4"></i><span>Refresh gifts</span></button>
    </header>
    <div id="gifts-feedback" class="admin-form-status gift-feedback" role="status" aria-live="polite" hidden></div>
    <div class="gift-admin-layout">
      <form id="gift-form" class="theme-card admin-panel gift-create-panel">
        <h2 class="sr-only">Create a gift</h2>
        <label class="gift-field">Custom code <span class="gift-optional">Optional</span>
          <input name="code" class="theme-control" type="text" minlength="4" maxlength="32" pattern="[A-Za-z0-9][A-Za-z0-9_-]{3,31}" placeholder="e.g. JEE-MOCK-2026" autocomplete="off" autocapitalize="characters" spellcheck="false">
          <small>4–32 characters: letters, numbers, hyphens, or underscores. Codes are case-insensitive.</small>
        </label>
        <label class="gift-field">Credits per redemption
          <span class="gift-input-wrap"><input name="amount" class="theme-control" type="number" min="1" max="1000000" value="100" required><span>${escapeHtml(CONTRIBUTION_CONFIG.currencyName)}</span></span>
        </label>
        <label class="gift-field">Maximum redemptions
          <input name="max_redemptions" class="theme-control" type="number" min="1" max="100000" value="1" required>
          <small>How many people can claim this gift.</small>
        </label>
        <label class="gift-field">Expires in days
          <input name="expiry_days" class="theme-control" type="number" min="0" max="365" value="7" required>
          <small>Set to 0 for a gift that never expires.</small>
        </label>
        <button class="gift-create-button" type="submit"><i data-lucide="plus" class="h-4 w-4"></i><span>Create gift code</span></button>
        <div id="gift-create-result" class="admin-gift-result" role="status" aria-live="polite" hidden></div>
        <div class="gift-security-note"><i data-lucide="lock-keyhole" class="h-4 w-4"></i><span>New gift codes remain visible to admins in the table. Codes created before this change cannot be recovered.</span></div>
      </form>
      <section class="theme-card admin-panel admin-table-panel gift-list-panel">
        <div class="gift-list-heading">
          <div class="gift-section-heading">
            <h2 class="sr-only">Created gifts</h2>
            <p id="gift-list-count">Loading recent gift codes…</p>
          </div>
          <span class="gift-list-limit">Latest 500</span>
        </div>
        <div class="gift-list-controls">
          <label class="gift-search"><i data-lucide="search" class="h-4 w-4"></i><input id="gift-search" type="search" placeholder="Search gift ID, code, or amount" aria-label="Search gift codes"></label>
          <label class="sr-only" for="gift-status-filter">Filter gift codes by status</label>
          <select id="gift-status-filter" class="theme-control" aria-label="Filter gift codes by status">
            <option value="all">All statuses</option><option value="Active">Active</option><option value="Fully redeemed">Fully redeemed</option><option value="Expired">Expired</option><option value="Revoked">Revoked</option>
          </select>
        </div>
        <div class="gift-table-wrap"><table class="admin-table gift-table"><thead><tr><th scope="col">Gift</th><th scope="col">Code</th><th scope="col">Gift link</th><th scope="col">Redemptions</th><th scope="col">Expires</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody id="gifts-table-body"></tbody></table></div>
      </section>
    </div>
  </section>`;
  window.lucide?.createIcons();
  renderGiftList();
  app.querySelector("#gift-form").addEventListener("submit", createGift);
  app.querySelector("#gifts-refresh").addEventListener("click", refreshGifts);
  app.querySelector("#gift-search").addEventListener("input", renderGiftList);
  app.querySelector("#gift-status-filter").addEventListener("change", renderGiftList);
  app.querySelector("#gifts-table-body").addEventListener("click", handleGiftAction);
}

function showFeedback(message, isError = false) {
  const region = app.querySelector("#gifts-feedback");
  if (!region) return;
  region.textContent = message;
  region.dataset.kind = isError ? "error" : "success";
  region.hidden = false;
}

function showLoadError(error) {
  console.error("Could not load gift credits.", error);
  if (/administrator access required/i.test(error?.message || "")) {
    showFeedback(
      "Gift management is unavailable because the app-data service did not recognize an administrator claim in this session. Verify that the main project's Custom Access Token Hook uses public.custom_access_token_hook, then sign out and back in.",
      true,
    );
    return;
  }
  showFeedback(`Could not load gift credits: ${error.message}`, true);
}

async function loadGifts() {
  const { data, error } = await context.appDataDb.rpc("admin_list_contribution_gifts");
  if (error) throw error;
  gifts = data || [];
  loading = false;
  renderGiftList();
}

async function handleGiftAction(event) {
  const button = event.target.closest("[data-revoke-gift], [data-delete-gift], [data-copy-gift-code], [data-copy-gift-link]");
  if (!button) return;
  if (button.hasAttribute("data-revoke-gift")) {
    await revokeGift(button);
  } else if (button.hasAttribute("data-delete-gift")) {
    await deleteGift(button);
  } else {
    const gift = gifts.find((item) => item.id === button.dataset.copyGiftCode || item.id === button.dataset.copyGiftLink);
    if (!gift?.code) return;
    const value = button.hasAttribute("data-copy-gift-code")
      ? gift.code
      : new URL(`../../account/?gift=${encodeURIComponent(gift.code)}`, location.href).href;
    await copyValue(value, button, button.hasAttribute("data-copy-gift-code") ? "gift code" : "gift link", button.parentElement.querySelector(button.hasAttribute("data-copy-gift-code") ? ".gift-code-value" : ".gift-link-value"));
  }
}

async function refreshGifts() {
  const button = app.querySelector("#gifts-refresh");
  button.disabled = true;
  try {
    await loadGifts();
    showFeedback("Gift codes are up to date.");
  } catch (error) {
    showLoadError(error);
  } finally {
    button.disabled = false;
  }
}

async function createGift(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  const result = app.querySelector("#gift-create-result");
  const values = new FormData(form);
  const amount = Number(values.get("amount"));
  const maxRedemptions = Number(values.get("max_redemptions"));
  const expiryDays = Number(values.get("expiry_days"));
  const customCode = String(values.get("code") || "").trim();
  const code = customCode
    ? customCode.toUpperCase()
    : Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const expiresAt = expiryDays > 0 ? new Date(Date.now() + expiryDays * 86400000).toISOString() : null;
  button.disabled = true;
  result.hidden = true;
  try {
    const { error } = await context.appDataDb.rpc("create_contribution_gift", {
      p_code: code,
      p_credit_amount: amount,
      p_max_redemptions: maxRedemptions,
      p_expires_at: expiresAt,
    });
    if (error) throw error;
    const link = new URL("../../account/", location.href);
    link.searchParams.set("gift", code);
    result.innerHTML = `<strong>Gift created: <code>${escapeHtml(code)}</code></strong><div class="admin-gift-actions"><button type="button" class="admin-action" id="copy-gift-code"><i data-lucide="copy" class="h-4 w-4"></i>Copy code</button></div><p>${formatNumber(amount)} ${escapeHtml(CONTRIBUTION_CONFIG.currencyName)} · ${formatNumber(maxRedemptions)} redemption${maxRedemptions === 1 ? "" : "s"}${expiresAt ? ` · Expires ${escapeHtml(new Date(expiresAt).toLocaleDateString())}` : " · No expiry"}</p><div class="admin-gift-link-row"><input class="theme-control px-3 py-2" readonly aria-label="Gift link" value="${escapeHtml(link.href)}"><button type="button" class="admin-action" id="copy-gift-link"><i data-lucide="copy" class="h-4 w-4"></i>Copy link</button></div><p class="text-xs text-[#777]">Code and link are also available in the admin table.</p>`;
    result.hidden = false;
    result.dataset.kind = "success";
    window.lucide?.createIcons();
    result.querySelector("#copy-gift-code").addEventListener("click", (copyEvent) => copyValue(code, copyEvent.currentTarget, "gift code"));
    result.querySelector("#copy-gift-link").addEventListener("click", async (copyEvent) => {
      await copyValue(link.href, copyEvent.currentTarget, "gift link");
    });
    form.reset();
    showFeedback("Gift code created successfully.");
    try {
      await loadGifts();
    } catch (error) {
      showLoadError(error);
    }
  } catch (error) {
    console.error("Could not create gift.", error);
    result.textContent = error.message || "Could not create the gift.";
    result.dataset.kind = "error";
    result.hidden = false;
  } finally {
    button.disabled = false;
  }
}

async function copyValue(value, button, description, fallbackTarget = null) {
  try {
    await navigator.clipboard.writeText(value);
    button.textContent = "Copied";
  } catch (error) {
    console.error(`Could not copy ${description}.`, error);
    const target = fallbackTarget || (description === "gift link"
      ? app.querySelector("#gift-create-result input")
      : app.querySelector("#gift-create-result strong code"));
    if (target instanceof HTMLInputElement) {
      target.focus();
      target.select();
    } else if (target) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(target);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      throw error;
    }
    showFeedback(`Clipboard access was unavailable. The ${description} is selected so you can copy it manually.`, true);
  }
}

async function revokeGift(button) {
  const confirmed = await confirmDialog("Nobody will be able to redeem this gift after revocation.", {
    title: "Revoke gift",
    confirmLabel: "Revoke gift",
    danger: true,
  });
  if (!confirmed) return;
  button.disabled = true;
  try {
    const { error } = await context.appDataDb.rpc("admin_disable_contribution_gift", {
      p_gift_id: button.dataset.revokeGift,
    });
    if (error) throw error;
  } catch (error) {
    console.error("Could not revoke gift.", error);
    showFeedback(`Could not revoke gift: ${error.message}`, true);
    button.disabled = false;
    return;
  }
  showFeedback("Gift revoked.");
  try {
    await loadGifts();
  } catch (error) {
    showLoadError(error);
  }
}

async function deleteGift(button) {
  const confirmed = await confirmDialog("This permanently deletes the gift code. Gifts with redemptions are kept in history and cannot be deleted.", {
    title: "Delete gift code",
    confirmLabel: "Delete gift",
    danger: true,
  });
  if (!confirmed) return;
  button.disabled = true;
  try {
    const { error } = await context.appDataDb.rpc("admin_delete_contribution_gift", {
      p_gift_id: button.dataset.deleteGift,
    });
    if (error) throw error;
  } catch (error) {
    console.error("Could not delete gift.", error);
    showFeedback(`Could not delete gift: ${error.message}`, true);
    button.disabled = false;
    return;
  }
  showFeedback("Gift deleted.");
  try {
    await loadGifts();
  } catch (error) {
    showLoadError(error);
  }
}

async function init() {
  context = await requireAdmin(app);
  if (!context) return;
  if (!context.appDataDb) {
    showAdminError(app, "The app-data Supabase project is not configured.", undefined, "Configure the app-data project before managing gift credits.");
    return;
  }
  render();
  try {
    await loadGifts();
  } catch (error) {
    loading = false;
    renderGiftList();
    showLoadError(error);
  }
}

init().catch((error) => showAdminError(app, error.message));
