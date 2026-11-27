import * as z from "zod";
import { NewPasswordField, PASSWORDS_DONT_MATCH, passwordsMatch } from "./change-password-schema";

// Forgot password and the reset link (D598).

export const ForgotPasswordSchema = z.object({
  email: z.email({ error: "Enter a valid email." }).trim().max(320),
});

/** Same rule and confirmation check as change password; the token comes from the link, not here. */
export const ResetPasswordSchema = z
  .object({ password: NewPasswordField, confirmPassword: z.string() })
  .refine(passwordsMatch, PASSWORDS_DONT_MATCH);

/** The one answer to every request, whether or not an account exists for the email. */
export const RESET_LINK_SENT = "If an account exists for that email, we've sent a link to set a new password. It works for 1 hour.";
export const RESET_TOO_MANY = "We've just sent a link. Check your inbox, or try again in a minute.";
export const LINK_EXPIRED = "This link has expired or was already used.";

/** One reset email per address per minute. The link itself lasts the sign-in service's email
 *  link lifetime, 1 hour (its default). */
export const RESET_COOLDOWN_MS = 60_000;
