import type { User } from "@supabase/supabase-js";

// getUser() makes a live network round-trip to Supabase's Auth server to validate the
// session JWT — required, since this app's anon-key client can't verify the signature
// locally. Every caller that redirects to /login on a null user was previously treating
// a transient network blip there (timeout, brief 5xx, DNS hiccup) identically to "no
// session," forcing a spurious logout for a user with a perfectly valid one. One retry
// absorbs a single blip without weakening the check: a real "no session" still resolves
// to null on both attempts, since Supabase returns no error for that case, only for a
// failed validation attempt.
export async function getUserWithRetry(supabase: {
  auth: { getUser: () => Promise<{ data: { user: User | null }; error: unknown }> };
}): Promise<User | null> {
  const first = await supabase.auth.getUser();
  if (first.data.user) return first.data.user;
  if (!first.error) return null;
  const second = await supabase.auth.getUser();
  return second.data.user;
}
