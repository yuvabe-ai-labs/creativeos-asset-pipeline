"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import {
  createOrgWithOwner,
  updateOrgCreditLimit,
  resetMemberPassword,
  generateTempPassword,
} from "@/lib/db/organizations";
import { CreateOrgSchema, parseCreditLimit, parseResetPassword } from "@/lib/orgs/org-schema";

// This file's three actions are deliberately NOT gated by withAction() (Stage 4's
// impersonation write-gate). They're /admin platform-administration actions
// (requireSuperAdmin()-gated already) — D85 draws an explicit line between
// "administering the platform" via /admin and "acting as an org" via impersonation,
// and these actions' target orgId is an explicit caller-supplied parameter (or, for
// createOrgAction, doesn't exist yet) that's never correlated with whatever org an
// operator happens to be impersonating elsewhere in the same session. Gating them was
// tried and reverted (review round 2): it both spuriously blocked unrelated /admin
// work during an unrelated impersonation session, and made the impersonation_audit_log
// misattribute the write's target org (it logs the impersonated org, not the org this
// action actually touched — since withAction() has no way to know the two differ).
// See docs/superpowers/plans/2026-08-09-impersonation-stage4-fixes-2.md and the
// ALLOWLIST entries in src/lib/actions/with-action-coverage.test.ts.

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

export type ResetPasswordState =
  | { error?: string; result?: { tempPassword: string } }
  | undefined;

export async function resetMemberPasswordAction(
  orgId: string,
  userId: string,
  rawPassword: string,
): Promise<ResetPasswordState> {
  await requireSuperAdmin();

  let password: string;
  try {
    password = parseResetPassword(rawPassword) ?? generateTempPassword();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Invalid password." };
  }

  try {
    await resetMemberPassword(orgId, userId, password);
    revalidatePath(`/admin/orgs/${orgId}`);
    return { result: { tempPassword: password } };
  } catch {
    return { error: "Failed to reset password." };
  }
}
