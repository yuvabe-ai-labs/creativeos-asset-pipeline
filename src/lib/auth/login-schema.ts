import * as z from "zod";

export const LoginSchema = z.object({
  email: z.email({ error: "Enter a valid email." }).trim(),
  password: z.string().min(1, { error: "Enter your password." }),
  // An unchecked checkbox submits nothing at all, so absence means "not remembered".
  // Checked submits "on" (or "true" from Base UI's hidden input, depending on `value`).
  remember: z
    .union([z.literal("on"), z.literal("true"), z.literal("1")])
    .optional()
    .transform((v) => v !== undefined),
});

export type LoginFields = z.infer<typeof LoginSchema>;
