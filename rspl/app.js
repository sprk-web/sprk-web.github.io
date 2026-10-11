import { isRememberSessionEnabled, setRememberSessionEnabled, supabase } from './supabase-client.js';

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const state = { user:null, profile:null, page:'overview', projects:[], workers:[], attendance:[], ledger:[], assignments:[], attendanceWorkerFilter:'', overviewProjectSearch:'', siteProjectId:'' };
let pendingConfirmation = null;
const splashStartedAt = Date.now();
const money = n => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(Number(n||0));
const dateISO = () => {
  const date=new Date();
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
};
const niceDate = d => d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initials = s => (s||'RS').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
const status = s => `<span class="status ${esc(String(s||'neutral').toLowerCase())}">${esc(titleCase(String(s||'—').replaceAll('_',' ')))}</span>`;
const isChair = () => state.profile?.role === 'chairman';
const isAdmin = () => ['chairman','admin'].includes(state.profile?.role);
let noticeTimeout;
const notify = (msg, bad=false) => { const n=$('#notice'); n.textContent=msg; n.classList.remove('hidden'); n.style.background=bad?'#fef2f2':'#eff6ff'; n.style.color=bad?'#b91c1c':'#1d4ed8'; clearTimeout(noticeTimeout); noticeTimeout=setTimeout(()=>n.classList.add('hidden'),4500); };
const icon = name => `<i data-lucide="${name}"></i>`;
const refreshIcons = () => window.lucide?.createIcons();
function setSidebarOpen(open) {
  const desktop=window.matchMedia('(min-width: 1024px)').matches;
  const app=$('#appView'), sidebar=$('#sidebar');
  sidebar.classList.toggle('open',open && !desktop);
  app.classList.toggle('sidebar-collapsed',!open && desktop);
  sidebar.toggleAttribute('inert',!open);
  sidebar.setAttribute('aria-hidden',String(!open));
  $('#sidebarBackdrop').classList.toggle('hidden',desktop || !open);
  $('#mobileMenu').setAttribute('aria-expanded',String(open));
  $('#mobileMenu').setAttribute('aria-label',open?'Close navigation':'Open navigation');
  $('#sidebarToggle').setAttribute('aria-expanded',String(open));
  $('#sidebarToggle').setAttribute('aria-label',open?'Close sidebar':'Open sidebar');
  $('#sidebarToggle').title=open?'Close sidebar':'Open sidebar';
  if (!open && !app.classList.contains('hidden')) (desktop ? $('#sidebarToggle') : $('#mobileMenu')).focus();
}
function toggleSidebar() {
  const desktop=window.matchMedia('(min-width: 1024px)').matches;
  const open=desktop ? !$('#appView').classList.contains('sidebar-collapsed') : $('#sidebar').classList.contains('open');
  setSidebarOpen(!open);
}

$('#year').textContent = new Date().getFullYear();
$('#rememberMe').checked = isRememberSessionEnabled();

