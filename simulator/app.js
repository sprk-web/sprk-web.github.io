import { SIMULATOR_CONFIG, SUPABASE_ANON_KEY, SUPABASE_URL } from "../js/config.js";
import { getAppDataSupabaseClient, isAppDataConfigured } from "../js/appDataSupabaseClient.js";
import { getPrimarySupabaseClient } from "../js/supabaseClient.js";
import { confirmDialog } from "../js/dialogs.js";

const app = document.querySelector("#app");
const categories = SIMULATOR_CONFIG.categories;
const difficulties = SIMULATOR_CONFIG.difficulties;
const demos = [
];

const STORAGE_KEYS = {
  favorites: "sprk-sim-favorites",
  likes: "sprk-sim-local-likes",
  recent: "sprk-sim-recent",
};
let supabase = null;
let primaryClient = null;
let currentUser = null;
let currentProfile = {};
let isAdmin = false;
let currentSession = null;
let allRows = [...demos];
let userLikes = new Set();
let activeCollection = "all";
let databaseNotice = "";

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]));

function readStorageList(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(saved) ? saved.filter((value) => typeof value === "string") : [];
  } catch (error) {
    console.error(`Could not read simulator preference "${key}".`, error);
    return [];
  }
}

function writeStorageList(key, values) {
  try {
    localStorage.setItem(key, JSON.stringify(values));
    return true;
  } catch (error) {
    console.error(`Could not save simulator preference "${key}".`, error);
    showNotice("Your browser could not save this preference. Check your storage settings and try again.", "error");
    return false;
  }
}

function showNotice(message, type = "") {
  const notice = document.querySelector("#simulator-message, #viewer-message");
  if (!notice) return;
  notice.className = `simulator-notice ${type}`.trim();
  notice.textContent = message;
  notice.hidden = !message;
}

function accountUrl(destination) {
  const returnPath = `/simulator/${destination ? `#/${destination}` : ""}`;
  return `../account/?return=${encodeURIComponent(returnPath)}`;
}

function demoCode(which) {
  if (which === "projectile") {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0;padding:24px;background:#fff8f6;color:#30242a;font:15px system-ui}h1{font-size:22px;margin:0 0 6px}p{color:#70646a}canvas{display:block;width:100%;height:280px;margin:18px 0;border:1px solid #eadcdd;border-radius:14px;background:#fff}label{display:inline-grid;gap:6px;margin:8px 18px 8px 0;font-size:13px}input{accent-color:#c93449}output{color:#a52e42;font-weight:700}
</style></head><body><h1>Projectile motion</h1><p>Change the launch conditions and compare the trajectory.</p><canvas id="path" width="900" height="300"></canvas><label>Launch speed <output id="speed-out">22 m/s</output><input id="speed" type="range" min="5" max="40" value="22"></label><label>Angle <output id="angle-out">45°</output><input id="angle" type="range" min="5" max="85" value="45"></label><label>Gravity <output id="gravity-out">9.8 m/s²</output><input id="gravity" type="range" min="1" max="15" step=".1" value="9.8"></label><p id="readout"></p><script>
(()=>{const c=document.querySelector('#path'),ctx=c.getContext('2d'),v=document.querySelector('#speed'),a=document.querySelector('#angle'),g=document.querySelector('#gravity');function draw(){const speed=+v.value,angle=+a.value*Math.PI/180,gravity=+g.value,time=2*speed*Math.sin(angle)/gravity,range=speed*speed*Math.sin(2*angle)/gravity,height=speed*speed*Math.sin(angle)**2/(2*gravity);ctx.clearRect(0,0,c.width,c.height);ctx.strokeStyle='#eadcdd';ctx.beginPath();ctx.moveTo(36,260);ctx.lineTo(864,260);ctx.stroke();ctx.strokeStyle='#c93449';ctx.lineWidth=4;ctx.beginPath();for(let i=0;i<=120;i++){const t=time*i/120,x=36+range*i/120,y=260-(speed*Math.sin(angle)*t-.5*gravity*t*t)*175/Math.max(height,1);i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.stroke();document.querySelector('#speed-out').value=speed+' m/s';document.querySelector('#angle-out').value=a.value+'°';document.querySelector('#gravity-out').value=gravity.toFixed(1)+' m/s²';document.querySelector('#readout').textContent='Range: '+range.toFixed(2)+' m · Maximum height: '+height.toFixed(2)+' m · Flight time: '+time.toFixed(2)+' s'}[v,a,g].forEach(input=>input.addEventListener('input',draw));draw()})()
<\/script></body></html>`;
  }
  if (which === "rolling") {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0;padding:24px;background:#f4f7fb;color:#26344a;font:15px system-ui}h1{font-size:22px}canvas{width:100%;height:270px;border:1px solid #dfe5ef;border-radius:14px;background:white}label{display:inline-grid;gap:6px;margin:12px 20px 8px 0}input{accent-color:#5b78a5}#result{color:#405f8b;font-weight:650}
</style></head><body><h1>Rolling down an incline</h1><p>Compare the effect of slope and rotational inertia.</p><canvas id="scene" width="900" height="300"></canvas><label>Incline angle <output id="angle-value">25°</output><input id="incline" type="range" min="5" max="40" value="25"></label><label>Inertia factor I/mR² <output id="factor-value">0.50</output><input id="factor" type="range" min=".2" max="1" step=".05" value=".5"></label><p id="result"></p><script>
(()=>{const c=document.querySelector('#scene'),ctx=c.getContext('2d'),angle=document.querySelector('#incline'),factor=document.querySelector('#factor');function draw(){const rad=+angle.value*Math.PI/180,k=+factor.value,acc=9.81*Math.sin(rad)/(1+k);ctx.clearRect(0,0,c.width,c.height);ctx.strokeStyle='#667b99';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(90,250);ctx.lineTo(810,250-720*Math.tan(rad));ctx.stroke();const x=340,y=250-250*Math.tan(rad)-30;ctx.fillStyle='#e3edf8';ctx.strokeStyle='#5b78a5';ctx.lineWidth=4;ctx.beginPath();ctx.arc(x,y,28,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#5b78a5';ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();document.querySelector('#angle-value').value=angle.value+'°';document.querySelector('#factor-value').value=k.toFixed(2);document.querySelector('#result').textContent='Acceleration: '+acc.toFixed(2)+' m/s² · a = g sin θ / (1 + I/mR²) · static friction acts up the slope'}[angle,factor].forEach(input=>input.addEventListener('input',draw));draw()})()
<\/script></body></html>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0;padding:24px;background:#f3f8f5;color:#2b3b32;font:15px system-ui}h1{font-size:22px}canvas{display:block;width:100%;height:230px;border:1px solid #dce8df;border-radius:14px;background:white}label{display:inline-grid;gap:6px;margin:12px 20px 8px 0}input{accent-color:#65804f}#result{color:#526b40;font-weight:650}
</style></head><body><h1>Mass–spring oscillator</h1><p>Explore how mass, spring stiffness, and amplitude affect simple harmonic motion.</p><canvas id="motion" width="900" height="250"></canvas><label>Mass <output id="mass-value">1.0 kg</output><input id="mass" type="range" min=".2" max="5" step=".1" value="1"></label><label>Spring constant <output id="spring-value">16 N/m</output><input id="spring" type="range" min="2" max="40" value="16"></label><label>Amplitude <output id="amplitude-value">0.6 m</output><input id="amplitude" type="range" min=".1" max="1.2" step=".1" value=".6"></label><p id="result"></p><script>
(()=>{const c=document.querySelector('#motion'),ctx=c.getContext('2d'),m=document.querySelector('#mass'),k=document.querySelector('#spring'),a=document.querySelector('#amplitude');let start=performance.now();function draw(now){const mass=+m.value,spring=+k.value,amp=+a.value,w=Math.sqrt(spring/m),t=(now-start)/1000,x=450+amp*Math.cos(w*t)*280;ctx.clearRect(0,0,c.width,c.height);ctx.strokeStyle='#b8c5bb';ctx.beginPath();ctx.moveTo(70,125);ctx.lineTo(830,125);ctx.stroke();ctx.strokeStyle='#65804f';ctx.lineWidth=3;ctx.beginPath();for(let i=0;i<100;i++){const px=70+i*760/99,py=125+20*Math.sin(i*.7);i?ctx.lineTo(px,py):ctx.moveTo(px,py)}ctx.stroke();ctx.fillStyle='#b1c69d';ctx.fillRect(x-25,100,50,50);document.querySelector('#mass-value').value=mass.toFixed(1)+' kg';document.querySelector('#spring-value').value=spring+' N/m';document.querySelector('#amplitude-value').value=amp.toFixed(1)+' m';document.querySelector('#result').textContent='Angular frequency: '+w.toFixed(2)+' rad/s · Period: '+(2*Math.PI/w).toFixed(2)+' s · Energy: '+(.5*spring*amp*amp).toFixed(2)+' J';requestAnimationFrame(draw)}[m,k,a].forEach(input=>input.addEventListener('input',()=>{start=performance.now()}));requestAnimationFrame(draw)})()
<\/script></body></html>`;
}

function frameDocument(simulation) {
  return simulation.html_code || demoCode(simulation.demo);
}

async function loadSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  await new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-supabase-client]');
    if (window.supabase?.createClient) {
      resolve();
      return;
    }
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    script.dataset.supabaseClient = "true";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load the SPRK account service."));
    document.head.append(script);
  });
  if (!window.supabase?.createClient) throw new Error("The SPRK account service did not initialize.");
  primaryClient = getPrimarySupabaseClient();
  const { data, error } = await primaryClient.auth.getSession();
  if (error) throw error;
  currentSession = data.session || null;
  currentUser = currentSession?.user || null;
  supabase = isAppDataConfigured() ? getAppDataSupabaseClient(currentSession) : null;
  await loadCurrentProfile();
  primaryClient.auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION") return;
    currentSession = session || null;
    currentUser = session?.user || null;
    supabase = isAppDataConfigured() ? getAppDataSupabaseClient(currentSession) : null;
    currentProfile = {};
    isAdmin = false;
    setTimeout(() => {
      Promise.all([loadCurrentProfile(), loadUserLikes()]).then(() => render()).catch((error) => {
        console.error("Could not refresh simulator likes after account change.", error);
        render();
      });
    }, 0);
  });
}

