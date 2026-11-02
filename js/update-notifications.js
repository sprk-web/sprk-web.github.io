import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";
import { getPrimarySupabaseClient } from "./supabaseClient.js";
import { loadSupabaseSdk } from "./loadSupabaseSdk.js";

const lastReadKey = "sprk-updates-last-read";

function lastReadTimestamp() {
  try {
    const stored = localStorage.getItem(lastReadKey);
    if (!stored) return null;
    const timestamp = Number(stored);
    return Number.isFinite(timestamp) ? timestamp : null;
  } catch (error) {
    console.error("Could not read the Updates seen marker.", error);
    return null;
  }
}

export function markUpdatesRead(createdAt) {
  const timestamp = new Date(createdAt).getTime();
  if (!Number.isFinite(timestamp)) return;
  try {
    const previousTimestamp = lastReadTimestamp();
    localStorage.setItem(lastReadKey, String(Math.max(previousTimestamp || 0, timestamp)));
    window.dispatchEvent(new Event("sprk-updates-read"));
  } catch (error) {
    console.error("Could not save the Updates seen marker.", error);
  }
}

export async function initializeUpdatesIndicator() {
  const indicators = [...document.querySelectorAll("[data-updates-indicator]")];
  if (!indicators.length || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;

  try {
    await loadSupabaseSdk();
    const db = getPrimarySupabaseClient();
    const { data, error } = await db
      .from("site_updates")
      .select("created_at")
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return;

    const publishedTimestamp = new Date(data.created_at).getTime();
    if (!Number.isFinite(publishedTimestamp)) {
      throw new Error("The latest published update has an invalid creation date.");
    }

    const originalLinkAttributes = new Map(indicators.map((indicator) => {
      const link = indicator.closest("a");
      return [link, {
        ariaLabel: link?.getAttribute("aria-label"),
        title: link?.getAttribute("title"),
      }];
    }));
    const refresh = () => {
      const readTimestamp = lastReadTimestamp();
      const unread = readTimestamp === null || publishedTimestamp > readTimestamp;
      indicators.forEach((indicator) => {
        indicator.hidden = !unread;
        const link = indicator.closest("a");
        if (!link) return;
        if (unread) {
          const original = originalLinkAttributes.get(link);
          link.setAttribute("aria-label", `${original?.ariaLabel || original?.title || "Updates"} (new unread update)`);
          link.title = "New unread update";
        } else {
          const original = originalLinkAttributes.get(link);
          if (original?.ariaLabel) link.setAttribute("aria-label", original.ariaLabel);
          else link.removeAttribute("aria-label");
          if (original?.title) link.title = original.title;
          else link.removeAttribute("title");
        }
      });
    };
    refresh();
    window.addEventListener("sprk-updates-read", refresh);
  } catch (error) {
    console.error("Could not check for unread updates.", error);
  }
}
