import { escapeHtml, formatDate, renderAdminNavigation, requireAdmin, showAdminError } from "../admin-common.js";
import { alertDialog } from "../../js/dialogs.js";

const app = document.querySelector("#admin-app");
const maxRows = 5000;
const state = {
  db: null,
  events: [],
  contentEvents: [],
  contentTitles: new Map(),
  allTimeCount: 0,
  period: { pageViews: 0, previousPageViews: null, interactions: 0, previousInteractions: null },
  page: 1,
  pageSize: 25,
  sort: "created_at",
  direction: "desc",
};

function rangeBounds(range) {
  const days = { day: 1, week: 7, month: 30 }[range];
  if (!days) return { start: null, previousStart: null, previousEnd: null };
  const duration = days * 24 * 60 * 60 * 1000;
  const now = Date.now();
  return {
    start: new Date(now - duration).toISOString(),
    previousStart: new Date(now - duration * 2).toISOString(),
    previousEnd: new Date(now - duration).toISOString(),
  };
}

function renderPage(email) {
  app.innerHTML = `<section class="admin-page space-y-6">
    <h1 class="sr-only">Traffic analytics</h1>
    ${renderAdminNavigation("traffic", email)}
    <div class="admin-page-actions">
      <div class="admin-header-actions"><button id="traffic-refresh" class="admin-refresh" type="button"><i data-lucide="refresh-cw" class="h-4 w-4"></i>Refresh</button><button id="traffic-export" class="admin-refresh" type="button"><i data-lucide="download" class="h-4 w-4"></i>Export CSV</button></div>
    </div>
    <div class="admin-metrics admin-traffic-metrics">
      <article class="admin-metric-card"><span class="admin-metric-icon"><i data-lucide="eye" class="h-4 w-4"></i></span><p>Matching page views</p><strong id="metric-matches">0</strong><span>Current filters</span></article>
      <article class="admin-metric-card"><span class="admin-metric-icon"><i data-lucide="panels-top-left" class="h-4 w-4"></i></span><p>Pages visited</p><strong id="metric-pages">0</strong><span>Distinct paths in results</span></article>
      <article class="admin-metric-card"><span class="admin-metric-icon"><i data-lucide="monitor-smartphone" class="h-4 w-4"></i></span><p>All-time page views</p><strong id="metric-total">${state.allTimeCount.toLocaleString()}</strong><span>Supabase exact count</span></article>
      <article class="admin-metric-card"><span class="admin-metric-icon"><i data-lucide="mouse-pointer-click" class="h-4 w-4"></i></span><p>Content interactions</p><strong id="metric-content">0</strong><span>Update media and permalink clicks</span></article>
    </div>
    <section class="theme-card admin-panel admin-period-comparison" aria-label="Date comparison">
      <div class="admin-panel-heading"><span class="admin-panel-icon"><i data-lucide="calendar-range" class="h-5 w-5"></i></span><div><h2>Date comparison</h2><p id="period-label">Current range compared with the previous matching period.</p></div></div>
      <div class="admin-comparison-grid">
        <article><span>Page views in range</span><strong id="period-views">0</strong><small id="period-views-comparison"></small><span id="period-views-previous"></span></article>
        <article><span>Content interactions</span><strong id="period-interactions">0</strong><small id="period-interactions-comparison"></small><span id="period-interactions-previous"></span></article>
      </div>
    </section>
    <section class="theme-card admin-panel admin-traffic-filters" aria-label="Traffic filters">
      <label class="admin-search"><i data-lucide="search" class="h-4 w-4"></i><input id="traffic-search" type="search" placeholder="Search pages, regions, devices or referrers" aria-label="Search traffic"></label>
      <label class="admin-filter-field"><span>Date range</span><select id="traffic-range" class="theme-control"><option value="day">Last 24 hours</option><option value="week">Last 7 days</option><option value="month" selected>Last 30 days</option><option value="all">All recorded time</option></select></label>
      <label class="admin-filter-field"><span>Page</span><select id="traffic-page-filter" class="theme-control"><option value="">All pages</option></select></label>
      <label class="admin-filter-field"><span>Device</span><select id="traffic-device-filter" class="theme-control"><option value="">All devices</option></select></label>
      <label class="admin-filter-field"><span>Region</span><select id="traffic-region-filter" class="theme-control"><option value="">All regions</option></select></label>
      <label class="admin-filter-field"><span>Sort by</span><select id="traffic-sort" class="theme-control"><option value="created_at">Time</option><option value="page_path">Page</option><option value="device_type">Device</option><option value="region">Region</option><option value="referrer">Referrer</option></select></label>
      <button id="traffic-direction" class="admin-secondary-button" type="button" aria-label="Toggle sort direction">Newest first</button>
    </section>
    <div class="admin-traffic-summary">
      <section class="theme-card admin-panel admin-top-pages"><div class="admin-panel-heading"><span class="admin-panel-icon"><i data-lucide="route" class="h-5 w-5"></i></span><div><h2>Most visited pages</h2><p>Top paths in the filtered results.</p></div></div><div id="top-pages-list"></div></section>
      <section class="theme-card admin-panel admin-top-pages"><div class="admin-panel-heading"><span class="admin-panel-icon"><i data-lucide="sparkles" class="h-5 w-5"></i></span><div><h2>Most engaged updates</h2><p>Update media and permalink interactions.</p></div></div><div id="top-content-list"></div></section>
      <p class="admin-data-note"><i data-lucide="info" class="h-4 w-4"></i><span id="traffic-data-note">Loading page views…</span></p>
    </div>
    <section class="theme-card admin-panel admin-table-panel">
      <div class="admin-panel-heading"><span class="admin-panel-icon"><i data-lucide="list-filter" class="h-5 w-5"></i></span><div><h2>Page-view events</h2><p id="traffic-result-summary">Loading analytics…</p></div></div>
      <div class="overflow-x-auto"><table class="admin-table admin-traffic-table w-full text-left text-sm"><thead><tr><th class="p-3">Time</th><th class="p-3">Page</th><th class="p-3">Device</th><th class="p-3">Region</th><th class="p-3">Referrer</th></tr></thead><tbody id="traffic-table-body"></tbody></table></div>
      <div class="admin-pagination"><span id="traffic-page-summary"></span><div><button id="traffic-prev" class="admin-secondary-button" type="button">Previous</button><button id="traffic-next" class="admin-secondary-button" type="button">Next</button><label class="admin-filter-field"><span>Rows</span><select id="traffic-page-size" class="theme-control"><option>25</option><option>50</option><option>100</option></select></label></div></div>
    </section>
  </section>`;

  window.lucide?.createIcons();
  app.querySelector("#traffic-search").addEventListener("input", updateResults);
  ["traffic-page-filter", "traffic-device-filter", "traffic-region-filter", "traffic-sort"].forEach((id) => {
    app.querySelector(`#${id}`).addEventListener("change", () => {
      if (id === "traffic-sort") {
        state.sort = app.querySelector(`#${id}`).value;
        syncDirectionLabel();
      }
      state.page = 1;
      updateResults();
    });
  });
  app.querySelector("#traffic-range").addEventListener("change", () => loadEvents().catch((error) => showAdminError(app, error.message, "../../account/")));
  app.querySelector("#traffic-direction").addEventListener("click", () => {
    state.direction = state.direction === "desc" ? "asc" : "desc";
    syncDirectionLabel();
    updateResults();
  });
  app.querySelector("#traffic-page-size").addEventListener("change", (event) => {
    state.pageSize = Number(event.target.value);
    state.page = 1;
    updateResults();
  });
  app.querySelector("#traffic-prev").addEventListener("click", () => {
    state.page -= 1;
    updateResults();
  });
  app.querySelector("#traffic-next").addEventListener("click", () => {
    state.page += 1;
    updateResults();
  });
  app.querySelector("#traffic-refresh").addEventListener("click", () => loadEvents().catch((error) => showAdminError(app, error.message, "../../account/")));
  app.querySelector("#traffic-export").addEventListener("click", exportCsv);
}

