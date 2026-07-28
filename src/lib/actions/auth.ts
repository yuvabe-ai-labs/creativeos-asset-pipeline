"use server";

import { redirect } from "next/navigation";
import { createSSRServerClient } from "@/lib/supabase/ssr-server";
import { LoginSchema } from "@/lib/auth/login-schema";

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

// No redirect() here on purpose — the caller (identity-chip.tsx) does a hard
// window.location navigation after this resolves, specifically to force a full page
// reload. A Server Action's own redirect() is a soft, client-side transition that leaves
// every module-level client cache (useIdentity's included) intact across sign-out, which
// was the root cause of a stale-identity-from-the-previous-account bug.
export async function logoutAction(): Promise<void> {
  const supabase = await createSSRServerClient();
  await supabase.auth.signOut();
}
