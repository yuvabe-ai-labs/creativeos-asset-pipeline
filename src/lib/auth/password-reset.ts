import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { appLink, passwordResetEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";

/** Where a reset email points: our own page, which only shows a form (D598). */
export function resetLink(tokenHash: string): string {
  return appLink(`/login/reset?token_hash=${encodeURIComponent(tokenHash)}`);
}

/**
 * Makes a one-time recovery token for the email and sends our own email with the link (D598).
 * When no account has that email, the sign-in service refuses and nothing is sent. Never throws
 * and never logs the email, the token or the link: it runs after the answer has gone, and the
 * answer is the same either way.
 */
export async function sendPasswordResetLink(email: string): Promise<void> {
  try {
    const { data, error } = await createServerSupabase().auth.admin.generateLink({ type: "recovery", email });
    const tokenHash = data?.properties?.hashed_token;
    if (error || !tokenHash) {
      // No account for the email is the usual reason; anything else is worth seeing. Code only.
      if (error && error.status !== 404 && error.code !== "user_not_found") {
        console.error("[password-reset] could not make a link:", error.code ?? error.status ?? "unknown");
      }
      return;
    }
    const sent = await sendEmail(passwordResetEmail({ to: email, link: resetLink(tokenHash) }));
    if (!sent.sent) console.error("[password-reset] email not sent:", sent.reason);
  } catch (e) {
    console.error("[password-reset] failed:", e instanceof Error ? e.name : "unknown error");
  }
}
