import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";

let client;

export function getPrimarySupabaseClient() {
  if (client) return client;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("The SPRK account service is not configured.");
  }
  if (!globalThis.supabase?.createClient) {
    throw new Error("The Supabase browser SDK did not load.");
  }
  client = globalThis.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}
