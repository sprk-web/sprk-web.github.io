import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../js/config.js";
import { getAppDataSupabaseClient, isAppDataConfigured } from "../js/appDataSupabaseClient.js";
import { getPrimarySupabaseClient } from "../js/supabaseClient.js";

const app = document.querySelector("#support-app");
const params = new URLSearchParams(location.search);
const requestedSimulation = params.get("simulation") || "";
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]));

let db;
let appDataDb = null;
let currentUser;
let isAdmin = false;
let complaints = [];
let selectedComplaintId = params.get("complaint");

function showNotice(message, isError = false) {
  const notice = document.querySelector("#support-message");
  if (!notice) return;
  notice.textContent = message;
  notice.className = isError ? "simulator-notice error" : "simulator-notice success";
  notice.hidden = false;
}

function render() {
  app.innerHTML = `${isAdmin ? `<section class="support-admin-tools">
      <header class="support-admin-heading"><div><p class="admin-eyebrow">ADMIN SUPPORT</p><h1>Support desk</h1><p>Manage user requests or contact support about your own account.</p></div></header>
      <nav class="support-admin-links" aria-label="Admin support tools">
        <a class="support-admin-link" href="../admin/complaints/"><strong>Complaints inbox</strong><span>Review and reply to user support threads</span></a>
        <a class="support-admin-link" href="../admin/issues/"><strong>Moderation queue</strong><span>Review reported simulations and appeals</span></a>
      </nav>
    </section>
    <section class="support-card support-admin-inbox">
      <header><p class="admin-eyebrow">ADMIN INBOX</p><h2>Private messages for you</h2><p>Messages sent directly to your admin account.</p></header>
      <div id="admin-inbox" class="support-thread" aria-live="polite"><p>Loading messages…</p></div>
    </section>` : ""}
    <div id="moderation-notices"></div><section class="support-layout">
    <article class="support-card">
      <header><p class="admin-eyebrow">${isAdmin ? "CONTACT SPRK SUPPORT" : "SPRK SUPPORT"}</p>${isAdmin ? "<h2>Contact support</h2>" : "<h1>How can we help?</h1>"}<p>Send a private complaint, ask for support, or contest a simulation moderation decision.</p></header>
      <div id="support-message" role="status" hidden></div>
      <form id="complaint-form" class="support-form">
        <label for="complaint-subject">Subject<input id="complaint-subject" name="subject" required minlength="3" maxlength="160" placeholder="Briefly describe your concern"></label>
        <label for="complaint-category">Topic<select id="complaint-category" name="category"><option value="general">General support</option><option value="simulation">Simulation feedback</option><option value="safety">Safety concern</option><option value="contest">Contest a moderation decision</option><option value="account">Account</option><option value="other">Other</option></select></label>
        <label for="complaint-simulation">Simulation link or ID (optional)<input id="complaint-simulation" name="simulation" maxlength="500" placeholder="Paste the simulation URL or ID"></label>
        <label for="complaint-body">Details<textarea id="complaint-body" name="body" required minlength="1" maxlength="4000" rows="6" placeholder="Tell us what happened and what outcome you are looking for."></textarea></label>
        <button class="simulator-link-primary" type="submit">Send private complaint</button>
      </form>
    </article>
    <article class="support-card">
      <header><p class="admin-eyebrow">PRIVATE INBOX</p><h2>Your support threads</h2><p>Only you and authorized SPRK administrators can read these messages.</p></header>
      <div id="complaint-list" class="support-ticket-list" aria-live="polite"></div>
      <div id="complaint-thread" class="support-thread"><p>Select a thread to read updates.</p></div>
    </article>
  </section>`;
  const simulationInput = app.querySelector("#complaint-simulation");
  if (requestedSimulation && !requestedSimulation.startsWith("demo-")) simulationInput.value = requestedSimulation;
  if (!currentUser) {
    app.querySelector("#complaint-form").innerHTML = `<p>Sign in to contact support and view your private complaint threads.</p><a class="simulator-link-primary" href="../account/?return=${encodeURIComponent("/support/") }">Sign in to continue</a>`;
    app.querySelector("#complaint-list").innerHTML = "<p>Your submitted complaints will appear here after you sign in.</p>";
    return;
  }
  app.querySelector("#complaint-form").addEventListener("submit", submitComplaint);
  app.querySelector("#complaint-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-complaint]");
    if (button) selectComplaint(button.dataset.complaint).catch((error) => showNotice(error.message, true));
  });
  app.querySelector("#complaint-thread").addEventListener("submit", sendReply);
  renderComplaintList();
  if (selectedComplaintId && complaints.some((item) => item.id === selectedComplaintId)) {
    selectComplaint(selectedComplaintId).catch((error) => showNotice(error.message, true));
  }
}

