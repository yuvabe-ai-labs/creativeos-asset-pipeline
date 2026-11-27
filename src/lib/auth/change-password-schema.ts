import * as z from "zod";

// The one rule for a password someone sets themselves: change password, invite sign-up and the
// reset link (D598). 8 characters is the floor everywhere a password gets set (also
// src/lib/orgs/org-schema.ts's parseResetPassword). 72 is the most the sign-in service uses of a
// password; anything longer would be cut silently.
export const NewPasswordField = z
  .string()
  .min(8, { error: "Password must be at least 8 characters." })
  .max(72, { error: "Password must be 72 characters or fewer." });

/** The confirmation check, shared by every form with a Confirm password field. */
export function passwordsMatch(data: { password: string; confirmPassword: string }): boolean {
  return data.password === data.confirmPassword;
}
export const PASSWORDS_DONT_MATCH = { error: "Passwords don't match.", path: ["confirmPassword"] };

export const ChangePasswordSchema = z
  .object({ password: NewPasswordField, confirmPassword: z.string() })
  .refine(passwordsMatch, PASSWORDS_DONT_MATCH);

export type ChangePasswordFields = z.infer<typeof ChangePasswordSchema>;
