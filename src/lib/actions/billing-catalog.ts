"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { tasks } from "@trigger.dev/sdk";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { saveBillingSettings, saveProduct, saveOffer, getCurrentPrice } from "@/lib/db/billing-catalog";
import { OfferFormSchema, SettingsFormSchema } from "@/lib/billing/catalog-schema";
import { PLAN_INTERVALS } from "@/lib/billing/pricing";

// Admin › Plans and prices (spec 2026-11-21-plans-and-prices-design.md). Platform administration,
// gated by requireSuperAdmin() like the other /admin actions (D85), not withAction().

export type CatalogActionResult = { error?: string; moved?: number };

const SAVE_FAILED = "Could not save the change. Try again.";
const Id = z.uuid();
const PAGE = "/admin/plans";

const firstError = (e: z.ZodError) => e.issues[0]?.message ?? SAVE_FAILED;

async function run(write: () => Promise<CatalogActionResult>): Promise<CatalogActionResult> {
  try {
    const result = await write();
    if (!result.error) revalidatePath(PAGE);
    return result;
  } catch (e) {
    console.error("[admin catalog] could not save", e);
    return { error: SAVE_FAILED };
  }
}

export async function saveBillingSettingsAction(form: {
  inrPerUsd: string;
  planMarginPct: string;
  topupMarginPct: string;
  minMarginPct: string;
  note: string;
}): Promise<CatalogActionResult> {
  const admin = await requireSuperAdmin();
  const parsed = SettingsFormSchema.safeParse(form);
  if (!parsed.success) return { error: firstError(parsed.error) };
  return run(async () => {
    await saveBillingSettings(parsed.data, admin.userId);
    return {};
  });
}

/** Sets up the moves on Razorpay in the background (D593): many calls, so never in this request.
 *  An enqueue that fails is not the admin's problem: the nightly check sets them up. */
async function startMoves(productId: string): Promise<void> {
  try {
    await tasks.trigger("move-plan-price", { productId });
  } catch (e) {
    console.error("[admin catalog] could not start the plan moves; the nightly check sets them up", e);
  }
}

/** One step: a new plan or pack with its price, or an edit of everything about it. A changed
 *  price needs a reason; the result says how many agencies move to it from their next renewal. */
export async function saveOfferAction(form: {
  productId: string | null;
  kind: "plan" | "topup";
  name: string;
  description: string;
  active: boolean;
  amount: string;
  credits: string;
  reason: string;
}): Promise<CatalogActionResult> {
  const admin = await requireSuperAdmin();
  if (form.productId !== null && !Id.safeParse(form.productId).success) return { error: "Plan not found." };
  const parsed = OfferFormSchema.safeParse(form);
  if (!parsed.success) return { error: firstError(parsed.error) };
  const o = parsed.data;
  const intervalMonths = o.kind === "plan" ? PLAN_INTERVALS[0] : null;
  return run(async () => {
    if (form.productId !== null && o.reason === "") {
      const current = await getCurrentPrice(form.productId, intervalMonths);
      if (current && (current.amountMinor !== o.amount || current.credits !== o.credits)) return { error: "Add a reason for the new price." };
    }
    const { productId, priceChanged, moved } = await saveOffer(
      { productId: form.productId, kind: o.kind, name: o.name, description: o.description, active: form.active, amountMinor: o.amount, credits: o.credits, intervalMonths, reason: o.reason || null },
      admin.userId,
    );
    if (o.kind === "plan" && priceChanged && moved > 0) await startMoves(productId);
    return { moved };
  });
}

/** Show or hide a plan or pack for new purchases. Agencies already on it keep it. */
export async function setOfferShownAction(form: { productId: string; kind: "plan" | "topup"; name: string; description: string | null; shown: boolean }): Promise<CatalogActionResult> {
  const admin = await requireSuperAdmin();
  if (!Id.safeParse(form.productId).success) return { error: "Plan not found." };
  return run(async () => {
    const id = await saveProduct({ id: form.productId, kind: form.kind, name: form.name, description: form.description, active: form.shown }, admin.userId);
    return id ? {} : { error: "Plan not found." };
  });
}
