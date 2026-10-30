import {
  APP_DATA_SUPABASE_ANON_KEY,
  APP_DATA_SUPABASE_URL,
  SUPABASE_URL,
} from "./config.js";

let cachedClient;
let cachedToken;

function getTokenClaims(accessToken) {
  try {
    const [encodedHeader, encodedClaims] = accessToken.split(".");
    const decode = (part) => {
      const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
    };
    return { header: decode(encodedHeader), claims: decode(encodedClaims) };
  } catch {
    throw new Error("The SPRK access token is malformed. Sign out and sign back in before using app-data features.");
  }
}

function assertAppDataTokenCompatible(accessToken) {
  if (!accessToken) return;
  const { header, claims } = getTokenClaims(accessToken);
  if (claims.iss !== `${SUPABASE_URL}/auth/v1`) {
    throw new Error(`The SPRK access token issuer does not match ${SUPABASE_URL}/auth/v1. Sign in through the configured main SPRK project.`);
  }
  if (header.alg !== "ES256" || !header.kid) {
    throw new Error(
      `The current SPRK session uses ${header.alg || "an unknown algorithm"}${header.kid ? ` (key ${header.kid})` : " without a key ID"}. ` +
      "The app-data project's Custom OIDC integration requires an asymmetric token with a kid. " +
      "In the main SPRK project, activate an ES256 signing key under Authentication > JWT Signing Keys, then sign out and back in.",
    );
  }
  if (claims.role !== "authenticated") {
    throw new Error(`The SPRK access token has role "${claims.role || "missing"}"; app-data requires the authenticated role claim.`);
  }
}

/**
 * Creates an app-data REST client with the current SPRK account JWT.
 * The app-data project must trust the SPRK project's OIDC issuer and signing keys.
 * @param {{access_token: string}|null} [session]
 */
export function getAppDataSupabaseClient(session = null) {
  if (!APP_DATA_SUPABASE_URL || !APP_DATA_SUPABASE_ANON_KEY) return null;
  if (!globalThis.supabase?.createClient) throw new Error("The Supabase browser SDK did not load.");
  const accessToken = session?.access_token || "";
  assertAppDataTokenCompatible(accessToken);
  if (cachedClient && cachedToken === accessToken) return cachedClient;

  cachedToken = accessToken;
  cachedClient = globalThis.supabase.createClient(APP_DATA_SUPABASE_URL, APP_DATA_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    ...(accessToken ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } } : {}),
  });
  return cachedClient;
}

export function isAppDataConfigured() {
  return Boolean(APP_DATA_SUPABASE_URL && APP_DATA_SUPABASE_ANON_KEY);
}
