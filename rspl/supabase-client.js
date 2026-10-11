// Browser client for this vanilla-JS application.
// Set these values in config.js; never put a service_role key in browser code.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const config = window.SITELEDGER_CONFIG || {};
const REMEMBER_SESSION_KEY = 'rspl-remember-session';
const projectUrl = config.url || 'https://jibezmepgjnbzhcejyqs.supabase.co';
const authStorageKey = `sb-${new URL(projectUrl).hostname.split('.')[0]}-auth-token`;
export const isRememberSessionEnabled = () => {
  const preference = localStorage.getItem(REMEMBER_SESSION_KEY);
  return preference === 'true' || (preference === null && localStorage.getItem(authStorageKey) !== null);
};
export function setRememberSessionEnabled(enabled) {
  if (enabled) localStorage.setItem(REMEMBER_SESSION_KEY, 'true');
  else {
    localStorage.removeItem(REMEMBER_SESSION_KEY);
    localStorage.removeItem(authStorageKey);
  }
}

const authStorage = {
  getItem(key) {
    const storage = isRememberSessionEnabled() ? localStorage : sessionStorage;
    return storage.getItem(key);
  },
  setItem(key, value) {
    const remember = isRememberSessionEnabled();
    const storage = remember ? localStorage : sessionStorage;
    const otherStorage = remember ? sessionStorage : localStorage;
    otherStorage.removeItem(key);
    storage.setItem(key, value);
  },
  removeItem(key) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
};
if (!config.url || !config.anonKey) {
  console.warn('RSPL Attendance: set SUPABASE_URL and SUPABASE_ANON_KEY in config.js');
}
export const supabase = createClient(config.url || 'https://jibezmepgjnbzhcejyqs.supabase.co',
  config.anonKey || 'sb_publishable_0xsNDW6LWxRipAKFpBVQpQ_0OXtAwYi', {
    auth: { persistSession: true, storage: authStorage, autoRefreshToken: true, detectSessionInUrl: true }
  });
