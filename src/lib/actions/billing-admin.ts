"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { setBillingMode, grantCredits, takeBackCredits, setGrantEnd, type BillingMode, type AdminGrantKind } from "@/lib/db/billing-admin";
import { BillingModeSchema, GrantEndSchema, GrantFormSchema, GrantKindField, TakeBackSchema } from "@/lib/billing/admin-schema";

// The agency page's Billing tab (spec 2026-11-20-admin-agency-billing-design.md). Like the other
// /admin actions (admin.ts), these administer the platform rather than act as an agency, so they
// are gated by requireSuperAdmin(), not withAction() (D85).

export type BillingActionResult = { error?: string };

const SAVE_FAILED = "Could not save the change. Try again.";
const Id = z.uuid();

function firstError(e: z.ZodError): string {
  return e.issues[0]?.message ?? SAVE_FAILED;
}

async function run(orgId: string, write: () => Promise<string | undefined>): Promise<BillingActionResult> {
  try {
    const refused = await write();
    if (refused) return { error: refused };
    revalidatePath(`/admin/orgs/${orgId}`);
    return {};
  } catch (e) {
    console.error("[admin billing] could not save", e);
    return { error: SAVE_FAILED };
  }
}

export async function setBillingModeAction(orgId: string, mode: BillingMode, reason: string): Promise<BillingActionResult> {
  const admin = await requireSuperAdmin();
  if (!Id.safeParse(orgId).success) return { error: "Agency not found." };
  const parsed = BillingModeSchema.safeParse({ mode, reason });
  if (!parsed.success) return { error: firstError(parsed.error) };
  return run(orgId, async () => {
    const changed = await setBillingMode(orgId, parsed.data.mode, admin.userId, parsed.data.reason);
    return changed ? undefined : "The agency already has this billing.";
  });
}

export async function grantCreditsAction(orgId: string, kind: AdminGrantKind, credits: string, day: string, reason: string): Promise<BillingActionResult> {
  const admin = await requireSuperAdmin();
  if (!Id.safeParse(orgId).success) return { error: "Agency not found." };
  if (!GrantKindField.safeParse(kind).success) return { error: SAVE_FAILED };
  const parsed = GrantFormSchema.safeParse({ credits, day, reason });
  if (!parsed.success) return { error: firstError(parsed.error) };
  return run(orgId, async () => {
    const id = await grantCredits(orgId, kind, parsed.data.credits, parsed.data.day, admin.userId, parsed.data.reason);
    return id ? undefined : "Agency not found.";
  });
}

export async function takeBackCreditsAction(orgId: string, grantId: string, credits: string, reason: string): Promise<BillingActionResult> {
  const admin = await requireSuperAdmin();
  if (!Id.safeParse(orgId).success || !Id.safeParse(grantId).success) return { error: "Credits not found." };
  const parsed = TakeBackSchema.safeParse({ credits, reason });
  if (!parsed.success) return { error: firstError(parsed.error) };
  return run(orgId, async () => {
    const answer = await takeBackCredits(grantId, parsed.data.credits, admin.userId, parsed.data.reason);
    if (answer === "too_many") return "That's more than is left on these credits.";
    if (answer === "not_found") return "Credits not found.";
    return undefined;
  });
}

/** `day: null` ends the credits now. */
export async function setGrantEndAction(orgId: string, grantId: string, day: string | null, reason: string): Promise<BillingActionResult> {
  const admin = await requireSuperAdmin();
  if (!Id.safeParse(orgId).success || !Id.safeParse(grantId).success) return { error: "Credits not found." };
  const parsed = GrantEndSchema.safeParse({ day, reason });
  if (!parsed.success) return { error: firstError(parsed.error) };
  return run(orgId, async () => {
    const answer = await setGrantEnd(grantId, parsed.data.day, admin.userId, parsed.data.reason);
    return answer === "not_found" ? "Credits not found." : undefined;
  });
}