async function loadCurrentProfile() {
  if (!currentUser || !primaryClient) {
    currentProfile = {};
    isAdmin = false;
    return;
  }
  const { data, error } = await primaryClient
    .from("profiles")
    .select("display_name,is_admin")
    .eq("id", currentUser.id)
    .maybeSingle();
  if (error) throw error;
  currentProfile = data || {};
  isAdmin = Boolean(currentProfile.is_admin);
}

async function loadUserLikes() {
  if (!supabase || !currentUser) {
    userLikes = new Set();
    return;
  }
  const { data, error } = await supabase
    .from("simulation_likes")
    .select("simulation_id")
    .eq("user_id", currentUser.id);
  if (error) {
    console.error("Could not load simulation likes.", error.message);
    databaseNotice = `Your account is connected, but saved likes could not be loaded: ${error.message}`;
    userLikes = new Set();
    return;
  }
  userLikes = new Set((data || []).map((row) => row.simulation_id));
}

async function loadSimulations() {
  if (!supabase) return demos;
  const { data, error } = await supabase
    .from("simulations")
    .select("id,title,description,category,difficulty,creator_name,tags,view_count,like_count,created_at,featured,learning_objectives,detailed_explanation,html_code")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("Could not load published simulations.", error.message);
    databaseNotice = `Community simulations could not be loaded: ${error.message}. Built-in examples are shown instead.`;
    return demos;
  }
  databaseNotice = "";
  const publishedIds = new Set((data || []).map((simulation) => simulation.id));
  return [...(data || []), ...demos.filter((simulation) => !publishedIds.has(simulation.id))];
}

function iconFor(simulation) {
  if (simulation.category === "Rotational Motion") return ["rotate-cw", "energy"];
  if (simulation.category === "Oscillations and Waves") return ["activity", "waves"];
  if (simulation.category === "Work, Power & Energy") return ["zap", "energy"];
  if (simulation.category === "Optics") return ["scan-eye", "waves"];
  return ["orbit", "mechanics"];
}

function isLiked(id) {
  return currentUser ? userLikes.has(id) : readStorageList(STORAGE_KEYS.likes).includes(id);
}

