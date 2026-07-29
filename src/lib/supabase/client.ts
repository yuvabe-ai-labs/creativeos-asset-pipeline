import { createBrowserClient } from "@supabase/ssr";

// Browser-safe Supabase singleton. Uses anon key + cookie session (via @supabase/ssr),
// so authenticated Realtime carries the caller's JWT once login exists (Stage 1C).
// Do NOT import "server-only".
let _client: ReturnType<typeof createBrowserClient> | null = null;

export function createBrowserSupabase() {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase browser env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  _client = createBrowserClient(url, anonKey);
  return _client;
}
