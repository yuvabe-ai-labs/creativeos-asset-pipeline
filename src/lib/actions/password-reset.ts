"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createSSRServerClient } from "@/lib/supabase/ssr-server";
import { mapAppMetadataToMustChangePassword } from "@/lib/dal-logic";
import { setMustChangePassword } from "@/lib/db/organizations";
import { endImpersonation } from "@/lib/auth/impersonation";
import { REMEMBER_COOKIE } from "@/lib/auth/session-persistence";
import { setOwnPassword } from "@/lib/auth/set-own-password";
import { sendPasswordResetLink } from "@/lib/auth/password-reset";
import { takeResetCooldown } from "@/lib/auth/throttle";
import { FLASH_COOKIE, FLASH_MAX_AGE_SECONDS, type FlashKey } from "@/lib/auth/flash";
import {
  ForgotPasswordSchema,
  RESET_COOLDOWN_MS,
  RESET_TOO_MANY,
  ResetPasswordSchema,
} from "@/lib/auth/password-reset-schema";

/** `email` comes back with an error so the form keeps what was typed. */
export type ForgotPasswordState = { sent?: true; error?: string; email?: string } | undefined;
export type ResetPasswordState = { error?: string; expired?: true } | undefined;

/** The error's code only: never its message, the email or a token. */
function errorCode(e: unknown): string {
  if (typeof e === "object" && e !== null && "code" in e) return String((e as { code: unknown }).code);
  return e instanceof Error ? e.name : "unknown error";
}

/**
 * Forgot password (D598). Runs signed out (allowlisted in with-action-coverage.test.ts).
 *
 * The answer never depends on whether an account exists: the cooldown applies to every request, and
 * the link is made and emailed in after(), once the answer has gone, so neither the words nor the
 * time taken tell an account apart from no account.
 */
export async function requestPasswordResetAction(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const typed = String(formData.get("email") ?? "").trim().slice(0, 320);
  const parsed = ForgotPasswordSchema.safeParse({ email: typed });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a valid email.", email: typed };
  const email = parsed.data.email.toLowerCase();

  const allowed = takeResetCooldown(email, RESET_COOLDOWN_MS);
  if (!allowed) return { error: RESET_TOO_MANY, email: typed };

  after(() => sendPasswordResetLink(email));
  return { sent: true };
}

/**
 * The reset link's form (D598). Runs signed out; the link's one-time token is the capability.
 * The token is checked and used up only here, on submit, never when the page opens (email
 * scanners open links). The password is checked first, so a typo doesn't use up the link.
 *
 * Signing in this way goes where sign-in goes ("/"), so everything after sign-in applies the
 * same: a person waiting for access is sent to onboarding, and a removed login has no account
 * left for the token to belong to.
 */
export async function resetPasswordAction(
  tokenHash: string,
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = ResetPasswordSchema.safeParse({
    password: formData.get("password") ?? "",
    confirmPassword: formData.get("confirmPassword") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your password." };
  if (!tokenHash) return { expired: true };

  const supabase = await createSSRServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
  const user = data?.user;
  if (error || !user) return { expired: true };

  // A new sign-in in this browser: nothing of an earlier session carries over, as on sign-out.
  // An earlier person's "Keep me signed in" choice goes too, so this session is kept (the default).
  await endImpersonation();
  const store = await cookies();
  store.delete(REMEMBER_COOKIE);

  const set = await setOwnPassword(supabase, {
    userId: user.id,
    password: parsed.data.password,
    clearMustChange: mapAppMetadataToMustChangePassword(user.app_metadata),
  });
  if (set.error) {
    // The link is used up and they are signed in by it, so the change-password page takes
    // over: proxy.ts keeps them there until a password is set.
    try {
      await setMustChangePassword(user.id, true);
    } catch (e) {
      console.error("[password-reset] could not send them to change password:", errorCode(e));
      return { error: set.error };
    }
    redirect("/account/password");
  }

  const flash: FlashKey = "password-set";
  store.set(FLASH_COOKIE, flash, { sameSite: "lax", path: "/", maxAge: FLASH_MAX_AGE_SECONDS, secure: process.env.NODE_ENV === "production" });
  redirect("/");
}
