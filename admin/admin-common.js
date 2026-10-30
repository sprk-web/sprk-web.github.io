import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../js/config.js";
import { getPrimarySupabaseClient } from "../js/supabaseClient.js";
import { getAppDataSupabaseClient, isAppDataConfigured } from "../js/appDataSupabaseClient.js";

export const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]));

export function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function showAdminError(
  app,
  message,
  signInHref = new URL("../account/", import.meta.url).href,
  detail = "Admin access is controlled by the signed-in account’s profiles.is_admin flag and enforced by Supabase row-level security. Do not put a service-role key in browser code.",
) {
  app.innerHTML = `<section class="theme-card admin-access-card"><span class="admin-panel-icon"><i data-lucide="shield-check" class="h-5 w-5"></i></span><p class="admin-eyebrow">SITE MANAGEMENT</p><h1>Admin panel</h1><p class="admin-access-message">${escapeHtml(message)}</p><p class="admin-access-detail">${escapeHtml(detail)}</p><a class="admin-action" href="${signInHref}">Sign in or return to your account <span aria-hidden="true">→</span></a></section>`;
  window.lucide?.createIcons();
}

export async function requireAdmin(app, signInHref = new URL("../account/", import.meta.url).href) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase?.createClient) {
    showAdminError(app, "Supabase is not configured or could not be loaded.", signInHref);
    return null;
  }

  const db = getPrimarySupabaseClient();
  const { data, error } = await db.auth.getSession();
  if (error) {
    showAdminError(app, error.message, signInHref);
    return null;
  }

  const user = data.session?.user;
  if (!user) {
    showAdminError(app, "Please sign in on the account page first.", signInHref);
    return null;
  }
  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    showAdminError(app, `Could not verify admin access: ${profileError.message}`, signInHref);
    return null;
  }
  if (!profile?.is_admin) {
    showAdminError(app, "This account does not have admin access. An administrator must enable it on the account’s profile.", signInHref);
    return null;
  }
  const session = data.session;
  const appDataDb = isAppDataConfigured() && session ? getAppDataSupabaseClient(session) : null;
  return { db, appDataDb, session, user };
}

export function renderAdminNavigation(activePage, email) {
  const prefix = activePage === "overview" ? "./" : "../";
  const links = [
    { key: "overview", label: "Overview", icon: "layout-dashboard", href: prefix },
    { key: "issues", label: "Simulation issues", icon: "shield-alert", href: `${prefix}issues/` },
    { key: "complaints", label: "Complaints", icon: "messages-square", href: `${prefix}complaints/` },
    { key: "communities", label: "Communities", icon: "users-round", href: `${prefix}communities/` },
    { key: "updates", label: "Post updates", icon: "megaphone", href: `${prefix}post-updates/` },
    { key: "traffic", label: "Traffic analytics", icon: "chart-no-axes-column-increasing", href: `${prefix}traffic/` },
  ];
  return `<nav class="admin-subnav" aria-label="Admin sections">${links.map((link) => `<a href="${link.href}" ${link.key === activePage ? 'aria-current="page"' : ""}><i data-lucide="${link.icon}" class="h-4 w-4"></i>${link.label}</a>`).join("")}<span class="admin-nav-account"><i data-lucide="user-round" class="h-4 w-4"></i>${escapeHtml(email)}</span></nav>`;
}
