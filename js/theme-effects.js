export async function loadThemeEffects(appData) {
  const { data, error } = await appData
    .from("theme_effect_catalog")
    .select("id,name,category,description,css_code,keyframes_code,price,premium_only,published")
    .eq("published", true)
    .order("name");
  if (error) throw error;
  return data || [];
}

export async function loadOwnedThemeEffects(appData, userId) {
  const { data, error } = await appData
    .from("user_theme_effects")
    .select("effect_id")
    .eq("user_id", userId);
  if (error) throw error;
  return new Set((data || []).map(({ effect_id }) => effect_id));
}

export async function loadSelectedThemeEffect(appData, userId) {
  const { data, error } = await appData
    .from("user_theme_effect_preferences")
    .select("effect_id")
    .eq("user_id", userId)
    .eq("category", "name_effects")
    .maybeSingle();
  if (error) throw error;
  return data?.effect_id || "";
}

export async function loadLeaderboardEffects(appData, userIds) {
  if (!userIds.length) return new Map();
  const { data, error } = await appData
    .from("user_theme_effect_preferences")
    .select("user_id,effect_id")
    .eq("category", "name_effects")
    .in("user_id", userIds);
  if (error) throw error;
  return new Map((data || []).map(({ user_id, effect_id }) => [user_id, effect_id]));
}

export function applyThemeEffectStyles(effects) {
  for (const effect of effects) {
    if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(effect.id)) {
      throw new Error(`Invalid theme effect identifier: ${effect.id}`);
    }
    const declarations = String(effect.css_code || "").trim();
    if (!declarations || /[{}<>]|@import|url\s*\(|expression\s*\(|javascript:/i.test(declarations)) {
      throw new Error(`Theme effect "${effect.name}" contains unsupported CSS.`);
    }
    const keyframes = String(effect.keyframes_code || "").trim();
    if (keyframes) validateThemeKeyframes(effect.id, keyframes);
    const styleId = `theme-effect-${effect.id}`;
    let style = document.getElementById(styleId);
    if (!style) {
      style = document.createElement("style");
      style.id = styleId;
      document.head.append(style);
    }
    style.textContent = `[data-theme-effect="${effect.id}"] { ${declarations} }\n${keyframes}`;
  }
}

export function validateThemeKeyframes(effectId, keyframes) {
  if (/[<>]|url\s*\(|@import|expression\s*\(|javascript:/i.test(keyframes)) {
    throw new Error("Theme effect keyframes contain unsupported CSS.");
  }
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(keyframes);
  if (!sheet.cssRules.length) throw new Error("Add at least one keyframes rule or leave the field blank.");
  for (const rule of sheet.cssRules) {
    if (rule.type !== CSSRule.KEYFRAMES_RULE || !rule.name.startsWith(`${effectId}-`)) {
      throw new Error(`Keyframes may contain only @keyframes rules named with the "${effectId}-" prefix.`);
    }
    for (const frame of rule.cssRules) {
      if (frame.type !== CSSRule.KEYFRAME_RULE
        || !frame.keyText.split(",").every((key) => /^(from|to|(?:\d+(?:\.\d+)?%))$/.test(key.trim()))
        || /url\s*\(|expression\s*\(|javascript:/i.test(frame.style.cssText)) {
        throw new Error("Keyframes may use only from, to, or percentage frames with safe CSS declarations.");
      }
    }
  }
}
