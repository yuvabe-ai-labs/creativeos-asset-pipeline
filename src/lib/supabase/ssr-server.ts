import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { applySessionPersistence } from "@/lib/auth/session-persistence";

// Cookie-based Supabase client for AUTH/SESSION only (getUser, signIn, signOut).
// Uses the ANON key + the caller's session cookie — subject to RLS, unlike the
// service-role client in ./server.ts (which stays the DB write path). Two clients,
// two jobs: this one knows who the caller is; that one bypasses security to write.
export async function createSSRServerClient(
  // "Remember me". When false, the auth cookies are written without maxAge/expires so
  // the browser drops them at close. Defaults to true: every caller other than the login
  // action is refreshing an existing session and must not change its lifetime.
  { persistSession = true }: { persistSession?: boolean } = {},
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase env vars — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(
              name,
              value,
              applySessionPersistence(options, persistSession),
            );
          }
        } catch {
          // set() throws in a Server Component render (read-only cookies). Safe to
          // ignore: proxy.ts (Stage 1C) refreshes the session cookie on the next request.
        }
      },
    },
  });
}
