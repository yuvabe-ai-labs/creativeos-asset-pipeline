import "server-only";
import type { createSSRServerClient } from "@/lib/supabase/ssr-server";
import { setMustChangePassword } from "@/lib/db/organizations";

type SessionClient = Awaited<ReturnType<typeof createSSRServerClient>>;

/** Plain words for a refused password, never the sign-in service's own message. */
export const SAME_PASSWORD = "Choose a password different from your current one.";
export const PASSWORD_NOT_SET = "Your password could not be set. Try again.";

/**
 * Sets the signed-in person's own password on their session: the change-password page and the
 * reset link (D598) both end here.
 *
 * When `clearMustChange` is set, the must-change flag is cleared BEFORE the session is refreshed.
 * If the order were reversed, the refreshed access token would still carry the old (true) flag,
 * and proxy.ts would bounce them straight back to /account/password.
 */
export async function setOwnPassword(
  supabase: SessionClient,
  { userId, password, clearMustChange }: { userId: string; password: string; clearMustChange: boolean },
): Promise<{ error?: string }> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    // Only the code, never the message or the password.
    console.error("[password] update refused:", error.code ?? error.status ?? "unknown");
    return { error: error.code === "same_password" ? SAME_PASSWORD : PASSWORD_NOT_SET };
  }
  if (clearMustChange) {
    await setMustChangePassword(userId, false);
    // A fresh access token now, reflecting the cleared flag (see the ordering note above).
    await supabase.auth.refreshSession();
  }
  return {};
}
