"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { saveBillingSettings, saveProduct, addPrice, setPriceActive } from "@/lib/db/billing-catalog";
import { PriceFormSchema, ProductFormSchema, SettingsFormSchema } from "@/lib/billing/catalog-schema";

// Admin › Plans and prices (spec 2026-11-21-plans-and-prices-design.md). Platform administration,
// gated by requireSuperAdmin() like the other /admin actions (D85), not withAction().

export type CatalogActionResult = { error?: string; moved?: number };

const SAVE_FAILED = "Could not save the change. Try again.";
const Id = z.uuid();
const PAGE = "/admin/plans";

const firstError = (e: z.ZodError) => e.issues[0]?.message ?? SAVE_FAILED;

async function run<T extends CatalogActionResult>(write: () => Promise<T>): Promise<CatalogActionResult> {
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

/** Adds a plan or pack (`id` null), or changes its name, description or visibility. */
export async function saveProductAction(form: {
  id: string | null;
  kind: "plan" | "topup";
  name: string;
  description: string;
  active?: boolean;
}): Promise<CatalogActionResult> {
  const admin = await requireSuperAdmin();
  if (form.id !== null && !Id.safeParse(form.id).success) return { error: "Plan not found." };
  const parsed = ProductFormSchema.safeParse(form);
  if (!parsed.success) return { error: firstError(parsed.error) };
  return run(async () => {
    const id = await saveProduct({ id: form.id, ...parsed.data, active: form.active }, admin.userId);
    return id ? {} : { error: "Plan not found." };
  });
}

/** Adds a price; `replaces` hides that price and moves its agencies to this one from their next
 *  payment. The result says how many moved. */
export async function addPriceAction(form: {
  productId: string;
  kind: "plan" | "topup";
  amount: string;
  credits: string;
  intervalMonths: number | null;
  replaces: string | null;
  reason: string;
}): Promise<CatalogActionResult> {
  const admin = await requireSuperAdmin();
  if (!Id.safeParse(form.productId).success || (form.replaces !== null && !Id.safeParse(form.replaces).success)) {
    return { error: "Price not found." };
  }
  const parsed = PriceFormSchema.safeParse({ ...form, replacing: form.replaces !== null });
  if (!parsed.success) return { error: firstError(parsed.error) };
  return run(async () => {
    const { moved } = await addPrice(
      {
        productId: form.productId,
        amountMinor: parsed.data.amount,
        credits: parsed.data.credits,
        intervalMonths: parsed.data.intervalMonths,
        replaces: form.replaces,
        reason: parsed.data.reason || null,
      },
      admin.userId,
    );
    return { moved };
  });
}

export async function setPriceActiveAction(priceId: string, active: boolean): Promise<CatalogActionResult> {
  const admin = await requireSuperAdmin();
  if (!Id.safeParse(priceId).success) return { error: "Price not found." };
  return run(async () => {
    await setPriceActive(priceId, active, admin.userId);
    return {};
  });
}