function cardMarkup(simulation) {
  const [icon, topic] = iconFor(simulation);
  const liked = isLiked(simulation.id);
  const favorite = readStorageList(STORAGE_KEYS.favorites).includes(simulation.id);
  const views = Number(simulation.view_count || 0);
  const likes = Number(simulation.like_count || 0) + (!currentUser && liked ? 1 : 0);
  return `<article class="simulator-card">
    <div class="simulator-card-top">
      <span class="simulator-card-icon" data-topic="${topic}"><i data-lucide="${icon}" class="h-5 w-5" aria-hidden="true"></i></span>
      <span class="simulator-card-level">${escapeHtml(simulation.difficulty || "General Physics")}</span>
    </div>
    <h3>${escapeHtml(simulation.title)}</h3>
    <p class="simulator-card-description">${escapeHtml(simulation.description)}</p>
    <div class="simulator-card-meta"><span class="simulator-card-category">${escapeHtml(simulation.category || "General Physics")}</span><span>${views.toLocaleString()} views</span></div>
    <div class="simulator-card-bottom">
      <span class="simulator-card-creator">${escapeHtml(simulation.creator_name || "SPRK community")}</span>
      <div class="simulator-inline-actions">
        <button class="simulator-like" type="button" data-like="${escapeHtml(simulation.id)}" aria-pressed="${liked}" aria-label="${liked ? "Unlike" : "Like"} ${escapeHtml(simulation.title)}"><i data-lucide="${liked ? "heart-handshake" : "heart"}" class="h-4 w-4" aria-hidden="true"></i><span>${likes}</span></button>
        <button class="simulator-like" type="button" data-favorite="${escapeHtml(simulation.id)}" aria-pressed="${favorite}" aria-label="${favorite ? "Remove from" : "Add to"} saved simulations"><i data-lucide="${favorite ? "bookmark-check" : "bookmark"}" class="h-4 w-4" aria-hidden="true"></i></button>
        <a class="simulator-open" href="#/view/${encodeURIComponent(simulation.id)}">Explore <span aria-hidden="true">→</span></a>
      </div>
    </div>
  </article>`;
}

function renderExplorer() {
  const favorites = readStorageList(STORAGE_KEYS.favorites);
  const recent = readStorageList(STORAGE_KEYS.recent);
  app.innerHTML = `<div class="simulator-content">
    <section class="simulator-hero" aria-labelledby="simulator-heading">
      <div class="simulator-hero-copy">
        <span class="simulator-eyebrow">A good place to experiment</span>
        <h1 id="simulator-heading">Curiosity, in motion.</h1>
        <p>Play with the variables, see the physics unfold, and follow the questions that come up along the way.</p>
        <div class="simulator-hero-actions">
          <a class="simulator-link-primary" href="#explore">Explore the library <i data-lucide="arrow-down" class="h-4 w-4" aria-hidden="true"></i></a>
          <a class="simulator-link-secondary" href="#/post"><i data-lucide="plus" class="h-4 w-4" aria-hidden="true"></i> Create a simulation</a>
        </div>
      </div>
      <div class="simulator-hero-art" aria-hidden="true">
        <div class="sim-orbit sim-orbit-one"></div><div class="sim-orbit"></div>
        <div class="sim-atom-card"><span class="sim-atom-icon"><i data-lucide="atom" class="h-6 w-6"></i></span><small>A little discovery</small><strong>Try an idea.<br>See what happens.</strong><span>Keep exploring</span></div>
      </div>
    </section>
    <section id="explore" aria-labelledby="library-heading">
      <div class="simulator-section-heading">
        <div><p>Learn by exploring</p><h2 id="library-heading">The simulation library</h2></div>
        <span id="result-count" aria-live="polite">Loading simulations…</span>
      </div>
      <div class="simulator-controls">
        <label class="sr-only" for="search">Search the simulation library</label>
        <input id="search" class="simulator-control" type="search" placeholder="Search a topic, concept, or simulation…" autocomplete="off">
        <label class="sr-only" for="category">Filter by subject</label>
        <select id="category" class="simulator-control"><option value="">All subjects</option>${categories.map((category) => `<option>${escapeHtml(category)}</option>`).join("")}</select>
        <label class="sr-only" for="difficulty">Filter by level</label>
        <select id="difficulty" class="simulator-control"><option value="">All levels</option>${difficulties.map((difficulty) => `<option>${escapeHtml(difficulty)}</option>`).join("")}</select>
        <label class="sr-only" for="sort">Sort simulations</label>
        <select id="sort" class="simulator-control"><option value="featured">Featured</option><option value="newest">Recently added</option><option value="views">Most explored</option><option value="likes">Most liked</option><option value="alpha">A–Z</option></select>
      </div>
      <div class="simulator-toolbar">
        <div class="simulator-filter-buttons" role="group" aria-label="Simulation collection">
          <button class="simulator-filter-button" type="button" data-collection="all" aria-pressed="true">All simulations</button>
          <button class="simulator-filter-button" type="button" data-collection="saved" aria-pressed="false">Saved <span id="saved-count">${favorites.length}</span></button>
          <button class="simulator-filter-button" type="button" data-collection="recent" aria-pressed="false">Recently viewed <span id="recent-count">${recent.length}</span></button>
        </div>
        <a class="simulator-link" href="#/format"><i data-lucide="book-open-text" class="h-4 w-4" aria-hidden="true"></i> How simulations work</a>
      </div>
      <div id="cards" class="simulator-cards" aria-live="polite"></div>
      <div id="simulator-message" class="simulator-notice" role="status" hidden></div>
    </section>
  </div>`;
  window.lucide?.createIcons();

  const applyFilters = () => {
    const query = document.querySelector("#search").value.trim().toLowerCase();
    const category = document.querySelector("#category").value;
    const difficulty = document.querySelector("#difficulty").value;
    const sort = document.querySelector("#sort").value;
    const savedIds = readStorageList(STORAGE_KEYS.favorites);
    const recentIds = readStorageList(STORAGE_KEYS.recent);
    let rows = allRows.filter((simulation) => {
      const haystack = [
        simulation.title,
        simulation.description,
        simulation.category,
        simulation.difficulty,
        simulation.creator_name,
        ...(simulation.tags || []),
      ].join(" ").toLowerCase();
      return (!query || haystack.includes(query))
        && (!category || simulation.category === category)
        && (!difficulty || simulation.difficulty === difficulty)
        && (activeCollection !== "saved" || savedIds.includes(simulation.id))
        && (activeCollection !== "recent" || recentIds.includes(simulation.id));
    });
    if (sort === "views") rows.sort((a, b) => Number(b.view_count || 0) - Number(a.view_count || 0));
    else if (sort === "likes") rows.sort((a, b) => Number(b.like_count || 0) - Number(a.like_count || 0));
    else if (sort === "alpha") rows.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "newest") rows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    else rows.sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || new Date(b.created_at || 0) - new Date(a.created_at || 0));
    document.querySelector("#result-count").textContent = `${rows.length} ${rows.length === 1 ? "simulation" : "simulations"}`;
    document.querySelector("#saved-count").textContent = savedIds.length;
    document.querySelector("#recent-count").textContent = recentIds.length;
    document.querySelector("#cards").innerHTML = rows.length
      ? rows.map(cardMarkup).join("")
      : `<div class="simulator-empty" style="grid-column:1/-1"><strong>Nothing to show just yet.</strong><br>${activeCollection === "saved" ? "Save a simulation with the bookmark button and it will appear here." : activeCollection === "recent" ? "Open a simulation and it will be added to your recent list." : "Try another search or clear a filter to see more results."}</div>`;
    window.lucide?.createIcons();
  };
  document.querySelector("#search").addEventListener("input", applyFilters);
  document.querySelector("#category").addEventListener("change", applyFilters);
  document.querySelector("#difficulty").addEventListener("change", applyFilters);
  document.querySelector("#sort").addEventListener("change", applyFilters);
  document.querySelectorAll("[data-collection]").forEach((button) => {
    button.addEventListener("click", () => {
      activeCollection = button.dataset.collection;
      document.querySelectorAll("[data-collection]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      applyFilters();
    });
  });
  document.querySelector("#cards").addEventListener("click", async (event) => {
    const likeButton = event.target.closest("[data-like]");
    if (likeButton) {
      await toggleLike(likeButton.dataset.like);
      applyFilters();
      return;
    }
    const favoriteButton = event.target.closest("[data-favorite]");
    if (favoriteButton) {
      toggleFavorite(favoriteButton.dataset.favorite);
      applyFilters();
    }
  });
  applyFilters();
  showNotice(databaseNotice);
}

