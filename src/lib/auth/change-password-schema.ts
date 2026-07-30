import * as z from "zod";

// Mirrors login-schema.ts's shape. 8-char minimum matches the existing convention in
// src/lib/orgs/org-schema.ts's parseResetPassword (reset-password-dialog.tsx's placeholder
// copy) — not a new rule, the same floor applied everywhere else a password gets set.
export const ChangePasswordSchema = z
  .object({
    password: z.string().min(8, { error: "Password must be at least 8 characters." }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Passwords don't match.",
    path: ["confirmPassword"],
  });

export type ChangePasswordFields = z.infer<typeof ChangePasswordSchema>;
