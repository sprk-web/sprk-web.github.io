import { ADMIN_EMAILS, SUPABASE_ANON_KEY, SUPABASE_URL } from "../js/config.js";

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

export function showAdminError(app, message, signInHref = "../account/") {
  app.innerHTML = `<section class="theme-card admin-access-card"><span class="admin-panel-icon"><i data-lucide="shield-check" class="h-5 w-5"></i></span><p class="admin-eyebrow">SITE MANAGEMENT</p><h1>Admin panel</h1><p class="admin-access-message">${escapeHtml(message)}</p><p class="admin-access-detail">Admin access is restricted by the email allowlist in js/config.js and Supabase row-level security. Do not put a service-role key in browser code.</p><a class="admin-action" href="${signInHref}">Sign in or return to your account <span aria-hidden="true">→</span></a></section>`;
  window.lucide?.createIcons();
}

export async function requireAdmin(app, signInHref = "../account/") {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase?.createClient) {
    showAdminError(app, "Supabase is not configured or could not be loaded.", signInHref);
    return null;
  }

  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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
  if (!ADMIN_EMAILS.some((email) => email && email !== "replace-with-your-email@example.com" && email.toLowerCase() === String(user.email).toLowerCase())) {
    showAdminError(app, "This account is not in ADMIN_EMAILS. Add your owner email to js/config.js, then refresh.", signInHref);
    return null;
  }
  return { db, user };
}

export function renderAdminNavigation(activePage, email) {
  const prefix = activePage === "overview" ? "./" : "../";
  const links = [
    { key: "overview", label: "Overview", icon: "layout-dashboard", href: prefix },
    { key: "issues", label: "Simulation issues", icon: "shield-alert", href: `${prefix}issues/` },
    { key: "complaints", label: "Complaints", icon: "messages-square", href: `${prefix}complaints/` },
    { key: "updates", label: "Post updates", icon: "megaphone", href: `${prefix}post-updates/` },
    { key: "traffic", label: "Traffic analytics", icon: "chart-no-axes-column-increasing", href: `${prefix}traffic/` },
  ];
  return `<nav class="admin-subnav" aria-label="Admin sections">${links.map((link) => `<a href="${link.href}" ${link.key === activePage ? 'aria-current="page"' : ""}><i data-lucide="${link.icon}" class="h-4 w-4"></i>${link.label}</a>`).join("")}<span class="admin-nav-account"><i data-lucide="user-round" class="h-4 w-4"></i>${escapeHtml(email)}</span></nav>`;
}
