let loadPromise;

export async function loadSupabaseSdk() {
  if (globalThis.supabase?.createClient) return;
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    script.onload = () => {
      if (globalThis.supabase?.createClient) resolve();
      else reject(new Error("The account service did not initialize."));
    };
    script.onerror = () => reject(new Error("Could not load the account service."));
    document.head.append(script);
  });
  return loadPromise;
}
