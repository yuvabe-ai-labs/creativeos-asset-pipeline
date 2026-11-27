import * as z from "zod";
import { isDay, todayIst } from "./dates";

// Admin's billing forms (spec 2026-11-20-admin-agency-billing-design.md). Values arrive as typed
// text; each field has one plain message.

const CREDITS_MESSAGE = "Enter the credits as a whole number above 0.";

export const CreditsField = z
  .string()
  .transform((s) => s.trim().replace(/,/g, ""))
  .pipe(
    z
      .string()
      .regex(/^\d+$/, { error: CREDITS_MESSAGE })
      .transform(Number)
      .pipe(z.number().int().min(1, { error: CREDITS_MESSAGE }).max(1_000_000_000, { error: CREDITS_MESSAGE })),
  );

/** A day from an `Input type="date"`: today (India time) or later. */
export const DayField = z
  .string({ error: "Pick a day." })
  .refine(isDay, { error: "Pick a day." })
  .refine((d) => d >= todayIst(), { error: "Pick today or a later day." });

export const ReasonField = z.string().trim().min(1, { error: "Add a reason." }).max(500, { error: "Keep the reason under 500 characters." });

export const GrantKindField = z.enum(["free", "admin"]);

export const GrantFormSchema = z.object({ credits: CreditsField, day: DayField, reason: ReasonField });
export const TakeBackSchema = z.object({ credits: CreditsField, reason: ReasonField });
/** `day: null` ends the credits now. */
export const GrantEndSchema = z.object({ day: DayField.nullable(), reason: ReasonField });
export const BillingModeSchema = z.object({ mode: z.enum(["managed", "plans"]), reason: ReasonField });

/** Add an agency's "Free credits to start": none (null), or both an amount and a last day. */
export const FreeCreditsFormSchema = z
  .object({ give: z.string(), credits: z.string(), day: z.string() })
  .transform((v, ctx) => {
    if (v.give !== "1") return null;
    const credits = CreditsField.safeParse(v.credits);
    if (!credits.success) {
      ctx.addIssue({ code: "custom", message: CREDITS_MESSAGE });
      return z.NEVER;
    }
    if (!v.day) {
      ctx.addIssue({ code: "custom", message: "Pick when the free credits expire." });
      return z.NEVER;
    }
    const day = DayField.safeParse(v.day);
    if (!day.success) {
      ctx.addIssue({ code: "custom", message: day.error.issues[0]?.message ?? "Pick a day." });
      return z.NEVER;
    }
    return { credits: credits.data, day: day.data };
  });
