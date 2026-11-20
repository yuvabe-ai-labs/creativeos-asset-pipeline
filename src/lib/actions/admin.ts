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
import { AgencyIdSchema, CreateAgencySchema } from "@/lib/people/schema";
import { createAgency, inviteOwner, resendOwnerInvite } from "@/lib/people/ops";
import { getDisplayName } from "@/lib/db/profiles";
import { logImpersonationEvent } from "@/lib/db/impersonation-audit";
import { setBillingMode, grantCredits } from "@/lib/db/billing-admin";
import { FreeCreditsFormSchema } from "@/lib/billing/admin-schema";

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
  | {
      error?: string;
      /** limitNotSaved / billingNotSaved: the agency and its invite were made but the chosen credit
       *  limit, or the billing and free credits, weren't saved. */
      result?: { orgId: string; email: string; link: string; emailed: boolean; limitNotSaved?: true; billingNotSaved?: true };
    }
  | undefined;

// Spec §6.6 "Add an agency": the agency and its owner invite in one step, and its monthly credit
// limit (Unlimited unless one is set). The owner signs up from the email (or the copied link) and
// can do everything in the agency. No temporary password.
export async function createAgencyAction(_prev: CreateAgencyState, formData: FormData): Promise<CreateAgencyState> {
  const admin = await requireSuperAdmin();
  const parsed = CreateAgencySchema.safeParse({ name: formData.get("name"), email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the name and email." };
  // Billing (piece 2): managed by Yuvabe (the default, with the credit limit) or paying for a plan,
  // optionally with free credits. Everything is checked before the agency is made.
  const paying = formData.get("billingMode") === "plans";
  const free = FreeCreditsFormSchema.safeParse({
    give: paying ? String(formData.get("freeGive") ?? "") : "",
    credits: String(formData.get("freeCredits") ?? ""),
    day: String(formData.get("freeUntil") ?? ""),
  });
  if (!free.success) return { error: free.error.issues[0]?.message ?? "Check the free credits." };
  const freeCredits = free.data;
  // The same parsing as the agency page's credit limit editor; blank (the default) is Unlimited.
  // A paying agency has no monthly limit: its credits are what it is given or buys.
  let limit: number | null = null;
  if (!paying) {
    try {
      limit = parseCreditLimit(String(formData.get("creditLimit") ?? ""));
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Invalid credit limit." };
    }
  }
  try {
    const name = (await getDisplayName(admin.userId)) ?? "Yuvabe";
    const by = { userId: admin.userId, name };
    const result = freeCredits
      ? await createAgency(parsed.data.name, parsed.data.email, by, { freeCredits })
      : await createAgency(parsed.data.name, parsed.data.email, by);
    if (!result.ok) return { error: result.error };
    const orgId = result.value.orgId;
    // A new agency starts Unlimited, so only a set limit is written. The agency and its invite
    // exist by now: a failed write is reported beside the owner's link rather than as a failure.
    let savedLimit: number | null = null;
    let limitNotSaved = false;
    if (limit !== null) {
      try {
        await updateOrgCreditLimit(orgId, limit);
        savedLimit = limit;
      } catch (e) {
        console.error("[admin] could not save the new agency's credit limit", e);
        limitNotSaved = true;
      }
    }
    // Billing and free credits go the same way as the limit: reported beside the link if they fail.
    let billingNotSaved = false;
    if (paying) {
      try {
        await setBillingMode(orgId, "plans", admin.userId, "Added as paying for a plan");
        if (freeCredits) await grantCredits(orgId, "free", freeCredits.credits, freeCredits.day, admin.userId, "Free credits to start");
      } catch (e) {
        console.error("[admin] could not save the new agency's billing", e);
        billingNotSaved = true;
      }
    }
    await logImpersonationEvent({ operatorId: admin.userId, targetOrgId: orgId, eventType: "admin_action", detail: { action: "create_agency", email: parsed.data.email, limit: savedLimit } });
    revalidatePath("/admin");
    return {
      result: {
        ...result.value,
        email: parsed.data.email,
        ...(limitNotSaved ? { limitNotSaved: true as const } : {}),
        ...(billingNotSaved ? { billingNotSaved: true as const } : {}),
      },
    };
  } catch (e) {
    console.error("[admin] could not create the agency", e);
    return { error: "Could not create the agency." };
  }
}

export type OwnerInviteResult = { error?: string; email?: string; link?: string; emailed?: boolean };

// The agencies list's Resend for an owner who hasn't signed up: a new link, emailed and shown.
export async function resendOwnerInviteAction(orgId: string): Promise<OwnerInviteResult> {
  const admin = await requireSuperAdmin();
  if (!AgencyIdSchema.safeParse(orgId).success) return { error: "Agency not found." };
  try {
    const [org, name] = await Promise.all([getOrgById(orgId), getDisplayName(admin.userId)]);
    if (!org) return { error: "Agency not found." };
    const result = await resendOwnerInvite({ orgId, orgName: org.name }, { userId: admin.userId, name: name ?? "Yuvabe" });
    if (!result.ok) return { error: result.error };
    await logImpersonationEvent({ operatorId: admin.userId, targetOrgId: orgId, eventType: "admin_action", detail: { action: "resend_owner_invite", email: result.value.invite.email } });
    return { email: result.value.invite.email, link: result.value.link, emailed: result.value.emailed };
  } catch (e) {
    console.error("[admin] could not resend the owner invite", e);
    return { error: "Could not send the invite." };
  }
}

// The agencies list's Invite an owner, for an agency with no owner and no open owner invite
// (spec §6.6, D505): a new owner invite, emailed and shown.
export async function inviteOwnerAction(orgId: string, rawEmail: string): Promise<OwnerInviteResult> {
  const admin = await requireSuperAdmin();
  if (!AgencyIdSchema.safeParse(orgId).success) return { error: "Agency not found." };
  try {
    const [org, name] = await Promise.all([getOrgById(orgId), getDisplayName(admin.userId)]);
    if (!org) return { error: "Agency not found." };
    const result = await inviteOwner({ orgId, orgName: org.name }, rawEmail, { userId: admin.userId, name: name ?? "Yuvabe" });
    if (!result.ok) return { error: result.error };
    const email = result.value.invite.email;
    await logImpersonationEvent({ operatorId: admin.userId, targetOrgId: orgId, eventType: "admin_action", detail: { action: "invite_owner", email } });
    revalidatePath("/admin");
    return { email, link: result.value.link, emailed: result.value.emailed };
  } catch (e) {
    console.error("[admin] could not invite the owner", e);
    return { error: "Could not send the invite." };
  }
}

export async function updateOrgCreditLimitAction(
  orgId: string,
  rawLimit: string,
): Promise<{ error?: string }> {
  const admin = await requireSuperAdmin();
  let limit: number | null;
  try {
    limit = parseCreditLimit(rawLimit);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Invalid credit limit." };
  }
  try {
    await updateOrgCreditLimit(orgId, limit);
    await logImpersonationEvent({ operatorId: admin.userId, targetOrgId: orgId, eventType: "admin_action", detail: { action: "credit_limit", limit } });
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
  const admin = await requireSuperAdmin();

  let password: string;
  try {
    password = parseResetPassword(rawPassword) ?? generateTempPassword();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Invalid password." };
  }

  try {
    await resetMemberPassword(orgId, userId, password);
    await logImpersonationEvent({ operatorId: admin.userId, targetOrgId: orgId, eventType: "admin_action", detail: { action: "reset_password", userId } });
    revalidatePath(`/admin/orgs/${orgId}`);
    return { result: { tempPassword: password } };
  } catch {
    return { error: "Failed to reset password." };
  }
}