function toggleFavorite(id) {
  const favorites = readStorageList(STORAGE_KEYS.favorites);
  const next = favorites.includes(id) ? favorites.filter((item) => item !== id) : [id, ...favorites];
  if (writeStorageList(STORAGE_KEYS.favorites, next)) showNotice(next.includes(id) ? "Saved to your simulations on this device." : "Removed from your saved simulations.", "success");
}

async function toggleLike(id) {
  const row = allRows.find((simulation) => simulation.id === id);
  if (!row) return;
  if (!currentUser) {
    const likes = readStorageList(STORAGE_KEYS.likes);
    const next = likes.includes(id) ? likes.filter((item) => item !== id) : [...likes, id];
    if (writeStorageList(STORAGE_KEYS.likes, next)) showNotice(next.includes(id) ? "Liked. Your preference is saved on this device." : "Like removed.", "success");
    return;
  }
  if (!supabase) {
    showNotice("The SPRK account service is unavailable. Try again after reloading the page.", "error");
    return;
  }
  const wasLiked = userLikes.has(id);
  const button = document.querySelector(`[data-like="${CSS.escape(id)}"]`);
  if (button) button.disabled = true;
  try {
    const result = wasLiked
      ? await supabase.from("simulation_likes").delete().eq("simulation_id", id).eq("user_id", currentUser.id)
      : await supabase.from("simulation_likes").insert({ simulation_id: id, user_id: currentUser.id });
    if (result.error) throw result.error;
    if (wasLiked) userLikes.delete(id);
    else userLikes.add(id);
    row.like_count = Math.max(0, Number(row.like_count || 0) + (wasLiked ? -1 : 1));
    showNotice(wasLiked ? "Like removed." : "Thanks for liking this simulation.", "success");
  } catch (error) {
    console.error("Could not update simulation like.", error);
    showNotice(`Your like could not be saved: ${error.message}`, "error");
  } finally {
    if (button) button.disabled = false;
  }
}

