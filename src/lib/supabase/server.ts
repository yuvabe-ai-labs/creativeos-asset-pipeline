import "server-only";
import { createClient } from "@supabase/supabase-js";

// The SERVER Supabase client. It uses the SERVICE ROLE key, which bypasses all
// security — so this file must never be imported into a Client Component.
// `import "server-only"` enforces that: the build fails if it leaks to the browser.
//
// We create it lazily (a function, not a top-level constant) so the app can still
// build before the env vars exist.
export function createServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase env vars — set NEXT_PUBLIC_SUPABASE_URL and " +
        "SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
  }

  return createClient(url, serviceRoleKey, {
    // No user sessions yet (auth deferred — decision D14).
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