function renderComplaintList() {
  const list = app.querySelector("#complaint-list");
  list.innerHTML = complaints.length
    ? complaints.map((complaint) => `<button class="support-ticket-button" type="button" data-complaint="${escapeHtml(complaint.id)}" aria-current="${complaint.id === selectedComplaintId}"><strong>${escapeHtml(complaint.subject)}</strong><small>${escapeHtml(complaint.category)} · ${escapeHtml(complaint.status.replaceAll("_", " "))} · ${escapeHtml(new Date(complaint.created_at).toLocaleDateString())}</small></button>`).join("")
    : "<p>No support threads yet.</p>";
}

async function loadThread(complaint) {
  const { data: messages, error } = await db
    .from("admin_private_messages")
    .select("id,sender_id,body,created_at")
    .eq("complaint_id", complaint.id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const thread = app.querySelector("#complaint-thread");
  thread.innerHTML = `<h2>${escapeHtml(complaint.subject)}</h2>
    <article class="support-thread-message"><header><strong>You · initial complaint</strong><time>${escapeHtml(new Date(complaint.created_at).toLocaleString())}</time></header><p>${escapeHtml(complaint.body)}</p></article>
    ${(messages || []).map((message) => `<article class="support-thread-message"><header><strong>${message.sender_id === currentUser.id ? "You" : "SPRK Support"}</strong><time datetime="${escapeHtml(message.created_at)}">${escapeHtml(new Date(message.created_at).toLocaleString())}</time></header><p>${escapeHtml(message.body)}</p></article>`).join("")}
    <form class="support-thread-form"><label for="thread-reply">Reply privately<textarea id="thread-reply" name="body" required maxlength="4000" rows="3"></textarea></label><button class="simulator-link-primary" type="submit">Send reply</button></form>`;
}

async function selectComplaint(id) {
  const complaint = complaints.find((item) => item.id === id);
  if (!complaint) return;
  selectedComplaintId = id;
  renderComplaintList();
  await loadThread(complaint);
}

async function submitComplaint(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const rawSimulation = form.elements.simulation.value.trim();
    const simulationId = rawSimulation.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)?.[0] || null;
    const { data, error } = await db.rpc("submit_complaint", {
      complaint_subject: form.elements.subject.value.trim(),
      complaint_category: form.elements.category.value,
      complaint_body: form.elements.body.value.trim(),
      target_simulation_id: simulationId,
    });
    if (error) throw error;
    form.reset();
    showNotice("Your complaint was sent privately to the support team.");
    await loadComplaints();
    await selectComplaint(data);
  } catch (error) {
    console.error("Could not submit support complaint.", error);
    showNotice(`Your complaint could not be submitted: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

async function sendReply(event) {
  const form = event.target.closest(".support-thread-form");
  if (!form) return;
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const { error } = await db.rpc("send_complaint_message", {
      target_complaint_id: selectedComplaintId,
      message_body: form.elements.body.value.trim(),
    });
    if (error) throw error;
    await loadThread(complaints.find((item) => item.id === selectedComplaintId));
    showNotice("Your private reply was sent.");
  } catch (error) {
    console.error("Could not send complaint reply.", error);
    showNotice(`Your reply could not be sent: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

async function loadComplaints() {
  const { data, error } = await db
    .from("complaints")
    .select("id,subject,category,body,status,created_at,simulation_id")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  complaints = data || [];
  renderComplaintList();
}

async function loadModerationNotices() {
  const [issueResult, complaintMessageResult] = await Promise.all([
    appDataDb
      ? appDataDb.from("issue_messages")
        .select("id,issue_id,body,created_at,read_at")
        .eq("recipient_id", currentUser.id)
        .order("created_at", { ascending: false })
        .limit(50)
      : Promise.resolve({ data: [], error: null }),
    db
      .from("admin_private_messages")
      .select("id,complaint_id,sender_id,body,created_at")
      .eq("recipient_id", currentUser.id)
      .neq("sender_id", currentUser.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (issueResult.error) throw issueResult.error;
  if (complaintMessageResult.error) throw complaintMessageResult.error;
  const container = app.querySelector("#moderation-notices");
  if (!container) return;
  const messages = [
    ...(issueResult.data || []).map((message) => ({ ...message, source: "Simulation moderation" })),
    ...(complaintMessageResult.data || []).map((message) => ({ ...message, source: "SPRK Support" })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  container.innerHTML = messages.length
    ? `<section class="support-card" style="margin-bottom:20px"><h2>Private messages from SPRK</h2>${messages.map((message) => `<article class="support-thread-message"><header><strong>${message.source}</strong><time datetime="${escapeHtml(message.created_at)}">${escapeHtml(new Date(message.created_at).toLocaleString())}</time></header><p>${escapeHtml(message.body)}</p></article>`).join("")}</section>`
    : "";
}

async function loadAdminInbox() {
  const [issueResult, complaintMessageResult] = await Promise.all([
    appDataDb
      ? appDataDb.from("issue_messages")
        .select("id,issue_id,body,created_at")
        .eq("recipient_id", currentUser.id)
        .neq("sender_id", currentUser.id)
        .order("created_at", { ascending: false })
        .limit(50)
      : Promise.resolve({ data: [], error: null }),
    db
      .from("admin_private_messages")
      .select("id,complaint_id,body,created_at")
      .eq("recipient_id", currentUser.id)
      .neq("sender_id", currentUser.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (issueResult.error) throw issueResult.error;
  if (complaintMessageResult.error) throw complaintMessageResult.error;
  const inbox = app.querySelector("#admin-inbox");
  const messages = [
    ...(issueResult.data || []).map((message) => ({ ...message, source: "Simulation moderation" })),
    ...(complaintMessageResult.data || []).map((message) => ({ ...message, source: "Private admin message" })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  inbox.innerHTML = messages.length
    ? messages.map((message) => `<article class="support-thread-message"><header><strong>${message.source}</strong><time datetime="${escapeHtml(message.created_at)}">${escapeHtml(new Date(message.created_at).toLocaleString())}</time></header><p>${escapeHtml(message.body)}</p></article>`).join("")
    : "<p>No private messages from other admins.</p>";
}

async function initialize() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase?.createClient) {
    app.innerHTML = `<article class="support-card"><h1>Support is unavailable</h1><p>SPRK account service is not configured.</p></article>`;
    return;
  }
  db = getPrimarySupabaseClient();
  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  currentUser = data.session?.user || null;
  appDataDb = isAppDataConfigured() && data.session ? getAppDataSupabaseClient(data.session) : null;
  if (currentUser) {
    const { data: adminResult, error: adminError } = await db.rpc("is_sprk_admin");
    if (adminError) throw adminError;
    isAdmin = Boolean(adminResult);
  }
  render();
  if (currentUser) {
    if (isAdmin) await loadAdminInbox();
    await loadComplaints();
    if (!isAdmin) await loadModerationNotices();
    if (selectedComplaintId && complaints.some((item) => item.id === selectedComplaintId)) {
      await selectComplaint(selectedComplaintId);
    }
  }
}

initialize().catch((error) => {
  console.error("Could not initialize support page.", error);
  app.innerHTML = `<article class="support-card"><h1>Support could not load</h1><p>${escapeHtml(error.message)}</p></article>`;
});