async function getSimulation(id) {
  const demo = demos.find((simulation) => simulation.id === id);
  if (demo) return { ...demo, html_code: demoCode(demo.demo) };
  if (!supabase) return null;
  let query = supabase
    .from("simulations")
    .select("id,title,description,category,difficulty,creator_name,tags,view_count,like_count,created_at,learning_objectives,detailed_explanation,html_code")
    .eq("id", id);
  if (!isAdmin) query = query.eq("status", "published");
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

function addToRecent(id) {
  const recent = readStorageList(STORAGE_KEYS.recent).filter((item) => item !== id);
  writeStorageList(STORAGE_KEYS.recent, [id, ...recent].slice(0, 20));
}

function renderViewer(simulation) {
  const liked = isLiked(simulation.id);
  const objectives = Array.isArray(simulation.learning_objectives) ? simulation.learning_objectives : [];
  const tags = Array.isArray(simulation.tags) ? simulation.tags : [];
  app.innerHTML = `<div class="simulator-content simulator-viewer">
    <div class="simulator-viewer-layout">
      <section class="simulator-viewer-main">
        <a class="simulator-open" href="#/">← Back to simulations</a>
        <p class="simulator-kicker simulator-viewer-kicker">${escapeHtml(simulation.category || "General Physics")} · ${escapeHtml(simulation.difficulty || "All levels")}</p>
        <h1>${escapeHtml(simulation.title)}</h1>
        <p>${escapeHtml(simulation.description)}</p>
        <div class="simulator-stage">
          <div class="simulator-stage-toolbar"><span>Interactive simulation</span><div class="simulator-inline-actions">
            <button class="simulator-link" id="viewer-reload" type="button"><i data-lucide="rotate-cw" class="h-4 w-4"></i> Reset</button>
            <button class="simulator-link" id="viewer-fullscreen" type="button"><i data-lucide="maximize" class="h-4 w-4"></i> Fullscreen</button>
          </div></div>
          <iframe id="viewer-frame" class="simulator-frame" title="${escapeHtml(simulation.title)}" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>
        </div>
        <aside class="simulator-viewer-aside" aria-label="Simulation details">
          <h2>Simulation details</h2>
          <div class="simulator-stat"><span>Created by</span><strong>${escapeHtml(simulation.creator_name || "SPRK community")}</strong></div>
          <div class="simulator-stat"><span>Published</span><strong>${simulation.created_at ? escapeHtml(new Date(simulation.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })) : "Example"}</strong></div>
          <div class="simulator-stat"><span>Explorations</span><strong>${Number(simulation.view_count || 0).toLocaleString()}</strong></div>
          <div class="simulator-stat"><span>Likes</span><strong id="viewer-like-count-aside">${Number(simulation.like_count || 0) + (!currentUser && liked ? 1 : 0)}</strong></div>
          <div class="simulator-viewer-action-buttons">
            <button id="viewer-save" class="simulator-link simulator-save-button" type="button" aria-pressed="${readStorageList(STORAGE_KEYS.favorites).includes(simulation.id)}"><i data-lucide="bookmark" class="h-4 w-4"></i> Save for later</button>
            ${isAdmin && !String(simulation.id).startsWith("demo-") ? '<button id="viewer-delete" class="simulator-link simulator-delete-button" type="button"><i data-lucide="trash-2" class="h-4 w-4"></i> Delete simulation</button>' : ""}
          </div>
        </aside>
        <section class="simulator-panel">
          <h2>About this simulation</h2>
          <p>${escapeHtml(simulation.detailed_explanation || "Adjust the controls and observe how changing one variable affects the model. Try changing one value at a time, then compare your results.")}</p>
          ${objectives.length ? `<h3>What to explore</h3><ul>${objectives.map((objective) => `<li>${escapeHtml(objective)}</li>`).join("")}</ul>` : ""}
          ${tags.length ? `<p class="simulator-kicker">Topics · ${tags.map(escapeHtml).join(" · ")}</p>` : ""}
        </section>
        <div class="simulator-inline-actions simulator-viewer-actions">
          <button id="viewer-like" class="simulator-link" type="button" aria-pressed="${liked}"><i data-lucide="${liked ? "heart-handshake" : "heart"}" class="h-4 w-4"></i><span>${liked ? "Liked" : "Like"} · <span id="viewer-like-count">${Number(simulation.like_count || 0) + (!currentUser && liked ? 1 : 0)}</span></span></button>
          <button id="viewer-share" class="simulator-link" type="button"><i data-lucide="share-2" class="h-4 w-4"></i> Share</button>
          <button id="viewer-export" class="simulator-link" type="button"><i data-lucide="download" class="h-4 w-4"></i> Download HTML</button>
        </div>
        <div id="viewer-message" class="simulator-notice" role="status" hidden></div>
        <section id="viewer-community" class="simulator-panel simulator-community" aria-labelledby="community-heading">
          <div class="simulator-community-heading"><div><p class="simulator-kicker">Community</p><h2 id="community-heading">Discuss this simulation</h2></div><a href="../support/?simulation=${String(simulation.id).startsWith("demo-") ? "" : encodeURIComponent(simulation.id)}">Contact support</a></div>
          <form id="comment-form" class="simulator-community-form">
            <label for="comment-body">Add a comment</label>
            <textarea id="comment-body" name="body" maxlength="2000" rows="3" required placeholder="${currentUser ? "Share a question or observation…" : "Sign in to join the conversation"}" ${currentUser && !String(simulation.id).startsWith("demo-") ? "" : "disabled"}></textarea>
            <button class="simulator-link-primary" type="submit" ${currentUser && !String(simulation.id).startsWith("demo-") ? "" : "disabled"}>Post comment</button>
            ${currentUser ? "" : `<a href="${accountUrl(`view/${encodeURIComponent(simulation.id)}`)}">Sign in to comment</a>`}
          </form>
          <div id="comment-list" class="simulator-comment-list" aria-live="polite"><p>Loading comments…</p></div>
          <details class="simulator-report-details">
            <summary>Report this simulation</summary>
            <form id="report-form" class="simulator-community-form">
              <label for="report-reason">What’s the issue?</label>
              <select id="report-reason" name="reason" required ${currentUser && !String(simulation.id).startsWith("demo-") ? "" : "disabled"}>
                <option value="misleading">Misleading or inaccurate</option><option value="unsafe">Unsafe content</option><option value="broken">Does not work</option><option value="spam">Spam</option><option value="other">Other</option>
              </select>
              <label for="report-details">Additional details <span>(optional)</span></label>
              <textarea id="report-details" name="details" maxlength="2000" rows="3" placeholder="Help the moderation team understand your report" ${currentUser && !String(simulation.id).startsWith("demo-") ? "" : "disabled"}></textarea>
              <button class="simulator-link" type="submit" ${currentUser && !String(simulation.id).startsWith("demo-") ? "" : "disabled"}>Submit report</button>
              ${currentUser ? "" : `<a href="${accountUrl(`view/${encodeURIComponent(simulation.id)}`)}">Sign in to report</a>`}
            </form>
          </details>
        </section>
      </section>
    </div>
  </div>`;
  window.lucide?.createIcons();
  const frame = document.querySelector("#viewer-frame");
  const html = frameDocument(simulation);
  frame.srcdoc = html;
  document.querySelector("#viewer-reload").addEventListener("click", () => { frame.srcdoc = html; });
  document.querySelector("#viewer-fullscreen").addEventListener("click", () => {
    frame.requestFullscreen().catch((error) => showViewerNotice(`Fullscreen is unavailable: ${error.message}`, "error"));
  });
  document.querySelector("#viewer-like").addEventListener("click", async () => {
    await toggleLike(simulation.id);
    const nowLiked = isLiked(simulation.id);
    const updatedSimulation = allRows.find((row) => row.id === simulation.id);
    if (currentUser && updatedSimulation) simulation.like_count = updatedSimulation.like_count;
    const count = Number(simulation.like_count || 0) + (!currentUser && nowLiked ? 1 : 0);
    const likeButton = document.querySelector("#viewer-like");
    likeButton.setAttribute("aria-pressed", String(nowLiked));
    likeButton.setAttribute("aria-label", `${nowLiked ? "Unlike" : "Like"} simulation`);
    likeButton.innerHTML = `<i data-lucide="${nowLiked ? "heart-handshake" : "heart"}" class="h-4 w-4"></i><span>${nowLiked ? "Liked" : "Like"} · <span id="viewer-like-count">${count}</span></span>`;
    document.querySelector("#viewer-like-count-aside").textContent = count;
    window.lucide?.createIcons();
  });
  loadSimulationCommunity(simulation).catch((error) => {
    console.error("Could not load simulation community content.", error);
    const list = document.querySelector("#comment-list");
    if (list) list.innerHTML = `<p role="alert">Comments could not be loaded: ${escapeHtml(error.message)}</p>`;
  });
  document.querySelector("#comment-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitSimulationComment(simulation);
  });
  document.querySelector("#report-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitSimulationReport(simulation);
  });
  document.querySelector("#viewer-save").addEventListener("click", (event) => {
    toggleFavorite(simulation.id);
    const saved = readStorageList(STORAGE_KEYS.favorites).includes(simulation.id);
    event.currentTarget.setAttribute("aria-pressed", String(saved));
    event.currentTarget.innerHTML = `<i data-lucide="${saved ? "bookmark-check" : "bookmark"}" class="h-4 w-4"></i> ${saved ? "Saved" : "Save for later"}`;
    window.lucide?.createIcons();
  });
  document.querySelector("#viewer-delete")?.addEventListener("click", () => {
    deleteSimulation(simulation).catch((error) => {
      console.error("Could not delete simulation.", error);
      showViewerNotice(`Simulation could not be deleted: ${error.message}`, "error");
      const button = document.querySelector("#viewer-delete");
      if (button) button.disabled = false;
    });
  });
  document.querySelector("#viewer-share").addEventListener("click", async () => {
    const url = location.href;
    try {
      if (navigator.share) await navigator.share({ title: simulation.title, text: simulation.description, url });
      else {
        await navigator.clipboard.writeText(url);
        showViewerNotice("Link copied. Share it with someone curious.", "success");
      }
    } catch (error) {
      if (error.name !== "AbortError") showViewerNotice(`Could not share this simulation: ${error.message}`, "error");
    }
  });
  document.querySelector("#viewer-export").addEventListener("click", () => {
    const file = new Blob([html], { type: "text/html;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `${simulation.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "simulation"}.html`;
    link.click();
    URL.revokeObjectURL(downloadUrl);
  });
  window.lucide?.createIcons();
}

async function deleteSimulation(simulation) {
  if (!isAdmin || !supabase || String(simulation.id).startsWith("demo-")) {
    throw new Error("Only an SPRK admin can delete a published simulation.");
  }
  if (!await confirmDialog(`Permanently delete "${simulation.title}"? Its comments, likes, reports, and view records will also be deleted. This cannot be undone.`, { title: "Delete simulation", confirmLabel: "Delete", danger: true })) return;
  const button = document.querySelector("#viewer-delete");
  if (button) button.disabled = true;
  const { data, error } = await supabase.from("simulations")
    .delete()
    .eq("id", simulation.id)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Simulation was not deleted. It may no longer exist or your admin permission may not be recognized by the database.");
  const favoritesUpdated = writeStorageList(STORAGE_KEYS.favorites, readStorageList(STORAGE_KEYS.favorites).filter((id) => id !== simulation.id));
  const recentUpdated = writeStorageList(STORAGE_KEYS.recent, readStorageList(STORAGE_KEYS.recent).filter((id) => id !== simulation.id));
  userLikes.delete(simulation.id);
  history.replaceState(null, "", `${location.pathname}${location.search}#/`);
  allRows = allRows.filter((row) => row.id !== simulation.id);
  renderExplorer();
  showNotice(favoritesUpdated && recentUpdated
    ? "Simulation deleted."
    : "Simulation deleted, but this browser could not clear its saved and recent lists.", favoritesUpdated && recentUpdated ? "success" : "error");
}

async function loadSimulationCommunity(simulation) {
  const list = document.querySelector("#comment-list");
  if (!list) return;
  if (!supabase || String(simulation.id).startsWith("demo-")) {
    list.innerHTML = `<p>${String(simulation.id).startsWith("demo-") ? "Community comments and reports are available on published simulations." : "Connect to SPRK to load comments."}</p>`;
    return;
  }
  const { data, error } = await supabase
    .from("simulation_comments")
    .select("id,display_name,body,created_at")
    .eq("simulation_id", simulation.id)
    .eq("status", "visible")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  list.innerHTML = data?.length
    ? data.map((comment) => `<article class="simulator-comment"><header><strong>${escapeHtml(comment.display_name)}</strong><time datetime="${escapeHtml(comment.created_at)}">${escapeHtml(new Date(comment.created_at).toLocaleString())}</time></header><p>${escapeHtml(comment.body)}</p></article>`).join("")
    : "<p>No comments yet. Start the conversation.</p>";
  if (currentUser) {
    const { data: report, error: reportError } = await supabase
      .from("simulation_reports")
      .select("id")
      .eq("simulation_id", simulation.id)
      .eq("reporter_id", currentUser.id)
      .maybeSingle();
    if (reportError) throw reportError;
    const reportForm = document.querySelector("#report-form");
    if (report && reportForm) reportForm.innerHTML = "<p>Your report has been received. Thank you for helping keep the community safe.</p>";
  }
}

async function submitSimulationComment(simulation) {
  if (!currentUser) {
    location.href = accountUrl(`view/${encodeURIComponent(simulation.id)}`);
    return;
  }
  const form = document.querySelector("#comment-form");
  const submit = form.querySelector('button[type="submit"]');
  const body = form.elements.body.value.trim();
  if (!body) return;
  submit.disabled = true;
  try {
    const { error } = await supabase.from("simulation_comments").insert({
      simulation_id: simulation.id,
      user_id: currentUser.id,
      display_name: currentProfile.display_name || "SPRK member",
      body,
    });
    if (error) throw error;
    form.reset();
    await loadSimulationCommunity(simulation);
    showViewerNotice("Your comment was posted.", "success");
  } catch (error) {
    console.error("Could not post simulation comment.", error);
    showViewerNotice(`Your comment could not be posted: ${error.message}`, "error");
  } finally {
    submit.disabled = false;
  }
}

async function submitSimulationReport(simulation) {
  if (!currentUser) {
    location.href = accountUrl(`view/${encodeURIComponent(simulation.id)}`);
    return;
  }
  const form = document.querySelector("#report-form");
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const { error } = await supabase.from("simulation_reports").insert({
      simulation_id: simulation.id,
      reporter_id: currentUser.id,
      reason: form.elements.reason.value,
      details: form.elements.details.value.trim(),
    });
    if (error) throw error;
    await loadSimulationCommunity(simulation);
    showViewerNotice("Your report was sent to the moderation team.", "success");
  } catch (error) {
    console.error("Could not report simulation.", error);
    showViewerNotice(error.code === "23505" ? "You have already reported this simulation." : `Your report could not be sent: ${error.message}`, "error");
    submit.disabled = false;
  }
}