async function boot() {
  try {
    const {data:{session},error} = await supabase.auth.getSession();
    if (error) throw error;
    if (session) await enterApp(session.user);
    else showLogin();
  } catch (error) {
    console.error('Could not restore the Supabase session:', error);
    showLogin(`Could not restore your session: ${error.message || 'Check your Supabase connection and configuration.'}`);
  } finally {
    const remainingSplashTime = Math.max(0, 2000 - (Date.now() - splashStartedAt));
    await new Promise(resolve => setTimeout(resolve, remainingSplashTime));
    $('#splashView').classList.add('hidden');
  }
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session && !state.user) setTimeout(()=>{
      enterApp(session.user).catch(error=>{
        console.error('Could not open the workspace after sign in:', error);
        showLogin(`Signed in, but could not open the workspace: ${error.message || 'Please try again.'}`);
      });
    },0);
    if (!session) showLogin();
  });
}
function showLogin(message='') {
  $('#loginView').classList.remove('hidden');
  $('#appView').classList.add('hidden');
  $('#loginError').textContent=message;
  state.user=null; state.profile=null;
  const button=$('#loginForm button[type="submit"]');
  button.disabled=false;
  button.innerHTML='<span>Sign in securely</span><i data-lucide="arrow-up-right"></i>';
  refreshIcons();
}
async function enterApp(user) {
  state.user=user;
  const {data:profile,error} = await supabase.from('profiles').select('*').eq('id',user.id).maybeSingle();
  if (error) {
    console.error('Could not load the signed-in user profile:', error);
    showLogin(`Signed in, but the workspace profile could not be loaded: ${error.message}. Check the profiles table and its row-level security policies.`);
    return;
  }
  if (!profile) {
    showLogin('Your sign-in succeeded, but this account has no workspace profile. Ask the workspace administrator to create a row for this Auth user in public.profiles.');
    return;
  }
  state.profile=profile;
  $('#loginView').classList.add('hidden'); $('#appView').classList.remove('hidden');
  setSidebarOpen(window.matchMedia('(min-width: 1024px)').matches);
  updateProfileSummary();
  // Workers only see their self-service portal.
  if (profile.role==='worker') { $$('#nav [data-page]').forEach(b=>b.classList.toggle('hidden',b.dataset.page!=='overview')); }
  else { $$('#nav [data-page]').forEach(b=>b.classList.remove('hidden')); }
  await loadData(); render();
}
function updateProfileSummary() {
  const name=state.profile?.full_name || state.user?.email || 'Workspace user';
  const role=titleCase(state.profile?.role || 'worker');
  $('#userName').textContent=name;
  $('#userRole').textContent=role;
  $('#userInitials').textContent=initials(name);
  $('#sidebarUserName').textContent=name;
  $('#sidebarUserRole').textContent=`${role} · Profile & settings`;
  $('#sidebarInitials').textContent=initials(name);
}
async function loadData() {
  const tasks = [
    ['projects',()=>supabase.from('projects').select('*').order('created_at',{ascending:false})],
    ['workers',()=>supabase.from('workers').select('*, site_assignments(project_id, assigned_at, unassigned_at, projects(name))').order('created_at',{ascending:false})],
    ['attendance',()=>supabase.from('attendance').select('*, workers(full_name, daily_wage_rate), projects(name)').order('work_date',{ascending:false}).limit(300)],
    ['ledger',()=>supabase.from('payments_ledger').select('*, workers(full_name), projects(name)').order('transaction_date',{ascending:false}).limit(300)],
    ['assignments',()=>supabase.from('site_assignments').select('*, workers(full_name), projects(name)')]
  ];
  await Promise.all(tasks.map(async ([key,fn])=>{ const {data,error}=await fn(); if(error) throw error; state[key]=data||[]; }));
}
function titleCase(s){return s.charAt(0).toUpperCase()+s.slice(1)}
const paymentType = type => ({advance:'Advance paid',wage:'Wage payment',adjustment:'Adjustment'}[type]||titleCase(type||'wage'));
function setPage(page) { state.page=page; $$('#nav [data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===(page==='site'?'overview':page))); $('#pageTitle').textContent=page==='site'?(state.projects.find(project=>project.id===state.siteProjectId)?.name||'Project site'):({overview:'Overview',workers:'Workers',attendance:'Attendance',payroll:'Wages & advances',projects:'Projects & sites'})[page]; render(); }
function statCard(label,value,sub,ico) { return `<div class="card stat-card"><div class="flex items-start justify-between"><div class="stat-label">${label}</div><div class="stat-icon">${icon(ico)}</div></div><div class="stat-value mt-4">${value}</div><div class="text-[11px] text-slate-500 mt-2">${sub}</div></div>`; }
function sectionHead(title,sub,action='') { return `<div class="flex flex-wrap items-end justify-between gap-4 mb-5"><div><h2 class="font-bold text-lg tracking-tight">${title}</h2><p class="text-xs text-slate-500 mt-1">${sub}</p></div>${action}</div>`; }
function empty(msg) { return `<div class="empty">${icon('inbox')}<div class="font-semibold text-slate-700">${msg}</div><div class="mt-1 text-xs">Records will appear here once added.</div></div>`; }
function table(headers, rows, className='') { return `<div class="table-wrap"><table class="data-table ${className}"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows||''}</tbody></table></div>`; }
function rowActions(id, editAction, deleteAction) {
  return `<div class="row-actions"><button class="icon-button" data-action="${editAction}" data-id="${esc(id)}" aria-label="Edit record" title="Edit">${icon('pencil')}</button><button class="icon-button danger-button" data-action="${deleteAction}" data-id="${esc(id)}" aria-label="Delete record" title="Delete">${icon('trash-2')}</button></div>`;
}
function render() {
  const content=$('#pageContent');
  if (state.profile?.role==='worker') { content.innerHTML=workerPortal(); refreshIcons(); return; }
  if(state.page==='site') $('#pageTitle').textContent=state.projects.find(project=>project.id===state.siteProjectId)?.name||'Project site';
  const renderers={overview:overviewPage,site:projectSitePage,workers:workersPage,attendance:attendancePage,payroll:payrollPage,projects:projectsPage};
  content.innerHTML=(renderers[state.page]||overviewPage)(); refreshIcons();
}
function overviewPage() {
  const active=state.workers.filter(w=>w.status!=='inactive').length;
  const present=state.attendance.filter(a=>a.work_date===dateISO() && ['present','overtime'].includes(a.status)).length;
  const pending=state.ledger.filter(x=>x.entry_type==='wage' && x.status==='pending').reduce((s,x)=>s+Number(x.amount||0),0);
  const advances=state.ledger.filter(x=>x.entry_type==='advance').reduce((s,x)=>s+Number(x.amount||0),0);
  const canManage=isAdmin();
  return `<div class="flex flex-wrap items-center justify-between gap-3 mb-6"><div><div class="eyebrow">OPERATIONS SNAPSHOT</div><p class="text-sm text-slate-500 mt-1">A live overview of your workforce and site costs.</p></div><div class="flex gap-2"><button class="btn-secondary" data-action="refresh">${icon('refresh-cw')} Refresh data</button>${canManage?'<button class="btn-amber" data-action="add-worker">+ Register worker</button>':''}</div></div>
  <div class="overview-stats-grid stats-grid grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">${statCard('Registered workers',active,`${state.projects.length} active/recorded sites`,'users')}${statCard("Today's attendance",present,`of ${active} active workers`,'calendar-check')}${statCard('Wages to pay',money(pending),'Pending wage payments','wallet')}${statCard('Advances paid',money(advances),'All recorded worker advances','hand-coins')}</div>
  <div class="card p-5 mt-6">${overviewProjects()}</div>
  <div class="card p-5 mt-5">${sectionHead('Quick actions','Common workforce tasks')}<div class="grid md:grid-cols-2 xl:grid-cols-4 gap-3">${canManage?`<button class="quick-action" data-action="add-worker">${icon('user-plus')}<span><b>Register a worker</b><small>Create a worker profile and daily wage rate</small></span>${icon('chevron-right')}</button><button class="quick-action" data-action="mark-attendance">${icon('clipboard-check')}<span><b>Mark attendance</b><small>Record a daily shift at a site</small></span>${icon('chevron-right')}</button><button class="quick-action" data-action="add-payment">${icon('receipt')}<span><b>Record wage / advance</b><small>Update the worker's payment record</small></span>${icon('chevron-right')}</button>`:''}<button class="quick-action" data-page="workers">${icon('users')}<span><b>View worker directory</b><small>Find profiles and site assignments</small></span>${icon('chevron-right')}</button></div></div>`;
}
function overviewProjects() {
  return `${sectionHead('Projects','Search and select a project to view its assigned workers and mark attendance.')}
    <label class="field-label block mb-4" for="overviewProjectSearch">Search projects<input id="overviewProjectSearch" class="field" type="search" value="${esc(state.overviewProjectSearch)}" placeholder="Search by project, location, code or status" autocomplete="off"></label>
    <div id="overviewProjectResults" class="project-results-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">${overviewProjectResultsHtml()}</div>`;
}
function overviewProjectResultsHtml() {
  const query=state.overviewProjectSearch.trim().toLowerCase();
  const projects=state.projects.filter(item=>[item.name,item.project_code,item.location,item.status].some(value=>String(value||'').toLowerCase().includes(query)));
  const cards=projects.map(item=>{
    const assigned=new Set(state.assignments.filter(assignment=>assignment.project_id===item.id&&!assignment.unassigned_at).map(assignment=>assignment.worker_id)).size;
    return `<button type="button" class="card project-card" data-action="view-overview-project" data-id="${esc(item.id)}"><span class="flex items-start justify-between gap-3"><span class="min-w-0"><b class="block truncate text-sm text-slate-800">${esc(item.name)}</b><small class="block mt-1 truncate text-xs text-slate-500">${esc(item.location||item.project_code||'No location')}</small></span>${status(item.status||'active')}</span><span class="mt-5 flex items-center justify-between text-xs text-slate-500"><span>${assigned} worker${assigned===1?'':'s'} assigned</span><span class="font-semibold text-slate-700">View project ${icon('arrow-up-right')}</span></span></button>`;
  }).join('');
  return cards||empty(query?'No projects match your search':'No projects created');
}
function projectSitePage() {
  const project=state.projects.find(item=>item.id===state.siteProjectId);
  if(!project) return `<div class="card p-5"><button type="button" class="btn-secondary mb-4" data-action="back-to-overview">${icon('arrow-left')} Back to overview</button>${empty('This project could not be found')}</div>`;
  const assignmentIds=new Set(state.assignments.filter(assignment=>assignment.project_id===project.id&&!assignment.unassigned_at).map(assignment=>assignment.worker_id));
  const workers=state.workers.filter(worker=>assignmentIds.has(worker.id)).sort((a,b)=>a.full_name.localeCompare(b.full_name));
  const todayAttendance=state.attendance.filter(record=>record.project_id===project.id&&record.work_date===dateISO());
  const rows=workers.map(worker=>{
    const attendance=todayAttendance.find(record=>record.worker_id===worker.id);
    const attendanceAction=isAdmin()&&worker.status!=='inactive'?`<button class="btn-secondary" data-action="project-worker-attendance" data-project-id="${esc(project.id)}" data-worker-id="${esc(worker.id)}">${attendance?'Edit attendance':'Mark attendance'}</button>`:worker.status==='inactive'?'Inactive worker':'—';
    const reportAction=`<button class="btn-secondary" data-action="project-worker-report" data-project-id="${esc(project.id)}" data-worker-id="${esc(worker.id)}">View report</button>`;
    return `<tr><td><div class="font-semibold text-slate-800">${esc(worker.full_name)}</div><div class="text-[10px] text-slate-400 mt-1">${esc(titleCase(worker.trade_type||'helper'))}</div></td><td>${status(worker.status||'active')}</td><td>${attendance?status(attendance.status):'<span class="text-slate-400">Not marked</span>'}</td><td>${attendance?`${Number(attendance.hours_worked||0).toFixed(1)} h`:'—'}</td><td><div class="flex flex-wrap gap-2">${attendanceAction}${reportAction}</div></td></tr>`;
  }).join('');
  const hasMarkableWorker=workers.some(worker=>worker.status!=='inactive');
  const siteAttendance=state.attendance.filter(record=>record.project_id===project.id);
  const presentToday=todayAttendance.filter(record=>['present','overtime'].includes(record.status)).length;
  return `<div class="flex flex-wrap items-center justify-between gap-3 mb-5"><div><button type="button" class="text-xs font-semibold text-slate-500 hover:text-slate-900 mb-3" data-action="back-to-overview">${icon('arrow-left')} Back to overview</button><h2 class="font-bold text-lg tracking-tight">${esc(project.name)}</h2><p class="text-xs text-slate-500 mt-1">${esc(project.location||'No location')} · ${esc(project.project_code||'No project code')}</p></div><div class="flex flex-wrap gap-2">${isAdmin()&&hasMarkableWorker?`<button class="btn-primary" data-action="project-mark-attendance" data-id="${esc(project.id)}">Mark attendance</button>`:''}${isChair()?`<button class="btn-secondary" data-action="edit-project" data-id="${esc(project.id)}">Edit project</button>`:''}</div></div>
    <div class="stats-grid grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">${statCard('Assigned workers',workers.length,'Currently assigned to this site','users')}${statCard("Today's attendance",presentToday,`of ${workers.length} assigned workers`,'calendar-check')}${statCard('Recent site shifts',siteAttendance.length,'From the latest attendance records','clipboard-check')}</div>
    <div class="card overflow-hidden">${workers.length?table(['Worker','Worker status',"Today's attendance",'Hours worked','Attendance actions'],rows,'project-attendance-table'):empty('No workers are currently assigned to this project')}</div>`;
}
function workersPage() {
  const rows=state.workers.map(w=>{const assignment=currentSiteAssignment(w);return `<tr><td><div class="font-semibold text-slate-800">${esc(w.full_name)}</div><div class="text-[10px] text-slate-400 mt-1">${esc(w.phone||'No phone')}</div></td><td>${esc(titleCase(w.trade_type||'helper'))}</td><td class="mono">${money(w.daily_wage_rate)}</td><td>${esc(assignment?.projects?.name||'Unassigned')}</td><td>${status(w.status||'active')}</td><td><div class="row-actions"><button class="text-xs font-bold text-slate-600 hover:text-slate-950" data-action="worker-detail" data-id="${esc(w.id)}">View profile ↗</button>${isAdmin()?rowActions(w.id,'edit-worker','delete-worker'):''}</div></td></tr>`}).join('');
  return `${sectionHead('Worker directory','Worker profiles, trades, rates and current assignments',isAdmin()?'<button class="btn-primary" data-action="add-worker">+ Register worker</button>':'')}<div class="card overflow-hidden">${state.workers.length?table(['Worker','Trade','Daily rate','Assigned site','Status','Actions'],rows):empty('No workers registered')}</div>`;
}
function attendancePage() {
  const workerOptions=state.workers.filter(w=>state.attendance.some(a=>a.worker_id===w.id))
    .sort((a,b)=>a.full_name.localeCompare(b.full_name))
    .map(w=>`<option value="${esc(w.id)}" ${w.id===state.attendanceWorkerFilter?'selected':''}>${esc(w.full_name)}</option>`).join('');
  const records=state.attendance.filter(a=>!state.attendanceWorkerFilter||a.worker_id===state.attendanceWorkerFilter);
  const creditedDays=records.reduce((total,a)=>total+attendanceDayCredit(a.status),0);
  const absent=records.filter(a=>a.status==='absent').length;
  const wages=records.reduce((total,a)=>total+Number(a.wage_amount||0),0);
  const rows=records.map(a=>`<tr><td><div class="font-semibold text-slate-800">${esc(a.workers?.full_name||'—')}</div></td><td>${esc(a.projects?.name||'—')}</td><td>${niceDate(a.work_date)}</td><td>${status(a.status)}</td><td>${attendanceDayCredit(a.status).toFixed(1)} day</td><td>${Number(a.hours_worked||0).toFixed(1)} h</td><td>${Number(a.overtime_hours||0).toFixed(1)} h</td><td class="mono">${money(a.wage_amount)}</td>${isAdmin()?`<td><div class="row-actions"><button class="icon-button danger-button" data-action="delete-attendance" data-id="${esc(a.id)}" aria-label="Delete attendance record" title="Delete attendance">${icon('trash-2')}</button></div></td>`:''}</tr>`).join('');
  return `${sectionHead('Attendance register','Review each worker’s shift, credited days, overtime and calculated wages',isAdmin()?'<button class="btn-primary" data-action="mark-attendance">+ Mark attendance</button>':'')}
  <div class="stats-grid grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">${statCard('Shifts shown',records.length,state.attendanceWorkerFilter?'For selected worker':'Attendance records','calendar-check')}${statCard('Credited days',creditedDays.toFixed(1),'Present = 1 day · Half-day = 0.5','check')}${statCard('Absences',absent,'Recorded absent shifts','x')}${statCard('Calculated wages',money(wages),'Based on the shifts shown','wallet')}</div>
  <div class="card p-4 mb-5"><label class="field-label" for="attendanceWorkerFilter">View attendance for a worker<select class="field" id="attendanceWorkerFilter"><option value="">All workers</option>${workerOptions}</select></label></div>
  <div class="card overflow-hidden">${records.length?table(['Worker','Site','Work date','Shift status','Credited days','Hours worked','Overtime','Calculated wage',...(isAdmin()?['Actions']:[])],rows):empty(state.attendanceWorkerFilter?'No attendance entries for this worker':'No attendance entries')}</div>`;
}
function attendanceDayCredit(attendanceStatus) {
  return ({present:1,overtime:1,half_day:.5,absent:0})[attendanceStatus]||0;
}
function payrollPage() {
  const rows=state.ledger.map(x=>`<tr><td>${esc(x.workers?.full_name||'—')}</td><td>${esc(paymentType(x.entry_type))}</td><td>${niceDate(x.transaction_date)}</td><td>${esc(x.description||x.receipt_reference||'—')}</td><td class="mono">${money(x.amount)}</td><td>${status(x.status||'pending')}</td><td>${esc(x.receipt_reference||'—')}</td>${isAdmin()?`<td>${rowActions(x.id,'edit-ledger','delete-ledger')}</td>`:''}</tr>`).join('');
  const total=state.ledger.filter(x=>x.entry_type==='wage').reduce((s,x)=>s+Number(x.amount||0),0);
  const pending=state.ledger.filter(x=>x.entry_type==='wage'&&x.status==='pending').reduce((s,x)=>s+Number(x.amount||0),0);
  return `<div class="stats-grid grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">${statCard('Wages recorded',money(total),'Total wage payments recorded','wallet')}${statCard('Wages to pay',money(pending),'Wage payments still pending','clock-3')}${statCard('Payment records',state.ledger.length,'Wages, advances and adjustments','receipt')}</div>${sectionHead('Worker payments','Wage payments, advances and site expenses',isAdmin()?'<button class="btn-primary" data-action="add-payment">+ Record payment</button>':'')}<div class="card overflow-hidden">${state.ledger.length?table(['Worker','Payment type','Date','Payment details','Amount','Status','Voucher / receipt no.',...(isAdmin()?['Actions']:[])],rows):empty('No payment records')}</div><p class="text-[11px] text-slate-500 mt-3">Check attendance and any advances paid before settling a worker’s wages.</p>`;
}
function projectsPage() {
  const rows=state.projects.map(p=>`<tr><td><div class="font-semibold">${esc(p.name)}</div><div class="text-[10px] text-slate-400 mt-1">${esc(p.project_code||'No code')}</div></td><td>${esc(p.location||'—')}</td><td>${status(p.status||'active')}</td><td>${state.assignments.filter(a=>a.project_id===p.id&&!a.unassigned_at).length} assigned</td><td>${niceDate(p.start_date)}</td>${isChair()?`<td>${rowActions(p.id,'edit-project','delete-project')}</td>`:''}</tr>`).join('');
  return `${sectionHead('Projects & sites','Site directory and workforce deployment',isChair()?'<button class="btn-primary" data-action="add-project">+ Add project</button>':'')}<div class="card overflow-hidden">${state.projects.length?table(['Project','Location','Status','Workers assigned','Start date',...(isChair()?['Actions']:[])],rows):empty('No projects created')}</div>`;
}
function workerPortal() {
  const worker=state.workers.find(w=>w.profile_id===state.user.id);
  if(!worker) return `<div class="card p-8">${empty('Your worker profile is not linked yet')}<p class="text-xs text-center text-slate-500">Ask your administrator to link your login to your worker profile.</p></div>`;
  const att=state.attendance.filter(a=>a.worker_id===worker.id);
  const ledger=state.ledger.filter(x=>x.worker_id===worker.id);
  const advances=ledger.filter(x=>x.entry_type==='advance').reduce((s,x)=>s+Number(x.amount||0),0);
  const creditedDays=att.reduce((total,a)=>total+attendanceDayCredit(a.status),0);
  const attendanceWages=att.reduce((total,a)=>total+Number(a.wage_amount||0),0);
  const recentAttendance=att.slice(0,20).map(a=>`<tr><td>${niceDate(a.work_date)}</td><td>${esc(a.projects?.name||'—')}</td><td>${status(a.status)}</td><td>${attendanceDayCredit(a.status).toFixed(1)} day</td><td>${Number(a.hours_worked||0).toFixed(1)} h</td><td>${Number(a.overtime_hours||0).toFixed(1)} h</td><td class="mono">${money(a.wage_amount)}</td></tr>`).join('');
  return `<div class="flex flex-wrap items-center justify-between gap-3 mb-6"><div><div class="eyebrow">MY WORKFORCE RECORD</div><p class="text-sm text-slate-500 mt-1">Your attendance, calculated wages and payment history.</p></div><button class="btn-secondary" data-action="refresh">${icon('refresh-cw')} Refresh data</button></div>
  <div class="stats-grid grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">${statCard('Attendance records',att.length,'Recorded shifts','calendar-check')}${statCard('Credited days',creditedDays.toFixed(1),'Present = 1 day · Half-day = 0.5','check')}${statCard('Calculated wages',money(attendanceWages),'Earned from recorded attendance','wallet')}${statCard('Advances received',money(advances),'All recorded advances','hand-coins')}</div>
  <div class="card overflow-hidden mb-6">${sectionHead('My attendance','Latest shifts with site, status, credited days and calculated wages')}${att.length?table(['Work date','Site','Shift status','Credited days','Hours worked','Overtime','Calculated wage'],recentAttendance):empty('No attendance entries yet')}</div>
  <div class="card overflow-hidden">${sectionHead('My payments','Recorded wage payments and advances')}${ledger.length?table(['Payment type','Date','Details','Amount','Status'],ledger.map(x=>`<tr><td>${esc(paymentType(x.entry_type))}</td><td>${niceDate(x.transaction_date)}</td><td>${esc(x.description||x.receipt_reference||'—')}</td><td class="mono">${money(x.amount)}</td><td>${status(x.status||'pending')}</td></tr>`).join('')):empty('No payment records yet')}</div>`;
}
function modal(title, subtitle, body) {
  $('#modalContent').innerHTML=`<div class="modal-inner"><div class="flex justify-between gap-4 items-start mb-6"><div><div class="eyebrow">RSPL ATTENDANCE</div><h3 id="modalTitle" class="text-xl font-bold mt-2">${title}</h3><p id="modalSubtitle" class="text-xs text-slate-500 mt-1">${subtitle}</p></div><button class="icon-button" data-action="close-modal" aria-label="Close">${icon('x')}</button></div>${body}</div>`;
  $('#modal').showModal(); refreshIcons();
}
function profileModal() {
  const profile=state.profile, user=state.user;
  if(!profile||!user) return;
  modal('Your profile','Manage the name and phone number shown in your workspace.',`<form id="profileForm" class="grid sm:grid-cols-2 gap-4">
    <label class="field-label sm:col-span-2">Full name *<input class="field" name="full_name" required maxlength="120" value="${esc(profile.full_name||'')}"></label>
    <label class="field-label">Email address<input class="field" value="${esc(user.email||'')}" readonly aria-readonly="true"></label>
    <label class="field-label">Workspace role<input class="field" value="${esc(titleCase(profile.role||'worker'))}" readonly aria-readonly="true"></label>
    <label class="field-label sm:col-span-2">Phone number<input class="field" name="phone" type="tel" maxlength="30" value="${esc(profile.phone||'')}"></label>
    <div class="sm:col-span-2 flex justify-end gap-2 pt-3"><button type="button" class="btn-secondary" data-action="close-modal">Cancel</button><button class="btn-primary" type="submit">Save profile</button></div>
  </form>`);
}
function confirmDialog(title, description, confirmLabel='Delete') {
  return new Promise(resolve=>{
    pendingConfirmation=resolve;
    modal(title,description,`<div class="flex justify-end gap-2 pt-2"><button type="button" class="btn-secondary" data-action="cancel-confirmation">Cancel</button><button type="button" class="btn-danger" data-action="confirm-confirmation">${esc(confirmLabel)}</button></div>`);
  });
}
function resolveConfirmation(confirmed) {
  if(!pendingConfirmation) return;
  const resolve=pendingConfirmation;
  pendingConfirmation=null;
  resolve(confirmed);
}
function settleConfirmation(confirmed) {
  resolveConfirmation(confirmed);
  if($('#modal').open) $('#modal').close();
}
function options(items, labelKey='name', selectedId='') { return items.map(x=>`<option value="${esc(x.id)}" ${String(x.id)===String(selectedId)?'selected':''}>${esc(x[labelKey])}</option>`).join(''); }
function currentSiteAssignment(worker) {
  return (worker.site_assignments||[])
    .filter(assignment=>!assignment.unassigned_at)
    .sort((a,b)=>new Date(b.assigned_at||0)-new Date(a.assigned_at||0))[0];
}
function assignedProjects(workerId) {
  const assignedProjectIds=new Set(state.assignments
    .filter(assignment=>assignment.worker_id===workerId&&!assignment.unassigned_at)
    .map(assignment=>assignment.project_id));
  return state.projects.filter(project=>assignedProjectIds.has(project.id));
}
function workerModal(id=null) {
  if(!isAdmin()) return;
  const worker=state.workers.find(w=>w.id===id), editing=Boolean(worker), value=(key)=>esc(worker?.[key]??''), assignment=worker?currentSiteAssignment(worker):null;
  modal(editing?'Edit worker':'Register worker',editing?'Update the worker’s complete profile and current site assignment.':'Fields marked * are required. Sensitive identity documents are stored privately.',`<form id="workerForm" class="grid sm:grid-cols-2 gap-4">
    ${editing?`<input type="hidden" name="record_id" value="${esc(worker.id)}">`:''}
    <label class="field-label sm:col-span-2">Full name *<input class="field" name="full_name" required maxlength="120" value="${value('full_name')}"></label>
    <label class="field-label">Phone<input class="field" name="phone" type="tel" maxlength="20" value="${value('phone')}"></label>
    <label class="field-label">Emergency contact<input class="field" name="emergency_contact" maxlength="120" value="${value('emergency_contact')}"></label>
    <label class="field-label">Government ID number<input class="field" name="govt_id_number" maxlength="40" autocomplete="off" value="${value('govt_id_number')}"></label>
    <label class="field-label">Trade *<select class="field" name="trade_type" required>${['helper','mason','carpenter','electrician','plumber','welder','painter','operator','other'].map(t=>`<option value="${t}" ${worker?.trade_type===t?'selected':''}>${esc(titleCase(t))}</option>`).join('')}</select></label>
    <label class="field-label">Daily wage rate (₹) *<input class="field" name="daily_wage_rate" type="number" min="0" max="1000000" step=".01" required value="${value('daily_wage_rate')}"></label>
    ${editing?`<label class="field-label">Status<select class="field" name="status">${['active','inactive','on_leave'].map(s=>`<option value="${s}" ${worker.status===s?'selected':''}>${titleCase(s.replaceAll('_',' '))}</option>`).join('')}</select></label>`:''}
    <label class="field-label">Project site<select class="field" name="project_id"><option value="">Unassigned</option>${options(state.projects,'name',assignment?.project_id)}</select></label>
    <label class="field-label sm:col-span-2">Profile image (compressed before upload)<input class="field" name="avatar" type="file" accept="image/png,image/jpeg,image/webp"></label>
    <label class="field-label sm:col-span-2">ID proof document (images compressed; PDFs unchanged)<input class="field" name="id_proof" type="file" accept="image/png,image/jpeg,image/webp,application/pdf"></label>
    <div class="sm:col-span-2 flex justify-end gap-2 pt-3"><button type="button" class="btn-secondary" data-action="close-modal">Cancel</button><button class="btn-primary" type="submit">${editing?'Save changes':'Save worker'}</button></div>
  </form>`);
}
function addWorkerModal() { workerModal(); }
function attendanceModal(workerId=null, projectId=null) {
  if(!isAdmin()) return;
  const fixedProject=state.projects.find(project=>project.id===projectId);
  if(projectId&&!fixedProject) throw new Error('The selected project could not be found.');
  const workers=state.workers
    .filter(worker=>worker.status!=='inactive'&&assignedProjects(worker.id).length&&(!projectId||assignedProjects(worker.id).some(project=>project.id===projectId)))
    .sort((a,b)=>a.full_name.localeCompare(b.full_name));
  if(workerId&&!workers.some(worker=>worker.id===workerId)) throw new Error('This worker is not actively assigned to the selected project.');
  const existing=workerId?state.attendance.find(record=>record.worker_id===workerId&&record.project_id===projectId&&record.work_date===dateISO()):null;
  const projectOptions=fixedProject?options([fixedProject],'name',fixedProject.id):'';
  modal('Mark attendance','Record a worker shift, including the hours worked. Wage is calculated from the configured status and rate.',`<form id="attendanceForm" class="grid sm:grid-cols-2 gap-4" ${fixedProject?`data-project-id="${esc(fixedProject.id)}"`:''}>
    <label class="field-label sm:col-span-2">Worker *<select class="field" name="worker_id" required><option value="">${workers.length?'Choose worker':'No active workers have an assigned site'}</option>${options(workers,'full_name',workerId||'')}</select></label>
    <label class="field-label">Project site *<select class="field" name="project_id" required ${fixedProject?'':'disabled'}>${fixedProject?projectOptions:'<option value="">Choose a worker first</option>'}</select></label>
    <label class="field-label">Work date *<input class="field" type="date" name="work_date" value="${dateISO()}" required max="${dateISO()}"></label>
    <label class="field-label">Attendance status *<select class="field" name="status" required><option value="present" ${existing?.status==='present'?'selected':''}>Present (1 day)</option><option value="absent" ${existing?.status==='absent'?'selected':''}>Absent (0 day)</option><option value="half_day" ${existing?.status==='half_day'?'selected':''}>Half-day (0.5 day)</option><option value="overtime" ${existing?.status==='overtime'?'selected':''}>Present + overtime</option></select></label>
    <label class="field-label">Hours worked *<input class="field" type="number" name="hours_worked" min="0" max="24" step=".25" value="${existing?Number(existing.hours_worked||0):8}" required></label>
    <label class="field-label">Overtime hours<input class="field" type="number" name="overtime_hours" min="0" max="24" step=".25" value="${existing?Number(existing.overtime_hours||0):0}"></label>
    <label class="field-label sm:col-span-2">Notes<input class="field" name="notes" maxlength="300" value="${esc(existing?.notes||'')}" placeholder="Optional site verification / shift note"></label>
    <div class="sm:col-span-2 flex justify-end gap-2 pt-3"><button type="button" class="btn-secondary" data-action="close-modal">Cancel</button><button class="btn-primary" type="submit">Save attendance</button></div>
  </form>`);
}
function paymentModal(id=null) {
  if(!isAdmin()) return;
  const entry=state.ledger.find(x=>x.id===id), editing=Boolean(entry), value=(key)=>esc(entry?.[key]??'');
  modal(editing?'Edit payment record':'Record worker payment','Record wages, an advance or a site expense. Enter a positive amount; advances are deducted when settling wages.',`<form id="paymentForm" class="grid sm:grid-cols-2 gap-4">
    ${editing?`<input type="hidden" name="record_id" value="${esc(entry.id)}">`:''}
    <label class="field-label sm:col-span-2">Worker *<select class="field" name="worker_id" required><option value="">Choose worker</option>${options(state.workers,'full_name',entry?.worker_id)}</select></label>
    <label class="field-label">Payment type *<select class="field" name="entry_type" required>${[['advance','Advance paid / site cash'],['wage','Wage payment'],['adjustment','Other adjustment']].map(([v,l])=>`<option value="${v}" ${entry?.entry_type===v?'selected':''}>${l}</option>`).join('')}</select></label>
    <label class="field-label">Amount (₹) *<input class="field" name="amount" type="number" min=".01" max="100000000" step=".01" required value="${value('amount')}"></label>
    <label class="field-label">Transaction date *<input class="field" name="transaction_date" type="date" value="${value('transaction_date')||dateISO()}" max="${dateISO()}" required></label>
    <label class="field-label">Status *<select class="field" name="status"><option value="paid" ${entry?.status==='paid'?'selected':''}>Paid / disbursed</option><option value="pending" ${entry?.status==='pending'?'selected':''}>Pending</option></select></label>
    <label class="field-label">Project site<select class="field" name="project_id"><option value="">Not site-specific</option>${options(state.projects,'name',entry?.project_id)}</select></label>
    <label class="field-label">Voucher / receipt no.<input class="field" name="receipt_reference" maxlength="100" value="${value('receipt_reference')}"></label>
    <label class="field-label sm:col-span-2">Payment details<input class="field" name="description" maxlength="300" value="${value('description')}" placeholder="Optional note, e.g. weekly wages or site cash"></label>
    <div class="sm:col-span-2 flex justify-end gap-2 pt-3"><button type="button" class="btn-secondary" data-action="close-modal">Cancel</button><button class="btn-primary" type="submit">${editing?'Save changes':'Save payment record'}</button></div>
  </form>`);
}
function projectModal(id=null) {
  if(!isChair()) return;
  const project=state.projects.find(p=>p.id===id), editing=Boolean(project), value=(key)=>esc(project?.[key]??'');
  modal(editing?'Edit project':'Create project',editing?'Update this project and site details.':'Set up a construction site for workforce deployment.',`<form id="projectForm" class="grid sm:grid-cols-2 gap-4">
    ${editing?`<input type="hidden" name="record_id" value="${esc(project.id)}">`:''}
    <label class="field-label sm:col-span-2">Project name *<input class="field" name="name" required maxlength="140" value="${value('name')}"></label>
    <label class="field-label">Project code<input class="field" name="project_code" maxlength="40" value="${value('project_code')}"></label>
    <label class="field-label">Status<select class="field" name="status">${[['active','Active'],['paused','Paused'],['completed','Completed']].map(([v,l])=>`<option value="${v}" ${project?.status===v?'selected':''}>${l}</option>`).join('')}</select></label>
    <label class="field-label sm:col-span-2">Site location<input class="field" name="location" maxlength="240" value="${value('location')}"></label>
    <label class="field-label">Start date<input class="field" name="start_date" type="date" value="${value('start_date')}"></label>
    <label class="field-label">End date<input class="field" name="end_date" type="date" value="${value('end_date')}"></label>
    <div class="sm:col-span-2 flex justify-end gap-2 pt-3"><button type="button" class="btn-secondary" data-action="close-modal">Cancel</button><button class="btn-primary" type="submit">${editing?'Save changes':'Create project'}</button></div>
  </form>`);
}
async function compressImage(file, maxBytes) {
  const bitmap=await createImageBitmap(file);
  try {
    const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
    let width=Math.max(1,Math.round(bitmap.width*scale));
    let height=Math.max(1,Math.round(bitmap.height*scale));
    const canvas=document.createElement('canvas');
    const context=canvas.getContext('2d');
    if(!context) throw new Error('This browser could not prepare the image for upload.');
    context.fillStyle='#fff';
    let blob=null;
    for(let attempt=0;attempt<6;attempt++) {
      canvas.width=width;
      canvas.height=height;
      context.fillStyle='#fff';
      context.fillRect(0,0,width,height);
      context.drawImage(bitmap,0,0,width,height);
      const quality=[.82,.74,.66,.58,.5,.45][attempt];
      blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
      if(!blob) throw new Error('The selected image could not be compressed.');
      if(blob.size<=maxBytes) break;
      width=Math.max(1,Math.round(width*.85));
      height=Math.max(1,Math.round(height*.85));
    }
    if(blob.size>maxBytes) throw new Error(`Compressed image still exceeds ${Math.round(maxBytes/1024/1024)} MB.`);
    const baseName=file.name.replace(/\.[^.]+$/,'')||'image';
    return new File([blob],`${baseName}.jpg`,{type:'image/jpeg',lastModified:Date.now()});
  } finally {
    bitmap.close();
  }
}
async function uploadFile(file, workerId, kind) {
  if(!file||!file.name) return null;
  const allowed = kind==='id_proof' ? ['application/pdf','image/jpeg','image/png','image/webp'] : ['image/jpeg','image/png','image/webp'];
  const fileLabel=kind==='avatar'?'Profile image':'ID proof document';
  if(file.size===0) throw new Error(`${fileLabel} is empty.`);
  if(!allowed.includes(file.type)) throw new Error(`Unsupported ${fileLabel.toLowerCase()} file type.`);
  const max=kind==='id_proof'?8*1024*1024:4*1024*1024;
  const isImage=file.type.startsWith('image/');
  if(file.size>(isImage?20*1024*1024:max)) throw new Error(`${fileLabel} exceeds the ${isImage?'20':'8'} MB ${isImage?'source-file':'file'} limit.`);
  const upload=isImage?await compressImage(file,max):file;
  const ext=(upload.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'');
  const path=`${workerId}/${kind}-${crypto.randomUUID()}.${ext}`;
  const {error}=await supabase.storage.from('worker-media').upload(path,upload,{upsert:false,contentType:upload.type});
  if(error) throw error;
  return path;
}
async function submitWorker(form) {
  const fd=new FormData(form);
  const wage=Number(fd.get('daily_wage_rate'));
  if(!Number.isFinite(wage)||wage<0) throw new Error('Enter a valid daily wage rate.');
  const recordId=fd.get('record_id');
  const payload={full_name:String(fd.get('full_name')).trim(),phone:String(fd.get('phone')||'').trim()||null,emergency_contact:String(fd.get('emergency_contact')||'').trim()||null,govt_id_number:String(fd.get('govt_id_number')||'').trim()||null,trade_type:fd.get('trade_type'),daily_wage_rate:wage,status:recordId?fd.get('status'):'active'};
  if(!payload.full_name) throw new Error('Full name is required.');
  if(recordId&&!isAdmin()) throw new Error('You do not have permission to edit workers.');
  let workerId=recordId;
  if(recordId) {
    const {error}=await supabase.from('workers').update(payload).eq('id',recordId);
    if(error) throw error;
  } else {
    payload.created_by=state.user.id;
    const {data:worker,error}=await supabase.from('workers').insert(payload).select().single();
    if(error) throw error;
    workerId=worker.id;
  }
  try {
    const avatarPath=await uploadFile(fd.get('avatar'),workerId,'avatar');
    const idPath=await uploadFile(fd.get('id_proof'),workerId,'id_proof');
    const mediaPayload={};
    if(avatarPath) mediaPayload.avatar_path=avatarPath;
    if(idPath) mediaPayload.id_proof_path=idPath;
    if(Object.keys(mediaPayload).length) {
      const {error}=await supabase.from('workers').update(mediaPayload).eq('id',workerId);
      if(error) throw error;
    }
    await saveWorkerSiteAssignment(workerId,fd.get('project_id'));
  } catch(e) {
    await loadData(); $('#modal').close(); render();
    notify(`Worker profile ${recordId?'updated':'created'}, but a file or site assignment step failed: ${e.message}`,true);
    return;
  }
  await loadData(); $('#modal').close(); render(); notify(`Worker profile ${recordId?'updated':'created'}.`);
}
async function saveWorkerSiteAssignment(workerId, projectId) {
  const {data:activeAssignments,error}=await supabase.from('site_assignments')
    .select('id, project_id')
    .eq('worker_id',workerId)
    .is('unassigned_at',null);
  if(error) throw error;
  if(activeAssignments.length===1&&activeAssignments[0].project_id===projectId) return;
  if(projectId) {
    const {error:insertError}=await supabase.from('site_assignments').insert({
      worker_id:workerId,
      project_id:projectId,
      assigned_by:state.user.id
    });
    if(insertError) throw insertError;
  }
  if(activeAssignments.length) {
    const {error:updateError}=await supabase.from('site_assignments')
      .update({unassigned_at:new Date().toISOString()})
      .in('id',activeAssignments.map(assignment=>assignment.id));
    if(updateError) throw updateError;
  }
}
async function submitAttendance(form) {
  const fd=new FormData(form), worker=state.workers.find(w=>w.id===fd.get('worker_id'));
  if(!worker) throw new Error('Choose a valid worker.');
  if(!assignedProjects(worker.id).some(project=>project.id===fd.get('project_id'))) throw new Error('Choose a site assigned to this worker.');
  const statusValue=fd.get('status'), hoursWorked=Number(fd.get('hours_worked')), ot=Number(fd.get('overtime_hours')||0);
  if(!Number.isFinite(hoursWorked)||hoursWorked<0||hoursWorked>24) throw new Error('Hours worked must be between 0 and 24.');
  if(ot<0||ot>24) throw new Error('Overtime must be between 0 and 24 hours.');
  const dayFactor={present:1,absent:0,half_day:.5,overtime:1}[statusValue];
  // Default policy: overtime is paid at 1.5x hourly equivalent after 8 hours.
  const overtimePay=Math.max(0,ot-8)*Number(worker.daily_wage_rate||0)/8*1.5;
  const wage=Number(worker.daily_wage_rate||0)*dayFactor+overtimePay;
  const payload={worker_id:worker.id,project_id:fd.get('project_id'),work_date:fd.get('work_date'),status:statusValue,hours_worked:hoursWorked,overtime_hours:ot,wage_amount:wage,notes:String(fd.get('notes')||'').trim()||null,marked_by:state.user.id};
  const {error}=await supabase.from('attendance').upsert(payload,{onConflict:'worker_id,work_date,project_id'});
  if(error) throw error;
  $('#modal').close(); await loadData(); render(); notify('Attendance saved.');
}
async function submitPayment(form) {
  const fd=new FormData(form), amount=Number(fd.get('amount'));
  if(!Number.isFinite(amount)||amount<=0) throw new Error('Amount must be greater than zero.');
  const recordId=fd.get('record_id');
  const payload={worker_id:fd.get('worker_id'),project_id:fd.get('project_id')||null,entry_type:fd.get('entry_type'),amount,transaction_date:fd.get('transaction_date'),status:fd.get('status'),receipt_reference:String(fd.get('receipt_reference')||'').trim()||null,description:String(fd.get('description')||'').trim()||null};
  if(recordId&&!isAdmin()) throw new Error('You do not have permission to edit payment records.');
  if(recordId) {
    const {error}=await supabase.from('payments_ledger').update(payload).eq('id',recordId);
    if(error) throw error;
  } else {
    payload.recorded_by=state.user.id;
    const {error}=await supabase.from('payments_ledger').insert(payload);
    if(error) throw error;
  }
  $('#modal').close(); await loadData(); render(); notify(recordId?'Payment record updated.':'Payment recorded.');
}
async function submitProject(form) {
  if(!isChair()) throw new Error('Only the chairman can create or edit projects.');
  const fd=new FormData(form),recordId=fd.get('record_id'),payload={name:String(fd.get('name')).trim(),project_code:String(fd.get('project_code')||'').trim()||null,status:fd.get('status'),location:String(fd.get('location')||'').trim()||null,start_date:fd.get('start_date')||null,end_date:fd.get('end_date')||null};
  if(!payload.name) throw new Error('Project name is required.');
  if(recordId) {
    const {error}=await supabase.from('projects').update(payload).eq('id',recordId);
    if(error) throw error;
  } else {
    payload.created_by=state.user.id;
    const {error}=await supabase.from('projects').insert(payload);
    if(error) throw error;
  }
  $('#modal').close(); await loadData(); render(); notify(recordId?'Project updated.':'Project created.');
}
async function submitProfile(form) {
  const fd=new FormData(form), fullName=String(fd.get('full_name')||'').trim();
  if(!fullName) throw new Error('Full name is required.');
  const phone=String(fd.get('phone')||'').trim();
  const {data:profile,error}=await supabase.from('profiles').update({
    full_name:fullName,
    phone:phone||null
  }).eq('id',state.user.id).select('*').single();
  if(error) throw error;
  state.profile=profile;
  updateProfileSummary();
  $('#modal').close();
  notify('Profile updated.');
}
async function deleteRecord(tableName, id, label, permissionCheck) {
  if(!permissionCheck()) throw new Error(`You do not have permission to delete ${label.toLowerCase()}.`);
  if(!await confirmDialog(`Delete ${label.toLowerCase()}?`,`This will permanently remove this ${label.toLowerCase()} record. This action cannot be undone.`)) return;
  const {error}=await supabase.from(tableName).delete().eq('id',id);
  if(error) throw error;
  await loadData(); render(); notify(`${label} deleted.`);
}
async function workerDetail(id) {
  const w=state.workers.find(x=>x.id===id); if(!w)return;
  const att=state.attendance.filter(a=>a.worker_id===id);
  const ledger=state.ledger.filter(x=>x.worker_id===id);
  const creditedDays=att.reduce((total,a)=>total+attendanceDayCredit(a.status),0);
  const attendanceWages=att.reduce((total,a)=>total+Number(a.wage_amount||0),0);
  const attendanceRows=att.slice(0,10).map(a=>`<tr><td>${niceDate(a.work_date)}</td><td>${esc(a.projects?.name||'—')}</td><td>${status(a.status)}</td><td>${attendanceDayCredit(a.status).toFixed(1)} day</td><td>${Number(a.hours_worked||0).toFixed(1)} h</td><td>${Number(a.overtime_hours||0).toFixed(1)} h</td><td class="mono">${money(a.wage_amount)}</td></tr>`).join('');
  modal(esc(w.full_name),'Worker profile and attendance history',`<div class="grid grid-cols-2 gap-3"><div class="rounded-xl bg-slate-50 p-4"><div class="text-xs text-slate-500">Trade</div><b class="block mt-1">${esc(titleCase(w.trade_type||'helper'))}</b></div><div class="rounded-xl bg-slate-50 p-4"><div class="text-xs text-slate-500">Daily wage</div><b class="block mt-1 mono">${money(w.daily_wage_rate)}</b></div><div class="rounded-xl bg-slate-50 p-4"><div class="text-xs text-slate-500">Phone</div><b class="block mt-1">${esc(w.phone||'—')}</b></div><div class="rounded-xl bg-slate-50 p-4"><div class="text-xs text-slate-500">Status</div><div class="mt-1">${status(w.status)}</div></div></div><div class="grid grid-cols-3 gap-3 mt-5"><div class="rounded-xl bg-slate-50 p-3"><div class="text-[11px] text-slate-500">Attendance records</div><b class="block mt-1">${att.length}</b></div><div class="rounded-xl bg-slate-50 p-3"><div class="text-[11px] text-slate-500">Credited days</div><b class="block mt-1">${creditedDays.toFixed(1)}</b></div><div class="rounded-xl bg-slate-50 p-3"><div class="text-[11px] text-slate-500">Calculated wages</div><b class="block mt-1 mono">${money(attendanceWages)}</b></div></div><div class="mt-5"><h4 class="font-bold text-sm mb-2">Recent attendance</h4>${att.length?table(['Date','Site','Status','Credited days','Hours worked','Overtime','Wage'],attendanceRows):'<p class="text-xs text-slate-500">No attendance yet.</p>'}</div><div class="mt-5"><h4 class="font-bold text-sm mb-2">Recent payments (${ledger.length})</h4>${ledger.slice(0,5).map(x=>`<div class="flex justify-between border-t py-2 text-xs"><span>${niceDate(x.transaction_date)} · ${esc(paymentType(x.entry_type))}</span><b class="mono">${money(x.amount)}</b></div>`).join('')||'<p class="text-xs text-slate-500">No payment records yet.</p>'}</div>`);
}
async function projectWorkerAttendanceReport(workerId, projectId) {
  const worker=state.workers.find(item=>item.id===workerId);
  const project=state.projects.find(item=>item.id===projectId);
  if(!worker||!project) throw new Error('The selected worker or project could not be found.');
  const {data,error}=await supabase.from('attendance').select('*').eq('worker_id',workerId).eq('project_id',projectId).order('work_date',{ascending:false});
  if(error) throw error;
  const records=data||[];
  const creditedDays=records.reduce((total,record)=>total+attendanceDayCredit(record.status),0);
  const wages=records.reduce((total,record)=>total+Number(record.wage_amount||0),0);
  const rows=records.map(record=>`<tr><td>${niceDate(record.work_date)}</td><td>${status(record.status)}</td><td>${attendanceDayCredit(record.status).toFixed(1)} day</td><td>${Number(record.hours_worked||0).toFixed(1)} h</td><td>${Number(record.overtime_hours||0).toFixed(1)} h</td><td class="mono">${money(record.wage_amount)}</td></tr>`).join('');
  modal(`${esc(worker.full_name)} · Attendance report`,`Attendance recorded at ${esc(project.name)} only.`,`${records.length?`<div class="grid grid-cols-3 gap-3 mb-5"><div class="rounded-xl bg-slate-50 p-3"><div class="text-[11px] text-slate-500">Shifts</div><b class="block mt-1">${records.length}</b></div><div class="rounded-xl bg-slate-50 p-3"><div class="text-[11px] text-slate-500">Credited days</div><b class="block mt-1">${creditedDays.toFixed(1)}</b></div><div class="rounded-xl bg-slate-50 p-3"><div class="text-[11px] text-slate-500">Calculated wages</div><b class="block mt-1 mono">${money(wages)}</b></div></div>${table(['Work date','Status','Credited days','Hours worked','Overtime','Wage'],rows)}`:'<div class="empty">No attendance records for this worker at this site.</div>'}`);
}
document.addEventListener('click', async e=>{
  const page=e.target.closest('[data-page]'); if(page){setPage(page.dataset.page); if(innerWidth<1024)setSidebarOpen(false);return;}
  const el=e.target.closest('[data-action]'); if(!el)return;
  try {
    switch(el.dataset.action) {
      case 'profile':if(el.closest('#sidebar')&&innerWidth<1024)setSidebarOpen(false);profileModal();break;
      case 'refresh': await loadData();render();notify('Data refreshed.');break;
      case 'add-worker':addWorkerModal();break;
      case 'edit-worker':workerModal(el.dataset.id);break;
      case 'delete-worker':await deleteRecord('workers',el.dataset.id,'Worker',isAdmin);break;
      case 'mark-attendance':attendanceModal();break;
      case 'view-overview-project':state.siteProjectId=el.dataset.id;setPage('site');break;
      case 'back-to-overview':setPage('overview');break;
      case 'project-mark-attendance':attendanceModal(null,el.dataset.id);break;
      case 'project-worker-attendance':attendanceModal(el.dataset.workerId,el.dataset.projectId);break;
      case 'project-worker-report':await projectWorkerAttendanceReport(el.dataset.workerId,el.dataset.projectId);break;
      case 'delete-attendance':await deleteRecord('attendance',el.dataset.id,'Attendance record',isAdmin);break;
      case 'add-payment':paymentModal();break;
      case 'edit-ledger':paymentModal(el.dataset.id);break;
      case 'delete-ledger':await deleteRecord('payments_ledger',el.dataset.id,'Payment record',isAdmin);break;
      case 'add-project':projectModal();break;
      case 'edit-project':projectModal(el.dataset.id);break;
      case 'delete-project':await deleteRecord('projects',el.dataset.id,'Project',isChair);break;
      case 'close-modal':settleConfirmation(false);if($('#modal').open)$('#modal').close();break;
      case 'cancel-confirmation':settleConfirmation(false);break;
      case 'confirm-confirmation':settleConfirmation(true);break;
      case 'worker-detail':await workerDetail(el.dataset.id);break;
    }
  } catch(err) { notify(err.message||'Something went wrong.',true); }
});
document.addEventListener('input',e=>{
  if(e.target.id!=='overviewProjectSearch') return;
  state.overviewProjectSearch=e.target.value;
  const results=$('#overviewProjectResults');
  if(results) { results.innerHTML=overviewProjectResultsHtml(); refreshIcons(); }
});
document.addEventListener('change',e=>{
  if(e.target.id==='attendanceWorkerFilter') {
    state.attendanceWorkerFilter=e.target.value;
    render();
    return;
  }
  if(e.target.matches('#attendanceForm [name="worker_id"]')) {
    const projectSelect=$('#attendanceForm [name="project_id"]');
    const fixedProjectId=e.target.form.dataset.projectId;
    const projects=assignedProjects(e.target.value).filter(project=>!fixedProjectId||project.id===fixedProjectId);
    projectSelect.innerHTML=`<option value="">${projects.length?'Choose site':'No sites assigned'}</option>${options(projects)}`;
    projectSelect.disabled=projects.length===0;
    if(fixedProjectId&&projects.length) projectSelect.value=fixedProjectId;
  }
  if(e.target.matches('#attendanceForm [name="worker_id"], #attendanceForm [name="project_id"], #attendanceForm [name="work_date"]')) {
    const form=$('#attendanceForm');
    const existing=state.attendance.find(record=>record.worker_id===form.elements.worker_id.value&&record.project_id===form.elements.project_id.value&&record.work_date===form.elements.work_date.value);
    if(existing) {
      form.elements.status.value=existing.status;
      form.elements.hours_worked.value=Number(existing.hours_worked||0);
      form.elements.overtime_hours.value=Number(existing.overtime_hours||0);
      form.elements.notes.value=existing.notes||'';
    } else {
      form.elements.status.value='present';
      form.elements.hours_worked.value=8;
      form.elements.overtime_hours.value=0;
      form.elements.notes.value='';
    }
  }
});
document.addEventListener('submit', async e=>{
  const f=e.target;
  if(!['loginForm','workerForm','attendanceForm','paymentForm','projectForm','profileForm'].includes(f.id))return;
  e.preventDefault();
  const button=f.querySelector('button[type="submit"]'); if(button){button.disabled=true;button.textContent='Saving…';}
  try {
    if(f.id==='loginForm') {
      $('#loginError').textContent='';
      setRememberSessionEnabled($('#rememberMe').checked);
      const {error}=await supabase.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#password').value});
      if(error)throw error;
    }
    if(f.id==='workerForm')await submitWorker(f);
    if(f.id==='attendanceForm')await submitAttendance(f);
    if(f.id==='paymentForm')await submitPayment(f);
    if(f.id==='projectForm')await submitProject(f);
    if(f.id==='profileForm')await submitProfile(f);
  } catch(err) {
    const loginErr=$('#loginError');
    if(f.id==='loginForm')loginErr.textContent=err.message||'Sign in failed.';
    else notify(err.message||'Could not save record.',true);
    if(button){
      button.disabled=false;
      if(f.id==='loginForm') { button.innerHTML='<span>Sign in securely</span><i data-lucide="arrow-up-right"></i>'; refreshIcons(); }
      else button.textContent=({workerForm:f.elements.record_id?'Save changes':'Save worker',attendanceForm:'Save attendance',paymentForm:f.elements.record_id?'Save changes':'Save payment record',projectForm:f.elements.record_id?'Save changes':'Create project',profileForm:'Save profile'}[f.id]||'Submit');
    }
  }
});
$('#logoutBtn').addEventListener('click',async()=>{
  const button=$('#logoutBtn');
  button.disabled=true;
  try {
    const {error}=await supabase.auth.signOut();
    if(error) throw error;
    showLogin();
  } catch(error) {
    console.error('Could not sign out:',error);
    notify(`Could not sign out: ${error.message||'Please try again.'}`,true);
  } finally {
    button.disabled=false;
  }
});
$('#mobileMenu').addEventListener('click',toggleSidebar);
$('#sidebarToggle').addEventListener('click',toggleSidebar);
$('#sidebarClose').addEventListener('click',()=>setSidebarOpen(false));
$('#sidebarBackdrop').addEventListener('click',()=>setSidebarOpen(false));
$('#modal').addEventListener('cancel',()=>resolveConfirmation(false));
document.addEventListener('keydown',e=>{
  if (e.key==='Escape' && !window.matchMedia('(min-width: 1024px)').matches && $('#sidebar').classList.contains('open')) setSidebarOpen(false);
});
window.addEventListener('resize',()=>{
  const desktop=window.matchMedia('(min-width: 1024px)').matches;
  setSidebarOpen(desktop);
});
boot();
