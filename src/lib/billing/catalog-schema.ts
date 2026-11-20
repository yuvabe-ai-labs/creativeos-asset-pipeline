import * as z from "zod";
import { CreditsField, ReasonField } from "./admin-schema";
import { PLAN_INTERVALS } from "./pricing";

// Admin's Plans and prices forms (spec 2026-11-21-plans-and-prices-design.md). Typed text in,
// stored units out: rupees become paise.

const RUPEES_MESSAGE = "Enter the price in rupees, for example 10,100.";

/** "10,100" or "10100.50" rupees → paise. */
export const RupeesField = z
  .string()
  .transform((s) => s.trim().replace(/[₹,\s]/g, ""))
  .pipe(
    z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, { error: RUPEES_MESSAGE })
      .transform((s) => Math.round(Number(s) * 100))
      .pipe(z.number().int().min(100, { error: RUPEES_MESSAGE }).max(1_000_000_000, { error: RUPEES_MESSAGE })),
  );

const percent = (label: string) =>
  z
    .string()
    .transform((s) => s.trim().replace(/%$/, ""))
    .pipe(
      z
        .string()
        .regex(/^\d+(\.\d{1,2})?$/, { error: `Enter the ${label} as a number, for example 20.` })
        .transform(Number)
        .pipe(z.number().max(1000, { error: `Enter the ${label} as a number, for example 20.` })),
    );

export const SettingsFormSchema = z.object({
  inrPerUsd: z
    .string()
    .transform((s) => s.trim().replace(/^₹/, ""))
    .pipe(
      z
        .string()
        .regex(/^\d+(\.\d{1,4})?$/, { error: "Enter the rupees to a dollar, for example 100." })
        .transform(Number)
        .pipe(z.number().gt(0, { error: "Enter the rupees to a dollar, for example 100." }).max(1000, { error: "Enter the rupees to a dollar, for example 100." })),
    ),
  planMarginPct: percent("plan margin"),
  topupMarginPct: percent("top-up margin"),
  minMarginPct: percent("minimum margin"),
  note: ReasonField,
});

export const ProductKindField = z.enum(["plan", "topup"]);

export const ProductFormSchema = z.object({
  kind: ProductKindField,
  name: z.string().trim().min(2, { error: "Enter a name." }).max(60, { error: "Keep the name under 60 characters." }),
  description: z
    .string()
    .trim()
    .max(300, { error: "Keep the description under 300 characters." })
    .transform((s) => (s === "" ? null : s)),
});

export const PriceFormSchema = z
  .object({
    kind: ProductKindField,
    amount: RupeesField,
    credits: CreditsField,
    intervalMonths: z.number().int().nullable(),
    reason: z.string().trim().max(500),
    replacing: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "plan" && !(PLAN_INTERVALS as readonly number[]).includes(v.intervalMonths ?? -1)) {
      ctx.addIssue({ code: "custom", message: "Pick how often the plan is paid." });
    }
    if (v.kind === "topup" && v.intervalMonths !== null) {
      ctx.addIssue({ code: "custom", message: "A top-up pack is paid once." });
    }
    if (v.replacing && v.reason === "") ctx.addIssue({ code: "custom", message: "Add a reason." });
  });