function showViewerNotice(message, type = "") {
  const element = document.querySelector("#viewer-message");
  if (!element) return;
  element.textContent = message;
  element.className = `simulator-notice ${type}`.trim();
  element.hidden = false;
}

async function renderViewerRoute(id) {
  app.innerHTML = `<div class="simulator-content"><p role="status">Loading simulation…</p></div>`;
  try {
    const simulation = await getSimulation(id);
    if (!simulation) {
      app.innerHTML = `<div class="simulator-content"><section class="simulator-panel"><h1>Simulation not found</h1><p>This simulation may have been removed or its link may be incorrect.</p><a class="simulator-link-primary" href="#/">Back to simulations</a></section></div>`;
      return;
    }
    addToRecent(id);
    if (currentUser && supabase && !String(id).startsWith("demo-")) {
      const { error } = await supabase.rpc("record_simulation_view", { p_simulation_id: id });
      if (error) {
        console.error("Could not record unique simulation view.", error);
        databaseNotice = `This simulation opened, but its view could not be recorded: ${error.message}`;
      }
    }
    renderViewer(simulation);
  } catch (error) {
    console.error("Could not open simulation.", error);
    app.innerHTML = `<div class="simulator-content"><section class="simulator-panel"><h1>Simulation unavailable</h1><p>${escapeHtml(error.message || "This simulation could not be loaded.")}</p><a class="simulator-link-primary" href="#/">Back to simulations</a></section></div>`;
  }
}

