import * as z from "zod";

export const LoginSchema = z.object({
  email: z.email({ error: "Enter a valid email." }).trim(),
  password: z.string().min(1, { error: "Enter your password." }),
});

export type LoginFields = z.infer<typeof LoginSchema>;
