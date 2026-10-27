import { SITE_CONFIG } from "./config.js";

(() => {
  const themeConfig = SITE_CONFIG.theme;
  const defaults = { ...themeConfig.preferences };
  const storageKey = themeConfig.storageKey;
  let preferences = { ...defaults };

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    preferences = { ...defaults, ...saved };
  } catch (error) {
    console.error("Could not load saved theme preferences.", error);
  }

  const fonts = Object.fromEntries(
    Object.entries(themeConfig.fonts).map(([key, font]) => [key, font.family]),
  );

  const populateSelect = (selector, options) => {
    const select = document.querySelector(selector);
    if (!select) return;
    select.innerHTML = options.map(({ value, label }) =>
      `<option value="${value}">${label}</option>`,
    ).join("");
  };
  populateSelect("#appearance", themeConfig.appearanceOptions);
  populateSelect("#font", Object.entries(themeConfig.fonts).map(([value, font]) => ({
    value,
    label: font.label,
  })));
  populateSelect("#density", themeConfig.densityOptions);
  populateSelect("#panel-style", themeConfig.panelStyleOptions);
  populateSelect("#page-tone", themeConfig.pageToneOptions);
  const fontSizeControl = document.querySelector("#font-size");
  if (fontSizeControl) {
    fontSizeControl.min = themeConfig.fontSize.min;
    fontSizeControl.max = themeConfig.fontSize.max;
    fontSizeControl.step = themeConfig.fontSize.step;
  }
  if (!SITE_CONFIG.controls.showThemeSelector) {
    document.querySelector("#appearance")?.closest("section")?.remove();
  }
  if (!SITE_CONFIG.controls.showAccentPicker) {
    document.querySelector("#accent")?.closest("section")?.remove();
  }

  function applyPreferences() {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = preferences.appearance === "system"
      ? (prefersDark ? "dark" : "light")
      : preferences.appearance;
    const body = document.body;

    body.dataset.theme = theme;
    body.dataset.density = preferences.density;
    body.dataset.panels = preferences.panelStyle;
    body.dataset.tone = preferences.pageTone;
    body.dataset.motion = preferences.reducedMotion ? "reduced" : "normal";
    body.style.setProperty("--app-accent", preferences.accent);
    body.style.setProperty("--app-font", fonts[preferences.font] || fonts.system);
    body.style.setProperty("--app-font-size", `${preferences.fontSize}px`);
    body.style.setProperty("--app-radius", preferences.rounded ? "16px" : "6px");
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      theme === "dark" ? "#0f0f0f" : "#ffffff",
    );
  }

  function savePreferences() {
    applyPreferences();
    try {
      localStorage.setItem(storageKey, JSON.stringify(preferences));
      const status = document.querySelector("#theme-save-status");
      if (status) status.textContent = "All changes saved on this device";
    } catch (error) {
      console.error("Could not save theme preferences.", error);
      const status = document.querySelector("#theme-save-status");
      if (status) status.textContent = "Changes are active, but could not be saved";
    }
  }

  const presets = {
    studio: { appearance: "light", accent: "#7c3aed", font: "rounded", panelStyle: "soft", pageTone: "cool", rounded: true },
    midnight: { appearance: "dark", accent: "#38bdf8", font: "system", panelStyle: "raised", pageTone: "cool", rounded: true },
    calm: { appearance: "light", accent: "#0f766e", font: "serif", panelStyle: "soft", pageTone: "warm", rounded: true },
    classic: { appearance: "system", accent: "#2563eb", font: "system", panelStyle: "classic", pageTone: "neutral", rounded: false },
  };

  function syncPresetButtons() {
    document.querySelectorAll("[data-theme-preset]").forEach((button) => {
      const preset = presets[button.dataset.themePreset];
      const isSelected = Boolean(preset) && Object.entries(preset).every(
        ([key, value]) => preferences[key] === value,
      );
      button.setAttribute("aria-pressed", String(isSelected));
    });
  }

  function syncControls() {
    document.querySelectorAll("[data-setting]").forEach((control) => {
      const key = control.dataset.setting;
      if (control.type === "checkbox") {
        control.checked = Boolean(preferences[key]);
      } else {
        control.value = preferences[key];
      }
    });
    const fontSize = document.querySelector("#font-size");
    const fontSizeValue = document.querySelector("#font-size-value");
    if (fontSize && fontSizeValue) fontSizeValue.value = `${fontSize.value} px`;
    document.querySelectorAll("[data-accent-preset]").forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.accentPreset.toLowerCase() === String(preferences.accent || "").toLowerCase()),
      );
    });
    syncPresetButtons();
  }

  document.querySelectorAll("[data-setting]").forEach((control) => {
    control.addEventListener("input", updatePreference);
    control.addEventListener("change", updatePreference);
  });
  document.querySelectorAll("[data-accent-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      const accentControl = document.querySelector("#accent");
      if (!accentControl) return;
      accentControl.value = button.dataset.accentPreset;
      accentControl.dispatchEvent(new Event("input", { bubbles: true }));
    });
    document.querySelectorAll("[data-theme-preset]").forEach((button) => {
      button.addEventListener("click", () => {
        const preset = presets[button.dataset.themePreset];
        if (!preset) return;
        preferences = { ...preferences, ...preset };
        syncControls();
        savePreferences();
      });
    });
  });

  function updatePreference(event) {
    const control = event.currentTarget;
    const key = control.dataset.setting;
    preferences[key] = control.type === "checkbox" ? control.checked : control.value;
    savePreferences();
    if (key === "accent") syncControls();
    else syncPresetButtons();
  }

  document.querySelector("#reset-theme")?.addEventListener("click", () => {
    preferences = { ...defaults };
    syncControls();
    savePreferences();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      applyPreferences();
      syncControls();
    }, { once: true });
  } else {
    applyPreferences();
    syncControls();
  }

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (preferences.appearance === "system") applyPreferences();
  });
})();