function formField(label, name, options = {}) {
  const input = options.select
    ? `<select class="simulator-form-control" id="${name}" required>${options.select.map((item) => `<option>${escapeHtml(item)}</option>`).join("")}</select>`
    : options.textarea
      ? `<textarea class="simulator-form-control${options.code ? " code" : ""}" id="${name}" ${options.required ? "required" : ""} maxlength="${options.max || 5000}" placeholder="${escapeHtml(options.placeholder || "")}"></textarea>`
      : `<input class="simulator-form-control" id="${name}" ${options.required ? "required" : ""} maxlength="${options.max || 200}" placeholder="${escapeHtml(options.placeholder || "")}">`;
  return `<label class="simulator-form-field${options.full ? " full" : ""}" for="${name}">${label}${options.required ? " *" : ""}${input}${options.help ? `<small>${escapeHtml(options.help)}</small>` : ""}</label>`;
}

function renderPublisher() {
  if (!currentUser) {
    app.innerHTML = `<div class="simulator-content"><section class="simulator-panel" style="max-width:760px;margin:28px auto;padding:clamp(22px,4vw,40px)">
      <p class="simulator-kicker">Share what you discover</p><h1>Publish a simulation</h1>
      <p>Sign in with your existing SPRK-Web account to publish and manage simulations. Likes and saved simulations work without signing in.</p>
      <a class="simulator-link-primary" href="${accountUrl("post")}"><i data-lucide="user-round" class="h-4 w-4"></i> Continue with your SPRK account</a>
      <p class="simulator-kicker" style="margin-top:20px">Already signed in? <a href="#/post">Refresh this page</a> to continue.</p>
    </section></div>`;
    window.lucide?.createIcons();
    return;
  }
  app.innerHTML = `<div class="simulator-content">
    <div class="simulator-section-heading"><div><p>Creator studio</p><h1>Publish a simulation</h1></div><a class="simulator-link" href="#/format">Read the creation guide</a></div>
    <form id="publish-form" class="simulator-form">
      <div class="simulator-form-grid">
        ${formField("Simulation title", "title", { required: true, max: 100, placeholder: "e.g. Projectile motion explorer" })}
        <div class="simulator-form-field"><span>Publishing as</span><div class="simulator-form-control simulator-author-name">${escapeHtml(currentProfile.display_name || currentUser.email?.split("@")[0] || "SPRK member")}</div><small>Your SPRK profile name is used as the creator name.</small></div>
        ${formField("Short description", "description", { required: true, textarea: true, max: 300, placeholder: "What can learners investigate?" })}
        ${formField("Physics subject", "category", { required: true, select: categories })}
        ${formField("Level", "difficulty", { required: true, select: difficulties })}
        ${formField("Tags", "tags", { max: 200, placeholder: "motion, energy, waves" })}
        ${formField("Learning objectives", "objectives", { textarea: true, max: 1200, placeholder: "One objective per line", help: "Add one learning objective per line.", full: true })}
        ${formField("Explanation and equations", "explanation", { textarea: true, max: 5000, placeholder: "Explain the assumptions, equations, and how to interpret the results.", full: true })}
        ${formField("Complete HTML simulation", "code", { required: true, textarea: true, code: true, max: 256000, placeholder: "Paste a complete HTML document with embedded CSS and JavaScript.", help: "Self-contained HTML, maximum 250 KB. It runs in a sandboxed preview.", full: true })}
      </div>
      <div class="simulator-toolbar" style="margin-top:18px"><span id="code-count" class="simulator-card-creator">0 bytes</span><div class="simulator-inline-actions"><button class="simulator-link" id="load-example" type="button">Load projectile example</button><button class="simulator-link" id="run-preview" type="button">Run preview</button></div></div>
      <div class="simulator-preview"><iframe id="preview-frame" title="Simulation preview" sandbox="allow-scripts"></iframe></div>
      <p class="simulator-card-creator" style="margin:12px 0">Preview runs in an isolated sandbox. Review every control and scientific assumption before publishing.</p>
      <button class="simulator-link-primary" id="publish-button" type="submit"><i data-lucide="send" class="h-4 w-4"></i> Publish simulation</button>
      <div id="publish-result" class="simulator-notice" role="status" hidden></div>
    </form>
  </div>`;
  window.lucide?.createIcons();

  const code = document.querySelector("#code");
  const preview = document.querySelector("#preview-frame");
  const updateCount = () => { document.querySelector("#code-count").textContent = `${new Blob([code.value]).size.toLocaleString()} bytes · ${code.value.length.toLocaleString()} characters`; };
  code.addEventListener("input", updateCount);
  document.querySelector("#load-example").addEventListener("click", () => {
    code.value = demoCode("projectile");
    updateCount();
    preview.srcdoc = code.value;
  });
  document.querySelector("#run-preview").addEventListener("click", () => { preview.srcdoc = code.value; });
  document.querySelector("#publish-form").addEventListener("submit", publishSimulation);
}

