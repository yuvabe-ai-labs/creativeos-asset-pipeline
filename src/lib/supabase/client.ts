import { createClient } from "@supabase/supabase-js";

// Browser-safe Supabase singleton. Uses anon key (safe to expose in browser bundles).
// Do NOT import "server-only" — this file is intentionally browser-safe.
// Do NOT use the service role key here.
let _client: ReturnType<typeof createClient> | null = null;

export function createBrowserSupabase() {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Missing Supabase browser env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
  _client = createClient(url, anonKey);
  return _client;
}
