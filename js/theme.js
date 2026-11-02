import { CONTRIBUTION_CONFIG, SITE_CONFIG, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";
import { getAppDataSupabaseClient, isAppDataConfigured } from "./appDataSupabaseClient.js";
import { getPrimarySupabaseClient } from "./supabaseClient.js";
import { loadSupabaseSdk } from "./loadSupabaseSdk.js";
import {
  applyThemeEffectStyles,
  loadOwnedThemeEffects,
  loadSelectedThemeEffect,
  loadThemeEffects,
} from "./theme-effects.js";

(() => {
  const config = SITE_CONFIG.theme;
  const app = document.querySelector("#theme-effect-list");
  const status = document.querySelector("#theme-effect-status");
  const effectSelect = document.querySelector("#leaderboard-name-effect");
  const fontSelect = document.querySelector("#font");
  const accentInput = document.querySelector("#accent");
  const preferences = { ...config.preferences };
  let effects = [];
  let ownedEffects = new Set();
  let selectedEffect = "";
  let isPremium = false;
  let balance = null;
  let appData = null;
  let session = null;
  let effectsQuery = "";

  function restorePreferences() {
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(config.storageKey) || "{}");
    } catch (error) {
      console.error("Could not load saved theme preferences.", error);
      return;
    }
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
      console.warn("Saved theme preferences were invalid; defaults will be used.");
      return;
    }

    const optionIsValid = (options, value) => options.some(({ value: option }) => option === value);
    const validators = {
      appearance: (value) => optionIsValid(config.appearanceOptions, value),
      accent: (value) => typeof value === "string" && /^#[\da-f]{6}$/i.test(value),
      font: (value) => Object.hasOwn(config.fonts, value),
      fontSize: (value) => {
        const size = Number(value);
        return Number.isInteger(size)
          && size >= config.fontSize.min
          && size <= config.fontSize.max
          && (size - config.fontSize.min) % config.fontSize.step === 0;
      },
      density: (value) => optionIsValid(config.densityOptions, value),
      panelStyle: (value) => optionIsValid(config.panelStyleOptions, value),
      pageTone: (value) => optionIsValid(config.pageToneOptions, value),
      rounded: (value) => typeof value === "boolean",
      reducedMotion: (value) => typeof value === "boolean",
    };

    for (const [key, isValid] of Object.entries(validators)) {
      if (!Object.hasOwn(saved, key)) continue;
      if (!isValid(saved[key])) {
        console.warn(`Ignored invalid saved theme preference "${key}".`);
        continue;
      }
      preferences[key] = key === "fontSize" ? String(Number(saved[key])) : saved[key];
    }
  }

  restorePreferences();

  const fonts = Object.fromEntries(Object.entries(config.fonts).map(([key, font]) => [key, font.family]));
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));

  function applyPreferences() {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = preferences.appearance === "system"
      ? (prefersDark ? "dark" : "light")
      : preferences.appearance;
    document.body.dataset.theme = theme;
    document.body.dataset.density = preferences.density;
    document.body.dataset.panels = preferences.panelStyle;
    document.body.dataset.tone = preferences.pageTone;
    document.body.dataset.motion = preferences.reducedMotion ? "reduced" : "normal";
    document.body.style.setProperty("--app-accent", preferences.accent);
    document.body.style.setProperty("--app-font", fonts[preferences.font] || fonts.system);
    document.body.style.setProperty("--app-font-size", `${preferences.fontSize}px`);
    document.body.style.setProperty("--app-radius", preferences.rounded ? "16px" : "6px");
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      theme === "dark" ? "#0f0f0f" : "#ffffff",
    );
  }

  function savePreferences() {
    if (!isPremium && !config.accentOptions.some(({ value }) => value === preferences.accent)) {
      preferences.accent = config.accentOptions[0].value;
    }
    if (!isPremium && !["system", "rounded"].includes(preferences.font)) preferences.font = "system";
    applyPreferences();
    try {
      localStorage.setItem(config.storageKey, JSON.stringify(preferences));
      const saveStatus = document.querySelector("#theme-save-status");
      if (saveStatus) saveStatus.textContent = "All changes saved on this device";
    } catch (error) {
      console.error("Could not save theme preferences.", error);
      const saveStatus = document.querySelector("#theme-save-status");
      if (saveStatus) saveStatus.textContent = "Changes are active, but could not be saved";
    }
  }

  function syncControls() {
    document.querySelectorAll("[data-setting]").forEach((control) => {
      const key = control.dataset.setting;
      if (control.type === "checkbox") control.checked = Boolean(preferences[key]);
      else control.value = preferences[key];
    });
    const fontSize = document.querySelector("#font-size");
    const fontSizeValue = document.querySelector("#font-size-value");
    if (fontSize && fontSizeValue) fontSizeValue.value = `${fontSize.value} px`;
  }

  function syncPremiumControls() {
    document.querySelectorAll("[data-accent-preset]").forEach((button) => {
      button.hidden = isPremium;
    });
    if (accentInput) {
      accentInput.type = isPremium ? "color" : "hidden";
      accentInput.disabled = !isPremium;
      accentInput.tabIndex = isPremium ? 0 : -1;
    }
    const accentLabel = document.querySelector('label[for="accent"] > span');
    if (accentLabel) accentLabel.textContent = isPremium
      ? "Choose any color"
      : "Choose from available colors · Premium unlocks the full picker";
    if (fontSelect) {
      Array.from(fontSelect.options).forEach((option) => {
        option.hidden = ["serif", "mono"].includes(option.value) && !isPremium;
      });
    }
    if (!isPremium) {
      if (!config.accentOptions.some(({ value }) => value === preferences.accent)) {
        preferences.accent = config.accentOptions[0].value;
      }
      if (!["system", "rounded"].includes(preferences.font)) preferences.font = "system";
    }
  }

  function renderEffects() {
    if (!effectSelect || !app) return;
    if (!session) {
      effectSelect.innerHTML = '<option value="">Sign in to choose a name effect</option>';
      effectSelect.disabled = true;
      app.innerHTML = `<p class="theme-effects-note">Sign in to view and unlock name effects. Your balance: unavailable.</p>`;
      return;
    }
    const unlocked = effects.filter((effect) =>
      effect.premium_only ? isPremium : ownedEffects.has(effect.id),
    );
    if (selectedEffect && !unlocked.some(({ id }) => id === selectedEffect)) selectedEffect = "";
    effectSelect.innerHTML = `<option value="">None — plain text</option>${unlocked
      .filter(({ category }) => category === "name_effects")
      .map((effect) => `<option value="${escapeHtml(effect.id)}">${escapeHtml(effect.name)}${effect.premium_only ? " · Premium" : ""}</option>`)
      .join("")}`;
    effectSelect.disabled = false;
    effectSelect.value = selectedEffect;

    const available = effects.filter(({ category }) => category === "name_effects");
    const browserOpen = app.querySelector("#theme-effects-browser")?.open || false;
    app.innerHTML = `<div class="theme-effects-credit">${balance === null
      ? "Study Credits balance unavailable"
      : `${Number(balance).toLocaleString()} ${escapeHtml(CONTRIBUTION_CONFIG.currencyName)} available`}</div>
      <details id="theme-effects-browser" class="theme-effects-browser"${browserOpen ? " open" : ""}>
        <summary>Browse and unlock effects <span>${available.length}</span></summary>
        <label class="theme-effects-search-label" for="theme-effects-search">Find an effect</label>
        <input id="theme-effects-search" class="theme-control theme-effects-search" type="search" value="${escapeHtml(effectsQuery)}" placeholder="Search by name or description">
        <div class="theme-effect-cards">${available.map((effect) => {
      const owned = effect.premium_only ? isPremium : ownedEffects.has(effect.id);
      return `<article class="theme-effect-card" data-effect-search="${escapeHtml(`${effect.name} ${effect.description || effect.category}`.toLowerCase())}">
        <div><strong data-theme-effect="${escapeHtml(effect.id)}">${escapeHtml(effect.name)}</strong><small>${escapeHtml(effect.description || effect.category.replaceAll("_", " "))}</small></div>
        ${effect.premium_only
          ? `<span class="theme-effect-badge">${isPremium ? "Unlocked with Premium" : "Premium benefit"}</span>`
          : owned
            ? `<span class="theme-effect-badge">Unlocked</span>`
            : `<button class="theme-effect-buy" type="button" data-buy-theme-effect="${escapeHtml(effect.id)}">${Number(effect.price).toLocaleString()} ${escapeHtml(CONTRIBUTION_CONFIG.currencyName)} · Unlock</button>`}
      </article>`;
    }).join("") || '<p class="theme-effects-note">No published name effects yet.</p>'}</div>
      </details>`;
    const search = app.querySelector("#theme-effects-search");
    search.value = effectsQuery;
    search.addEventListener("input", () => {
      effectsQuery = search.value.trim().toLowerCase();
      app.querySelectorAll(".theme-effect-card").forEach((card) => {
        card.hidden = !card.dataset.effectSearch.includes(effectsQuery);
      });
    });
    app.querySelectorAll("[data-buy-theme-effect]").forEach((button) => {
      button.addEventListener("click", () => purchaseEffect(button.dataset.buyThemeEffect, button));
    });
  }

  async function reloadEffectState() {
    if (!session || !appData) {
      effects = [];
      ownedEffects = new Set();
      selectedEffect = "";
      balance = null;
      return;
    }
    const [effectRows, owned, selected, wallet, profileResult] = await Promise.all([
      loadThemeEffects(appData),
      loadOwnedThemeEffects(appData, session.user.id),
      loadSelectedThemeEffect(appData, session.user.id),
      appData.from("contribution_wallets").select("balance").eq("user_id", session.user.id).maybeSingle(),
      getPrimarySupabaseClient().from("profiles").select("is_premium,premium_until,is_admin").eq("id", session.user.id).maybeSingle(),
    ]);
    if (wallet.error) throw wallet.error;
    if (profileResult.error) throw profileResult.error;
    effects = effectRows;
    ownedEffects = owned;
    selectedEffect = selected;
    balance = wallet.data?.balance || 0;
    isPremium = Boolean(profileResult.data?.is_premium
      && (!profileResult.data.premium_until || new Date(profileResult.data.premium_until) > new Date()));
    if (profileResult.data?.is_admin) {
      const { data: sourceEffects, error: sourceError } = await getPrimarySupabaseClient()
        .from("theme_effects")
        .select("id,name,category,description,css_code,keyframes_code,price,premium_only,published");
      if (sourceError) throw sourceError;
      const { error: syncError } = await appData.rpc("sync_theme_effect_catalog", {
        p_effects: sourceEffects || [],
      });
      if (syncError) throw syncError;
      effects = await loadThemeEffects(appData);
    }
    applyThemeEffectStyles(effects);
  }

  async function purchaseEffect(effectId, button) {
    if (!appData) return;
    button.disabled = true;
    if (status) status.textContent = "Unlocking effect…";
    try {
      const { error } = await appData.rpc("purchase_theme_effect", { p_effect_id: effectId });
      if (error) throw error;
      await reloadEffectState();
      if (status) status.textContent = "Effect unlocked. Select it above to equip it on your leaderboards.";
      renderEffects();
    } catch (error) {
      if (status) status.textContent = `Could not unlock effect: ${error.message}`;
      button.disabled = false;
    }
  }

  function bindSettings() {
    document.querySelectorAll("[data-setting]").forEach((control) => {
      control.addEventListener("input", updatePreference);
      control.addEventListener("change", updatePreference);
    });
    document.querySelectorAll("[data-accent-preset]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!accentInput) return;
        accentInput.value = button.dataset.accentPreset;
        accentInput.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });
    document.querySelectorAll("[data-theme-preset]").forEach((button) => {
      button.addEventListener("click", () => {
        const presets = {
          studio: { appearance: "light", accent: "#7c3aed", font: "rounded", panelStyle: "soft", pageTone: "cool", rounded: true },
          midnight: { appearance: "dark", accent: "#38bdf8", font: "system", panelStyle: "raised", pageTone: "cool", rounded: true },
          calm: { appearance: "light", accent: "#0f766e", font: "system", panelStyle: "soft", pageTone: "warm", rounded: true },
          classic: { appearance: "system", accent: "#2563eb", font: "system", panelStyle: "classic", pageTone: "neutral", rounded: false },
        };
        const preset = presets[button.dataset.themePreset];
        if (!preset) return;
        Object.assign(preferences, preset);
        syncControls();
        savePreferences();
      });
    });
    document.querySelector("#theme-cycle")?.addEventListener("click", () => {
      const modes = ["light", "dark", "system"];
      preferences.appearance = modes[(modes.indexOf(preferences.appearance) + 1) % modes.length];
      syncControls();
      savePreferences();
    });
    document.querySelector("#reset-theme")?.addEventListener("click", () => {
      Object.assign(preferences, config.preferences);
      syncControls();
      savePreferences();
    });
    document.querySelector("#font-size")?.addEventListener("input", () => {
      const fontSize = document.querySelector("#font-size");
      const value = document.querySelector("#font-size-value");
      if (fontSize && value) value.value = `${fontSize.value} px`;
    });
    effectSelect?.addEventListener("change", async () => {
      if (!appData || !session) return;
      effectSelect.disabled = true;
      try {
        const { error } = await appData.rpc("equip_theme_effect", {
          p_effect_id: effectSelect.value || null,
          p_category: "name_effects",
        });
        if (error) throw error;
        selectedEffect = effectSelect.value;
        if (status) status.textContent = selectedEffect
          ? "Your leaderboard name effect is saved to your account."
          : "Your name effect is now set to None.";
      } catch (error) {
        if (status) status.textContent = `Could not save your effect: ${error.message}`;
        renderEffects();
      } finally {
        effectSelect.disabled = false;
      }
    });
  }

  function updatePreference(event) {
    const control = event.currentTarget;
    const key = control.dataset.setting;
    if (key === "accent" && !isPremium) {
      if (config.accentOptions.some(({ value }) => value === control.value)) {
        preferences.accent = control.value;
      }
      syncControls();
      savePreferences();
      return;
    }
    if (key === "font" && !isPremium && !["system", "rounded"].includes(control.value)) {
      preferences.font = "system";
      syncControls();
      savePreferences();
      return;
    }
    preferences[key] = control.type === "checkbox" ? control.checked : control.value;
    savePreferences();
  }

  async function initialize() {
    bindSettings();
    syncControls();
    applyPreferences();
    if (accentInput) accentInput.type = "hidden";
    if (SUPABASE_URL && SUPABASE_ANON_KEY) await loadSupabaseSdk();
    if (!window.supabase?.createClient) {
      syncPremiumControls();
      renderEffects();
      return;
    }
    const mainDb = getPrimarySupabaseClient();
    const { data, error } = await mainDb.auth.getSession();
    if (error) throw error;
    session = data.session;
    if (session) {
      if (app) {
        const { data: refreshed, error: refreshError } = await mainDb.auth.refreshSession();
        if (refreshError) throw refreshError;
        if (refreshed.session) session = refreshed.session;
      }
      const { data: profile, error: profileError } = await mainDb.from("profiles")
        .select("is_premium,premium_until")
        .eq("id", session.user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      isPremium = Boolean(profile?.is_premium
        && (!profile.premium_until || new Date(profile.premium_until) > new Date()));
      if (app) {
        appData = getAppDataSupabaseClient(session);
        if (!appData || !isAppDataConfigured()) throw new Error("The app-data project is not configured for Study Credits.");
        await reloadEffectState();
      }
    }
    syncPremiumControls();
    syncControls();
    savePreferences();
    renderEffects();
  }

  initialize().catch((error) => {
    console.error("Could not load theme settings.", error);
    isPremium = false;
    syncPremiumControls();
    savePreferences();
    if (status) status.textContent = `Theme settings are partly unavailable: ${error.message}`;
    renderEffects();
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (preferences.appearance === "system") applyPreferences();
  });
})();