async function publishSimulation(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const result = document.querySelector("#publish-result");
  const html = document.querySelector("#code").value.trim();
  const data = {
    title: document.querySelector("#title").value.trim(),
    creator_name: currentProfile.display_name || currentUser.email?.split("@")[0] || "SPRK member",
    description: document.querySelector("#description").value.trim(),
    category: document.querySelector("#category").value,
    difficulty: document.querySelector("#difficulty").value,
    tags: document.querySelector("#tags").value.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 20),
    learning_objectives: document.querySelector("#objectives").value.split("\n").map((objective) => objective.trim()).filter(Boolean).slice(0, 20),
    detailed_explanation: document.querySelector("#explanation").value.trim(),
    html_code: html,
  };
  const errors = [];
  if (data.title.length < 2 || data.title.length > 100) errors.push("Title must be 2–100 characters.");
  if (data.creator_name.length > 50) errors.push("Your SPRK profile name must be 50 characters or fewer to publish.");
  if (data.description.length < 10 || data.description.length > 300) errors.push("Description must be 10–300 characters.");
  if (!/<html[\s>]/i.test(html) || !/<script[\s>]/i.test(html)) errors.push("Add a complete HTML document that includes its simulation script.");
  if (new Blob([html]).size > 250 * 1024) errors.push("Simulation HTML must be 250 KB or smaller.");
  if (/<script[^>]+src\s*=\s*["']javascript:/i.test(html)) errors.push("javascript: script sources are not allowed.");
  if (errors.length) {
    result.textContent = errors.join(" ");
    result.className = "simulator-notice error";
    result.hidden = false;
    return;
  }
  if (!supabase || !currentUser) {
    result.innerHTML = `Your SPRK account session is unavailable. <a href="${accountUrl("post")}">Sign in with your SPRK account</a>, then return here.`;
    result.className = "simulator-notice error";
    result.hidden = false;
    return;
  }
  const button = document.querySelector("#publish-button");
  button.disabled = true;
  button.textContent = "Publishing…";
  result.hidden = true;
  try {
    if (!currentSession) throw new Error("Your SPRK account session expired. Sign in again and retry.");
    const { data: created, error } = await supabase.from("simulations").insert({
      ...data,
      owner_id: currentSession.user.id,
      status: "published",
      code_size_bytes: new Blob([html]).size,
    }).select("id").single();
    if (error) throw error;
    result.innerHTML = `Published successfully. <a href="#/view/${encodeURIComponent(created.id)}">Open your simulation</a>`;
    result.className = "simulator-notice success";
    result.hidden = false;
    form.reset();
    document.querySelector("#preview-frame").srcdoc = "";
    document.querySelector("#code-count").textContent = "0 bytes";
  } catch (error) {
    console.error("Could not publish simulation.", error);
    result.textContent = `Publishing failed: ${error.message}`;
    result.className = "simulator-notice error";
    result.hidden = false;
  } finally {
    button.disabled = false;
    button.innerHTML = `<i data-lucide="send" class="h-4 w-4"></i> Publish simulation`;
    window.lucide?.createIcons();
  }
}

function renderFormat() {
  app.innerHTML = `<div class="simulator-content">
    <div class="simulator-section-heading"><div><p>Creator studio</p><h1>Making a simulation</h1></div><a class="simulator-link" href="#/post">Create a simulation</a></div>
    <article class="simulator-format">
      <section class="simulator-panel"><h2>Start with a model</h2><p>Every published simulation should be a complete, self-contained HTML document. Use embedded CSS and vanilla JavaScript so learners can explore the model without extra dependencies.</p><p>State assumptions clearly, use SI units internally, and label displayed values with their units. Interactive controls should affect the model itself, not just its appearance.</p></section>
      <h2>Include the essentials</h2>
      <ul><li>A clear title and a short explanation of the physics idea.</li><li>An interactive stage and controls for meaningful parameters.</li><li>Calculated readouts with units and an explanation of the equations.</li><li>Start, pause, and reset controls for animated models.</li><li>Suggested experiments that help learners discover relationships.</li></ul>
      <h2>Make it reliable</h2>
      <ul><li>Handle zero values, boundary values, and invalid input safely.</li><li>Test every control and confirm reset restores the initial state.</li><li>Use <code>requestAnimationFrame</code> for animations and account for elapsed time in seconds.</li><li>Keep the simulation readable on a narrow phone as well as a large screen.</li><li>Do not load remote scripts or depend on external services.</li></ul>
      <h2>Sandbox and safety</h2>
      <p>Submitted HTML runs in a sandboxed iframe without same-origin privileges. Avoid parent-window access, host storage, external network requests, dynamic code execution, and unnecessary scripts. The sandbox reduces risk but is not a complete network-isolation boundary; public deployments should use server-side moderation and an isolated content origin.</p>
      <section class="simulator-panel"><h2>Try a starter model</h2><p>Begin with projectile motion, rolling motion, or a mass-spring oscillator, then adapt it to your own experiment.</p><a class="simulator-link-primary" href="#/post">Open creator studio <i data-lucide="arrow-up-right" class="h-4 w-4"></i></a></section>
    </article>
  </div>`;
  window.lucide?.createIcons();
}

async function render() {
  const route = location.hash.replace(/^#\/?/, "");
  if (route.startsWith("view/")) {
    await renderViewerRoute(decodeURIComponent(route.slice(5)));
    return;
  }
  if (route === "post") {
    renderPublisher();
    return;
  }
  if (route === "format") {
    renderFormat();
    return;
  }
  renderExplorer();
  allRows = await loadSimulations();
  if (location.hash.replace(/^#\/?/, "") === "") renderExplorer();
}

window.addEventListener("hashchange", () => { render(); });

async function initialize() {
  try {
    await loadSupabase();
    await loadUserLikes();
  } catch (error) {
    console.error("SPRK account connection is unavailable.", error);
    databaseNotice = `SPRK account features are unavailable: ${error.message}. You can still browse, save, and like simulations on this device.`;
  }
  await render();
}

initialize();