function syncDirectionLabel() {
  const button = app.querySelector("#traffic-direction");
  if (!button) return;
  const direction = state.sort === "created_at"
    ? (state.direction === "desc" ? "Newest first" : "Oldest first")
    : (state.direction === "desc" ? "Descending" : "Ascending");
  button.textContent = direction;
  button.setAttribute("aria-label", `Sort ${state.direction === "desc" ? "descending" : "ascending"}`);
}

function setOptions(id, label, values) {
  const select = app.querySelector(`#${id}`);
  const previous = select.value;
  select.innerHTML = `<option value="">${label}</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
  if (values.includes(previous)) select.value = previous;
}

function populateFilterOptions() {
  setOptions("traffic-page-filter", "All pages", [...new Set(state.events.map((event) => event.page_path || "Unknown"))].sort());
  setOptions("traffic-device-filter", "All devices", [...new Set(state.events.map((event) => event.device_type || "Unknown"))].sort());
  setOptions("traffic-region-filter", "All regions", [...new Set(state.events.map((event) => event.region || "Unknown"))].sort());
}

function filteredEvents() {
  const query = app.querySelector("#traffic-search").value.trim().toLowerCase();
  const page = app.querySelector("#traffic-page-filter").value;
  const device = app.querySelector("#traffic-device-filter").value;
  const region = app.querySelector("#traffic-region-filter").value;
  const sortBy = app.querySelector("#traffic-sort").value;
  const compareValues = (a, b) => String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });

  return state.events.filter((event) => {
    const matchesText = !query || [event.page_path, event.device_type, event.region, event.referrer, formatDate(event.created_at)]
      .some((value) => String(value || "").toLowerCase().includes(query));
    return matchesText
      && (!page || (event.page_path || "Unknown") === page)
      && (!device || (event.device_type || "Unknown") === device)
      && (!region || (event.region || "Unknown") === region);
  }).sort((a, b) => {
    const result = sortBy === "created_at"
      ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      : compareValues(a[sortBy], b[sortBy]);
    return state.direction === "desc" ? -result : result;
  });
}

function updateResults() {
  const rows = filteredEvents();
  const uniquePages = new Set(rows.map((event) => event.page_path || "Unknown")).size;
  app.querySelector("#metric-matches").textContent = rows.length.toLocaleString();
  app.querySelector("#metric-pages").textContent = uniquePages.toLocaleString();
  app.querySelector("#metric-total").textContent = state.allTimeCount.toLocaleString();
  app.querySelector("#metric-content").textContent = state.period.interactions.toLocaleString();
  updatePeriodComparison();

  const counts = {};
  rows.forEach((event) => {
    const page = event.page_path || "Unknown";
    counts[page] = (counts[page] || 0) + 1;
  });
  const topPages = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maximum = topPages[0]?.[1] || 1;
  app.querySelector("#top-pages-list").innerHTML = topPages.map(([page, count]) => `<div class="admin-page-bar"><span title="${escapeHtml(page)}">${escapeHtml(page)}</span><div><i style="width:${Math.max(3, count / maximum * 100)}%"></i></div><strong>${count}</strong></div>`).join("") || '<p class="admin-empty-note">No page views match these filters.</p>';

  const contentCounts = {};
  state.contentEvents.forEach((event) => {
    const match = String(event.page_path || "").match(/#update-(.+)$/);
    if (!match) return;
    let updateId;
    try {
      updateId = decodeURIComponent(match[1]);
    } catch {
      return;
    }
    contentCounts[updateId] = (contentCounts[updateId] || 0) + 1;
  });
  const topContent = Object.entries(contentCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxInteractions = topContent[0]?.[1] || 1;
  app.querySelector("#top-content-list").innerHTML = topContent.map(([id, count]) => {
    const title = state.contentTitles.get(id) || "Update";
    return `<div class="admin-page-bar"><span title="${escapeHtml(title)}">${escapeHtml(title)}</span><div><i style="width:${Math.max(3, count / maxInteractions * 100)}%"></i></div><strong>${count}</strong></div>`;
  }).join("") || '<p class="admin-empty-note">No update interactions in this date range.</p>';

  const pageCount = Math.max(1, Math.ceil(rows.length / state.pageSize));
  state.page = Math.min(Math.max(1, state.page), pageCount);
  const start = (state.page - 1) * state.pageSize;
  const shown = rows.slice(start, start + state.pageSize);
  app.querySelector("#traffic-table-body").innerHTML = shown.map((event) => `<tr class="border-t border-slate-200"><td class="p-3">${escapeHtml(formatDate(event.created_at))}</td><td class="p-3">${escapeHtml(event.page_path || "Unknown")}</td><td class="p-3">${escapeHtml(event.device_type || "Unknown")}</td><td class="p-3">${escapeHtml(event.region || "Unknown")}</td><td class="p-3">${escapeHtml(event.referrer || "Direct")}</td></tr>`).join("") || '<tr><td colspan="5" class="p-4">No page views match these filters.</td></tr>';
  app.querySelector("#traffic-result-summary").textContent = `${rows.length.toLocaleString()} matching events`;
  app.querySelector("#traffic-page-summary").textContent = rows.length ? `Showing ${start + 1}–${Math.min(start + state.pageSize, rows.length)} of ${rows.length.toLocaleString()}` : "No results";
  app.querySelector("#traffic-prev").disabled = state.page <= 1;
  app.querySelector("#traffic-next").disabled = state.page >= pageCount;
  app.querySelector("#traffic-data-note").textContent = state.events.length === maxRows || state.contentEvents.length === maxRows
    ? `Showing up to ${maxRows.toLocaleString()} recent page views and interactions per event type. Narrow the date range if you need to search beyond this result cap. Localhost and admin sessions are excluded; no IP or precise location is collected.`
    : `${state.events.length.toLocaleString()} page views and ${state.contentEvents.length.toLocaleString()} update interactions loaded for this date range. Totals use exact counts. Localhost and admin sessions are excluded; no IP or precise location is collected.`;
}

function rangeDescription(range) {
  return { day: "last 24 hours", week: "last 7 days", month: "last 30 days", all: "all recorded time" }[range];
}

function percentageChange(current, previous) {
  if (previous === null) return "No earlier period for comparison.";
  if (previous === 0) return current === 0 ? "No change from a period with no activity." : "Activity recorded; previous period had none.";
  const change = Math.round(((current - previous) / previous) * 100);
  return `${change > 0 ? "+" : ""}${change}% vs previous period`;
}

function updatePeriodComparison() {
  const range = app.querySelector("#traffic-range").value;
  const periodLabel = rangeDescription(range);
  app.querySelector("#period-label").textContent = range === "all"
    ? "Totals for all recorded time. Choose a fixed date range to compare periods."
    : `Current ${periodLabel} compared with the previous matching period.`;
  app.querySelector("#period-views").textContent = state.period.pageViews.toLocaleString();
  app.querySelector("#period-interactions").textContent = state.period.interactions.toLocaleString();
  app.querySelector("#period-views-comparison").textContent = percentageChange(state.period.pageViews, state.period.previousPageViews);
  app.querySelector("#period-interactions-comparison").textContent = percentageChange(state.period.interactions, state.period.previousInteractions);
  app.querySelector("#period-views-previous").textContent = state.period.previousPageViews === null
    ? "No comparison period"
    : `${state.period.previousPageViews.toLocaleString()} in the previous period`;
  app.querySelector("#period-interactions-previous").textContent = state.period.previousInteractions === null
    ? "No comparison period"
    : `${state.period.previousInteractions.toLocaleString()} in the previous period`;
}

async function loadRows(eventType, start) {
  const events = [];
  for (let offset = 0; offset < maxRows; offset += 1000) {
    let query = state.db.from("site_analytics")
      .select("id,page_path,device_type,region,referrer,created_at")
      .eq("event_type", eventType)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, Math.min(offset + 999, maxRows - 1));
    if (start) query = query.gte("created_at", start);
    const { data, error } = await query;
    if (error) throw new Error(`Could not load ${eventType.replace("_", " ")} events: ${error.message}`);
    events.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return events;
}

async function countEvents(eventType, start, end) {
  let query = state.db.from("site_analytics")
    .select("id", { count: "exact", head: true })
    .eq("event_type", eventType);
  if (start) query = query.gte("created_at", start);
  if (end) query = query.lt("created_at", end);
  const { count, error } = await query;
  if (error) throw new Error(`Could not count ${eventType.replace("_", " ")} events: ${error.message}`);
  return count || 0;
}

async function loadEvents() {
  const range = app.querySelector("#traffic-range").value;
  const bounds = rangeBounds(range);
  const previousCounts = bounds.previousStart
    ? Promise.all([
      countEvents("page_view", bounds.previousStart, bounds.previousEnd),
      countEvents("content_engagement", bounds.previousStart, bounds.previousEnd),
    ])
    : Promise.resolve([null, null]);
  const [events, contentEvents, periodCounts, previous, updatesResult] = await Promise.all([
    loadRows("page_view", bounds.start),
    loadRows("content_engagement", bounds.start),
    Promise.all([countEvents("page_view", bounds.start), countEvents("content_engagement", bounds.start)]),
    previousCounts,
    state.db.from("site_updates").select("id,title").eq("published", true).limit(500),
  ]);
  if (updatesResult.error) throw new Error(`Could not load update titles: ${updatesResult.error.message}`);
  state.events = events;
  state.contentEvents = contentEvents;
  state.contentTitles = new Map((updatesResult.data || []).map((update) => [String(update.id), update.title || "Update"]));
  state.period = {
    pageViews: periodCounts[0],
    interactions: periodCounts[1],
    previousPageViews: previous[0],
    previousInteractions: previous[1],
  };
  if (range === "all") state.allTimeCount = periodCounts[0];
  state.page = 1;
  populateFilterOptions();
  updateResults();
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

async function exportCsv() {
  const rows = filteredEvents();
  if (!rows.length) {
    await alertDialog("There are no matching traffic events to export.", { title: "Nothing to export" });
    return;
  }
  const header = ["Time", "Page", "Device", "Region", "Referrer"];
  const lines = [header, ...rows.map((event) => [event.created_at, event.page_path || "Unknown", event.device_type || "Unknown", event.region || "Unknown", event.referrer || "Direct"])]
    .map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${lines}`], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `sprk-traffic-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function start() {
  const context = await requireAdmin(app, "../../account/");
  if (!context) return;
  state.db = context.db;
  const { count, error } = await state.db.from("site_analytics")
    .select("id", { count: "exact", head: true })
    .eq("event_type", "page_view");
  if (error) {
    showAdminError(app, `Could not load traffic totals: ${error.message}`, "../../account/");
    return;
  }
  state.allTimeCount = count || 0;
  renderPage(context.user.email);
  await loadEvents();
}

start().catch((error) => showAdminError(app, error.message, "../../account/"));
