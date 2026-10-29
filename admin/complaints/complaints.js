import { escapeHtml, formatDate, renderAdminNavigation, requireAdmin, showAdminError } from "../admin-common.js";

const app = document.querySelector("#admin-app");
let context;
let complaints = [];
let selectedComplaintId;

function render() {
  app.innerHTML = `<section class="admin-page space-y-6">
    ${renderAdminNavigation("complaints", context.user.email)}
    <h1 class="sr-only">Complaints</h1>
    <div class="admin-page-actions">
      <button id="complaints-refresh" class="admin-refresh" type="button">Refresh inbox</button>
    </div>
    <div id="complaints-feedback" role="status" hidden></div>
    <section class="support-layout">
      <article class="support-card"><h2>Inbox (${complaints.length})</h2><div id="admin-complaint-list" class="support-ticket-list">${complaints.length ? complaints.map((item) => `<button class="support-ticket-button" type="button" data-complaint="${escapeHtml(item.id)}" aria-current="${item.id === selectedComplaintId}"><strong>${escapeHtml(item.subject)}</strong><small>${escapeHtml(item.category)} · ${escapeHtml(item.status.replaceAll("_", " "))} · ${escapeHtml(formatDate(item.created_at))}</small><small>User: ${escapeHtml(item.user_id)}</small></button>`).join("") : "<p>No complaints have been submitted.</p>"}</div></article>
      <article id="admin-complaint-thread" class="support-card"><p>Select a complaint to review and reply.</p></article>
    </section>
  </section>`;
  window.lucide?.createIcons();
  app.querySelector("#complaints-refresh").addEventListener("click", () => loadComplaints().catch(showLoadError));
  app.querySelector("#admin-complaint-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-complaint]");
    if (button) selectComplaint(button.dataset.complaint).catch(showLoadError);
  });
  app.querySelector("#admin-complaint-thread").addEventListener("submit", sendReply);
  app.querySelector("#admin-complaint-thread").addEventListener("click", updateStatus);
}

function showFeedback(message, isError = false) {
  const element = app.querySelector("#complaints-feedback");
  if (!element) return;
  element.textContent = message;
  element.hidden = false;
  element.className = isError ? "simulator-notice error" : "simulator-notice success";
}

function showLoadError(error) {
  showAdminError(app, `Could not load complaints: ${error.message}`);
}

async function loadComplaints() {
  const { data, error } = await context.db
    .from("complaints")
    .select("id,user_id,simulation_id,subject,category,body,status,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  complaints = data || [];
  if (!complaints.some((item) => item.id === selectedComplaintId)) selectedComplaintId = complaints[0]?.id;
  render();
  if (selectedComplaintId) await selectComplaint(selectedComplaintId);
}

async function selectComplaint(id) {
  const complaint = complaints.find((item) => item.id === id);
  if (!complaint) return;
  selectedComplaintId = id;
  render();
  const { data: messages, error } = await context.db
    .from("admin_private_messages")
    .select("id,sender_id,body,created_at")
    .eq("complaint_id", id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const thread = app.querySelector("#admin-complaint-thread");
  thread.innerHTML = `<p class="admin-eyebrow">${escapeHtml(complaint.category)} · ${escapeHtml(complaint.status.replaceAll("_", " "))}</p>
    <h2>${escapeHtml(complaint.subject)}</h2>
    <p>User ID: ${escapeHtml(complaint.user_id)}${complaint.simulation_id ? ` · Simulation ID: ${escapeHtml(complaint.simulation_id)}` : ""}</p>
    <article class="support-thread-message"><header><strong>Initial complaint</strong><time>${escapeHtml(formatDate(complaint.created_at))}</time></header><p>${escapeHtml(complaint.body)}</p></article>
    ${(messages || []).map((message) => `<article class="support-thread-message"><header><strong>${message.sender_id === context.user.id ? "Admin" : "User"}</strong><time datetime="${escapeHtml(message.created_at)}">${escapeHtml(formatDate(message.created_at))}</time></header><p>${escapeHtml(message.body)}</p></article>`).join("")}
    <form class="support-thread-form"><label for="admin-reply">Private reply<textarea id="admin-reply" name="body" maxlength="4000" required rows="4"></textarea></label><button class="admin-action" type="submit">Send private reply</button></form>
    <div class="admin-issue-actions"><button class="admin-action" type="button" data-next-status="${complaint.status === "resolved" ? "open" : "resolved"}">${complaint.status === "resolved" ? "Reopen complaint" : "Mark resolved"}</button><button class="admin-action" type="button" data-next-status="closed">Close complaint</button></div>`;
}

async function sendReply(event) {
  const form = event.target.closest(".support-thread-form");
  if (!form) return;
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const { error } = await context.db.rpc("send_complaint_message", {
      target_complaint_id: selectedComplaintId,
      message_body: form.elements.body.value.trim(),
    });
    if (error) throw error;
    await selectComplaint(selectedComplaintId);
    showFeedback("Private reply sent to the user.");
  } catch (error) {
    showFeedback(`Could not send reply: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

async function updateStatus(event) {
  const button = event.target.closest("[data-next-status]");
  if (!button) return;
  button.disabled = true;
  try {
    const { error } = await context.db.from("complaints").update({
      status: button.dataset.nextStatus,
      updated_at: new Date().toISOString(),
    }).eq("id", selectedComplaintId);
    if (error) throw error;
    await loadComplaints();
    showFeedback(`Complaint marked ${button.dataset.nextStatus.replaceAll("_", " ")}.`);
  } catch (error) {
    showFeedback(`Could not update complaint: ${error.message}`, true);
    button.disabled = false;
  }
}

async function initialize() {
  context = await requireAdmin(app);
  if (context) await loadComplaints();
}

initialize().catch(showLoadError);
