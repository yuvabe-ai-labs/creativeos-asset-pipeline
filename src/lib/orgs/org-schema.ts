import * as z from "zod";

// "" / whitespace → null (unlimited). "0" is a valid (very restrictive) limit, not
// unlimited — only blank means unlimited. Otherwise a non-negative finite number, or throw.
export function parseCreditLimit(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Credit limit must be a non-negative number, or blank for unlimited.");
  }
  return n;
}

export const CreateOrgSchema = z.object({
  name: z.string().min(2, { error: "Organization name is required." }).trim(),
  email: z.email({ error: "Enter a valid email." }).trim(),
  displayName: z.string().min(2, { error: "Owner display name is required." }).trim(),
  creditLimit: z.string(), // parsed by parseCreditLimit; "" = unlimited
});

export type CreateOrgFields = z.infer<typeof CreateOrgSchema>;
