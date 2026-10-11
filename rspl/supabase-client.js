// Browser client for this vanilla-JS application.
// Set these values in config.js; never put a service_role key in browser code.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const config = window.SITELEDGER_CONFIG || {};
if (!config.url || !config.anonKey) {
  console.warn('RSPL Attendance: set SUPABASE_URL and SUPABASE_ANON_KEY in config.js');
}
export const supabase = createClient(config.url || 'https://jibezmepgjnbzhcejyqs.supabase.co',
  config.anonKey || 'sb_publishable_0xsNDW6LWxRipAKFpBVQpQ_0OXtAwYi', {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
