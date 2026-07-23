"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { createOrgWithOwner, updateOrgCreditLimit } from "@/lib/db/organizations";
import { CreateOrgSchema, parseCreditLimit } from "@/lib/orgs/org-schema";

export type CreateOrgState =
  | { error?: string; result?: { email: string; tempPassword: string; orgId: string } }
  | undefined;

export async function createOrgAction(
  _prev: CreateOrgState,
  formData: FormData,
): Promise<CreateOrgState> {
  await requireSuperAdmin();

  const parsed = CreateOrgSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    displayName: formData.get("displayName"),
    creditLimit: formData.get("creditLimit") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  let creditLimit: number | null;
  try {
    creditLimit = parseCreditLimit(parsed.data.creditLimit);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Invalid credit limit." };
  }

  try {
    const { orgId, tempPassword } = await createOrgWithOwner({
      name: parsed.data.name,
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      creditLimit,
    });
    revalidatePath("/admin");
    return { result: { email: parsed.data.email, tempPassword, orgId } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create organization." };
  }
}

export async function updateOrgCreditLimitAction(
  orgId: string,
  rawLimit: string,
): Promise<{ error?: string }> {
  await requireSuperAdmin();
  let limit: number | null;
  try {
    limit = parseCreditLimit(rawLimit);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Invalid credit limit." };
  }
  try {
    await updateOrgCreditLimit(orgId, limit);
    revalidatePath(`/admin/orgs/${orgId}`);
    revalidatePath("/admin");
    return {};
  } catch {
    return { error: "Failed to update credit limit." };
  }
}
