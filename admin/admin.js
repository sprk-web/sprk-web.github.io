import { escapeHtml, formatDate, renderAdminNavigation, requireAdmin, showAdminError } from "./admin-common.js";

const app = document.querySelector("#admin-app");

function renderOverview({ user, updates, publishedCount, views, recentViews, interactions, recentInteractions }) {
  const recentDrafts = updates.filter((item) => !item.published).length;
  app.innerHTML = `<section class="admin-page space-y-6">
    <h1 class="sr-only">Admin overview</h1>
    ${renderAdminNavigation("overview", user.email)}
    <div class="admin-page-actions">
      <button id="admin-refresh" class="admin-refresh" type="button"><i data-lucide="refresh-cw" class="h-4 w-4"></i>Refresh overview</button>
    </div>
    <div class="admin-metrics admin-overview-metrics">
      <article class="admin-metric-card"><span class="admin-metric-icon"><i data-lucide="eye" class="h-5 w-5"></i></span><p>Recorded page views</p><strong>${Number(views).toLocaleString()}</strong><span>All-time total</span></article>
      <article class="admin-metric-card"><span class="admin-metric-icon"><i data-lucide="megaphone" class="h-5 w-5"></i></span><p>Published updates</p><strong>${Number(publishedCount).toLocaleString()}</strong><span>${recentDrafts} drafts in the latest 100 updates</span></article>
      <article class="admin-metric-card"><span class="admin-metric-icon"><i data-lucide="activity" class="h-5 w-5"></i></span><p>Views this week</p><strong>${Number(recentViews).toLocaleString()}</strong><span>Last 7 days</span></article>
      <article class="admin-metric-card"><span class="admin-metric-icon"><i data-lucide="mouse-pointer-click" class="h-5 w-5"></i></span><p>Update interactions</p><strong>${Number(interactions).toLocaleString()}</strong><span>${Number(recentInteractions).toLocaleString()} in the last 7 days</span></article>
    </div>
    <div class="admin-tool-grid">
      <a class="theme-card admin-tool-card" href="./post-updates/"><span class="admin-tool-icon"><i data-lucide="megaphone" class="h-5 w-5"></i></span><span class="admin-tool-copy"><strong>Post updates</strong><small>Write announcements, save drafts, manage attachments, and edit or unpublish existing posts.</small></span><i data-lucide="arrow-up-right" class="admin-tool-arrow h-5 w-5"></i></a>
      <a class="theme-card admin-tool-card" href="./traffic/"><span class="admin-tool-icon"><i data-lucide="chart-no-axes-column-increasing" class="h-5 w-5"></i></span><span class="admin-tool-copy"><strong>Traffic analytics</strong><small>Compare date ranges, find popular pages, and see which updates visitors engage with.</small></span><i data-lucide="arrow-up-right" class="admin-tool-arrow h-5 w-5"></i></a>
    </div>
    <section class="theme-card admin-panel admin-table-panel">
      <div class="admin-panel-heading"><span class="admin-panel-icon"><i data-lucide="file-text" class="h-5 w-5"></i></span><div><h2>Recent updates</h2><p>Latest content activity at a glance.</p></div><a class="admin-action" href="./post-updates/">Manage updates →</a></div>
      <div class="overflow-x-auto"><table class="admin-table w-full text-left text-sm"><thead><tr><th class="p-3">Title</th><th class="p-3">Created</th><th class="p-3">Status</th></tr></thead><tbody>${updates.slice(0, 6).map((item) => `<tr class="border-t border-slate-200"><td class="p-3 font-medium">${escapeHtml(item.title || "Untitled update")}</td><td class="p-3">${escapeHtml(formatDate(item.created_at))}</td><td class="p-3"><span class="admin-status ${item.published ? "is-published" : "is-draft"}">${item.published ? "Published" : "Draft"}</span></td></tr>`).join("") || '<tr><td colspan="3" class="p-4">No updates created yet.</td></tr>'}</tbody></table></div>
    </section>
    <p class="admin-data-note"><i data-lucide="shield-check" class="h-4 w-4"></i>Admin access is checked against the configured email allowlist. Keep Supabase row-level security enabled for every admin table and storage bucket.</p>
  </section>`;

  window.lucide?.createIcons();
  app.querySelector("#admin-refresh").addEventListener("click", () => loadOverview().catch((error) => showAdminError(app, error.message)));
}

async function loadOverview() {
  const context = await requireAdmin(app);
  if (!context) return;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [updatesResult, publishedResult, viewsResult, recentViewsResult, interactionsResult, recentInteractionsResult] = await Promise.all([
    context.db.from("site_updates").select("id,title,published,created_at").order("created_at", { ascending: false }).limit(100),
    context.db.from("site_updates").select("id", { count: "exact", head: true }).eq("published", true),
    context.db.from("site_analytics").select("id", { count: "exact", head: true }).eq("event_type", "page_view"),
    context.db.from("site_analytics").select("id", { count: "exact", head: true }).eq("event_type", "page_view").gte("created_at", since),
    context.db.from("site_analytics").select("id", { count: "exact", head: true }).eq("event_type", "content_engagement"),
    context.db.from("site_analytics").select("id", { count: "exact", head: true }).eq("event_type", "content_engagement").gte("created_at", since),
  ]);
  const failed = [updatesResult, publishedResult, viewsResult, recentViewsResult, interactionsResult, recentInteractionsResult].find((result) => result.error);
  if (failed) {
    showAdminError(app, `Could not load the admin overview: ${failed.error.message}`);
    return;
  }
  renderOverview({
    user: context.user,
    updates: updatesResult.data || [],
    publishedCount: publishedResult.count || 0,
    views: viewsResult.count || 0,
    recentViews: recentViewsResult.count || 0,
    interactions: interactionsResult.count || 0,
    recentInteractions: recentInteractionsResult.count || 0,
  });
}

loadOverview().catch((error) => showAdminError(app, error.message));
