"use server";

import { redirect } from "next/navigation";
import { createSSRServerClient } from "@/lib/supabase/ssr-server";
import { LoginSchema } from "@/lib/auth/login-schema";
import { endImpersonation } from "@/lib/auth/impersonation";

export type AuthActionState = { error?: string } | undefined;

export async function loginAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }

  const supabase = await createSSRServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) {
    return { error: "Incorrect email or password." };
  }

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
  await endImpersonation();
}
