import { escapeHtml, formatDate, renderAdminNavigation, requireAdmin, showAdminError } from "../admin-common.js";

const app = document.querySelector("#admin-app");
let context;

function renderIssues(issues, reportsBySimulation) {
  const rows = issues.map((issue) => {
    const simulation = issue.simulations || {};
    const reports = reportsBySimulation.get(issue.simulation_id) || [];
    return `<article class="theme-card admin-panel">
      <div class="admin-panel-heading">
        <span class="admin-panel-icon"><i data-lucide="shield-alert" class="h-5 w-5"></i></span>
        <div><h2>${escapeHtml(simulation.title || issue.title)}</h2><p>${escapeHtml(issue.issue_type)} · Created ${escapeHtml(formatDate(issue.created_at))}</p></div>
        <span class="admin-status">${escapeHtml(issue.status.replaceAll("_", " "))}</span>
      </div>
      <p>${escapeHtml(issue.summary)}</p>
      <div class="admin-metrics" style="grid-template-columns:repeat(3,minmax(0,1fr));margin:16px 0">
        <article class="admin-metric-card"><p>Report rate</p><strong>${(Number(issue.report_rate) * 100).toFixed(1)}%</strong><span>Trigger threshold: &gt; 33%</span></article>
        <article class="admin-metric-card"><p>Unique reports</p><strong>${Number(issue.report_count).toLocaleString()}</strong><span>of ${Number(issue.viewer_count).toLocaleString()} unique viewers</span></article>
        <article class="admin-metric-card"><p>Simulation status</p><strong style="font-size:1.15rem">${escapeHtml(simulation.status || "Unavailable")}</strong><span>Author ID: ${escapeHtml(issue.owner_user_id || "Unavailable")}</span></article>
      </div>
      <details class="admin-report-timestamps"><summary>Report timestamps (${reports.length})</summary>
        ${reports.length ? `<ol>${reports.map((report) => `<li><time datetime="${escapeHtml(report.created_at)}">${escapeHtml(formatDate(report.created_at))}</time> · ${escapeHtml(report.reason)}${report.details ? ` — ${escapeHtml(report.details)}` : ""}</li>`).join("")}</ol>` : "<p>No report details were returned.</p>"}
      </details>
      <div class="admin-issue-actions">
        <button type="button" class="admin-action" data-status="resolved" data-issue="${escapeHtml(issue.id)}">Mark resolved</button>
        <button type="button" class="admin-action" data-status="dismissed" data-issue="${escapeHtml(issue.id)}">Dismiss issue</button>
        ${issue.simulation_id && simulation.status !== "hidden" ? `<button type="button" class="admin-action" data-hide="${escapeHtml(issue.id)}">Hide / takedown simulation</button>` : ""}
        ${issue.owner_user_id ? `<details><summary class="admin-action">Send private warning / message</summary><form class="admin-message-form" data-message-form="${escapeHtml(issue.id)}"><label for="issue-message-${escapeHtml(issue.id)}">Private message to author</label><textarea id="issue-message-${escapeHtml(issue.id)}" name="body" maxlength="4000" required rows="3"></textarea><button type="submit" class="admin-action">Send message</button></form></details>` : ""}
      </div>
    </article>`;
  });
  app.innerHTML = `<section class="admin-page space-y-6">
    <h1 class="sr-only">Simulation issues</h1>
    ${renderAdminNavigation("issues", context.user.email)}
    <div class="admin-page-actions">
      <button id="issues-refresh" class="admin-refresh" type="button"><i data-lucide="refresh-cw" class="h-4 w-4"></i>Refresh</button>
    </div>
    <div id="issues-feedback" role="status" hidden></div>
    <div class="admin-issue-list">${rows.join("") || '<section class="theme-card admin-panel"><h2>No flagged simulations</h2><p>New issues appear here when the unique report rate exceeds 33% of unique viewers.</p></section>'}</div>
  </section>`;
  window.lucide?.createIcons();
  app.querySelector("#issues-refresh").addEventListener("click", () => loadIssues().catch(showLoadError));
  app.querySelector(".admin-issue-list").addEventListener("click", handleIssueAction);
  app.querySelector(".admin-issue-list").addEventListener("submit", handleMessageSubmit);
}

function showFeedback(message, isError = false) {
  const element = app.querySelector("#issues-feedback");
  if (!element) return;
  element.textContent = message;
  element.hidden = false;
  element.className = isError ? "simulator-notice error" : "simulator-notice success";
}

function showLoadError(error) {
  showAdminError(app, `Could not load simulation issues: ${error.message}`);
}

async function loadIssues() {
  const [issueResult] = await Promise.all([
    context.db.from("issues").select("id,issue_type,simulation_id,owner_user_id,title,summary,report_count,viewer_count,report_rate,status,created_at,simulations(title,status)").not("simulation_id", "is", null).order("created_at", { ascending: false }).limit(100),
  ]);
  if (issueResult.error) throw issueResult.error;
  const simulationIds = [...new Set((issueResult.data || []).map((issue) => issue.simulation_id).filter(Boolean))];
  const reportResult = simulationIds.length
    ? await context.db.from("simulation_reports").select("simulation_id,reason,details,created_at").in("simulation_id", simulationIds).order("created_at", { ascending: false }).limit(500)
    : { data: [], error: null };
  if (reportResult.error) throw reportResult.error;
  const reportsBySimulation = new Map();
  for (const report of reportResult.data || []) {
    const existing = reportsBySimulation.get(report.simulation_id) || [];
    existing.push(report);
    reportsBySimulation.set(report.simulation_id, existing);
  }
  renderIssues(issueResult.data || [], reportsBySimulation);
}

async function handleIssueAction(event) {
  const statusButton = event.target.closest("[data-status]");
  const hideButton = event.target.closest("[data-hide]");
  if (!statusButton && !hideButton) return;
  const button = statusButton || hideButton;
  button.disabled = true;
  try {
    const result = statusButton
      ? await context.db.rpc("admin_set_issue_status", { target_issue_id: statusButton.dataset.issue, next_status: statusButton.dataset.status })
      : await context.db.rpc("admin_hide_simulation", { target_issue_id: hideButton.dataset.hide });
    if (result.error) throw result.error;
    await loadIssues();
    showFeedback(statusButton ? `Issue marked ${statusButton.dataset.status}.` : "Simulation hidden and issue moved to review.");
  } catch (error) {
    showFeedback(`Moderation action failed: ${error.message}`, true);
    if (button.isConnected) button.disabled = false;
  }
}

async function handleMessageSubmit(event) {
  const form = event.target.closest("[data-message-form]");
  if (!form) return;
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const { error } = await context.db.rpc("admin_reply_to_issue", {
      target_issue_id: form.dataset.messageForm,
      message_body: form.elements.body.value.trim(),
    });
    if (error) throw error;
    form.reset();
    showFeedback("Private message sent to the simulation author.");
  } catch (error) {
    showFeedback(`Message could not be sent: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

async function initialize() {
  context = await requireAdmin(app);
  if (context) await loadIssues();
}

initialize().catch(showLoadError);
