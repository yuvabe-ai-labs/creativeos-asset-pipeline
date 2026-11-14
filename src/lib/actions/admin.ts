"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import {
  getOrgById,
  updateOrgCreditLimit,
  resetMemberPassword,
  generateTempPassword,
} from "@/lib/db/organizations";
import {
  parseCreditLimit,
  parseResetPassword,
} from "@/lib/orgs/org-schema";
import { CreateAgencySchema } from "@/lib/people/schema";
import { createAgency, resendOwnerInvite } from "@/lib/people/ops";
import { getDisplayName } from "@/lib/db/profiles";
import { logImpersonationEvent } from "@/lib/db/impersonation-audit";

// This file's actions are deliberately NOT gated by withAction() (Stage 4's
// impersonation write-gate). They're /admin platform-administration actions
// (requireSuperAdmin()-gated already) — D85 draws an explicit line between
// "administering the platform" via /admin and "acting as an org" via impersonation,
// and these actions' target orgId is an explicit caller-supplied parameter (or, for
// createAgencyAction, doesn't exist yet) that's never correlated with whatever org an
// operator happens to be impersonating elsewhere in the same session. Gating them was
// tried and reverted (review round 2): it both spuriously blocked unrelated /admin
// work during an unrelated impersonation session, and made the impersonation_audit_log
// misattribute the write's target org (it logs the impersonated org, not the org this
// action actually touched — since withAction() has no way to know the two differ).
// See docs/superpowers/plans/2026-08-09-impersonation-stage4-fixes-2.md and the
// ALLOWLIST entries in src/lib/actions/with-action-coverage.test.ts.

export type CreateAgencyState =
  | { error?: string; result?: { orgId: string; email: string; link: string; emailed: boolean } }
  | undefined;

// Spec §6.6 "Add an agency": the agency and its owner invite in one step. The owner signs up from
// the email (or the copied link) and can do everything in the agency. No temporary password.
export async function createAgencyAction(_prev: CreateAgencyState, formData: FormData): Promise<CreateAgencyState> {
  const admin = await requireSuperAdmin();
  const parsed = CreateAgencySchema.safeParse({ name: formData.get("name"), email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the name and email." };
  const name = (await getDisplayName(admin.userId)) ?? "Yuvabe";
  try {
    const result = await createAgency(parsed.data.name, parsed.data.email, { userId: admin.userId, name });
    if (!result.ok) return { error: result.error };
    await logImpersonationEvent({ operatorId: admin.userId, targetOrgId: result.value.orgId, eventType: "admin_action", detail: { action: "create_agency", email: parsed.data.email } });
    revalidatePath("/admin");
    return { result: { ...result.value, email: parsed.data.email } };
  } catch (e) {
    console.error("[admin] could not create the agency", e);
    return { error: "Could not create the agency." };
  }
}

// The agencies list's Resend for an owner who hasn't signed up: a new link, emailed and shown.
export async function resendOwnerInviteAction(orgId: string): Promise<{ error?: string; link?: string; emailed?: boolean }> {
  const admin = await requireSuperAdmin();
  const [org, name] = await Promise.all([getOrgById(orgId), getDisplayName(admin.userId)]);
  if (!org) return { error: "Agency not found." };
  try {
    const result = await resendOwnerInvite({ orgId, orgName: org.name }, { userId: admin.userId, name: name ?? "Yuvabe" });
    if (!result.ok) return { error: result.error };
    await logImpersonationEvent({ operatorId: admin.userId, targetOrgId: orgId, eventType: "admin_action", detail: { action: "resend_owner_invite" } });
    return { link: result.value.link, emailed: result.value.emailed };
  } catch (e) {
    console.error("[admin] could not resend the owner invite", e);
    return { error: "Could not send the invite." };
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
