"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSSRServerClient } from "@/lib/supabase/ssr-server";
import { LoginSchema } from "@/lib/auth/login-schema";
import { endImpersonation } from "@/lib/auth/impersonation";
import {
  REMEMBER_COOKIE,
  REMEMBER_COOKIE_MAX_AGE,
  rememberCookieValue,
} from "@/lib/auth/session-persistence";

export type AuthActionState = { error?: string } | undefined;

export async function loginAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    remember: formData.get("remember") ?? undefined,
  });
  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }

  const persistSession = parsed.data.remember;

  const supabase = await createSSRServerClient({ persistSession });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) {
    return { error: "Incorrect email or password." };
  }

  // Record the choice for proxy.ts, which re-writes the auth cookies on every request to
  // keep the session fresh. Without this it would reapply Supabase's own long maxAge on
  // the very next navigation and quietly undo an unticked "Remember me".
  //
  // The preference cookie mirrors the lifetime it describes: persistent when remembering,
  // a session cookie when not, so it disappears alongside the credentials it governs.
  const cookieStore = await cookies();
  cookieStore.set(REMEMBER_COOKIE, rememberCookieValue(persistSession), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(persistSession ? { maxAge: REMEMBER_COOKIE_MAX_AGE } : {}),
  });

  redirect("/");
}

// No redirect() here on purpose — the caller (profile-popover.tsx) does a hard
// window.location navigation after this resolves, specifically to force a full page
// reload. A Server Action's own redirect() is a soft, client-side transition that leaves
// every module-level client cache (useIdentity's included) intact across sign-out, which
// was the root cause of a stale-identity-from-the-previous-account bug.
export async function logoutAction(): Promise<void> {
  const supabase = await createSSRServerClient();
  // scope: "local" is load-bearing, NOT a default worth omitting. Supabase's signOut()
  // defaults to scope "global", which revokes every session belonging to the account —
  // all other devices, browsers and tabs. Teams here share a single login, so the default
  // meant one person clicking Sign out silently logged out every colleague mid-work
  // (diagnosed from staging auth logs showing POST /auth/v1/logout?scope=global, which
  // was the real cause of the "random logouts / offline banner while working" reports).
  await supabase.auth.signOut({ scope: "local" });
  // The preference belongs to the session that just ended — leaving it behind would let
  // one user's "don't remember me" silently govern the next person to sign in here.
  (await cookies()).delete(REMEMBER_COOKIE);
  await endImpersonation();
}
