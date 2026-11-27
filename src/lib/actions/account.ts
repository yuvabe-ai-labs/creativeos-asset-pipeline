"use server";

import { redirect } from "next/navigation";
import { resolveCallerContext } from "@/lib/dal";
import { createSSRServerClient } from "@/lib/supabase/ssr-server";
import { setOwnPassword } from "@/lib/auth/set-own-password";
import { ChangePasswordSchema } from "@/lib/auth/change-password-schema";

export type ChangePasswordState = { error?: string } | undefined;

// setOwnPassword clears the must-change flag before refreshing the session (the order matters;
// see its note). The reset link (D598) sets the password through the same function.
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
  const set = await setOwnPassword(supabase, {
    userId: caller.userId,
    password: parsed.data.password,
    clearMustChange: true,
  });
  if (set.error) return { error: set.error };

  redirect("/");
}
