"use server";

import { redirect } from "next/navigation";
import { resolveCallerContext } from "@/lib/dal";
import { createSSRServerClient } from "@/lib/supabase/ssr-server";
import { setMustChangePassword } from "@/lib/db/organizations";
import { ChangePasswordSchema } from "@/lib/auth/change-password-schema";

export type ChangePasswordState = { error?: string } | undefined;

// Order matters here: the flag must be cleared BEFORE the session is refreshed. If the order
// were reversed, the refreshed access token would still carry the old (true) flag baked in,
// and proxy.ts's check would bounce the user right back to /account/password even though
// they just successfully changed it.
export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const caller = await resolveCallerContext();

  const parsed = ChangePasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid password." };
  }

  const supabase = await createSSRServerClient();
  const { error: updateErr } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (updateErr) {
    return { error: updateErr.message };
  }

  await setMustChangePassword(caller.userId, false);

  // Force a fresh access token NOW, reflecting the just-cleared flag — see the ordering
  // note above.
  await supabase.auth.refreshSession();

  redirect("/");
}
