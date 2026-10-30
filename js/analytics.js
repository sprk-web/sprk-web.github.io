import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";

const recordedEvents = new Set();

function isLocalTestHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host.endsWith(".localhost") || host === "::1" || /^127\./.test(host);
}

function canTrack() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
    && !isLocalTestHost(location.hostname)
    && !/(^|\/)admin(?:\/|$)/i.test(location.pathname);
}

function wasRecorded(eventType, pagePath) {
  const key = `sprk-${eventType}-session:${pagePath}`;
  if (recordedEvents.has(key)) return true;
  recordedEvents.add(key);
  try {
    if (sessionStorage.getItem(key)) return true;
    sessionStorage.setItem(key, "1");
  } catch {
    // Keep an in-memory guard when browser storage is unavailable.
  }
  return false;
}

async function sendEvent(eventType, pagePath, referrer = "Direct") {
  if (!canTrack() || wasRecorded(eventType, pagePath)) return;
  const ua = navigator.userAgent || "";
  const device = /ipad|tablet/i.test(ua) ? "Tablet" : /mobi|android|iphone/i.test(ua) ? "Mobile" : "Desktop";
  const payload = {
    event_type: eventType,
    page_path: pagePath,
    device_type: device,
    region: "Unknown",
    referrer,
  };
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/site_analytics`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
      keepalive: true,
    });
    if (!response.ok) console.debug("SPRK analytics was not recorded", response.status);
  } catch (error) {
    console.debug("SPRK analytics unavailable", error);
  }
}

const trackingAllowed = canTrack();

export function recordContentEngagement(updateId) {
  if (!updateId) return;
  const pagePath = `/updates/#update-${encodeURIComponent(updateId)}`;
  sendEvent("content_engagement", pagePath);
}

if (trackingAllowed) {
  const pagePath = location.pathname;
  let referrer = "Direct";
  try {
    if (document.referrer) {
      referrer = new URL(document.referrer).origin === location.origin ? "Internal" : "External";
    }
  } catch {
    referrer = "Direct";
  }
  const send = () => sendEvent("page_view", pagePath, referrer);
  if ("requestIdleCallback" in window) requestIdleCallback(send, { timeout: 2500 });
  else setTimeout(send, 800);
}
