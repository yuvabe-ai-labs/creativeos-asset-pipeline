import { formatDay, lastDayOf } from "./dates";
import type { BillingMode, GrantKind } from "./grants";
import { formatIstDate } from "@/lib/admin/ist";
import { refusalWords, type MoveRefusal } from "./plan-move-copy";
import { formatRupees } from "./pricing";

// The agency page's billing log, one line per change (billing_log, migration 0091).

const MODE: Record<BillingMode, string> = { managed: "Managed by Yuvabe", plans: "Pays for a plan" };
const KIND_WORDS: Record<GrantKind, string> = { free: "free credits", plan: "plan credits", topup: "top-up credits", admin: "added credits" };

type Change = { action: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; createdAt: string };

const n = (v: unknown) => Number(v ?? 0).toLocaleString("en-US");
const kindWords = (v: unknown) => KIND_WORDS[v as GrantKind] ?? "credits";
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function describeBillingChange(c: Change): string {
  const after = c.after ?? {};
  const before = c.before ?? {};
  switch (c.action) {
    case "billing_mode":
      return `Billing changed to ${MODE[after.billing_mode as BillingMode] ?? "another kind"}`;
    case "grant": {
      const until = `until ${formatDay(lastDayOf(String(after.ends_at)))}`;
      return after.kind === "free" ? `Gave ${n(after.credits)} free credits ${until}` : `Added ${n(after.credits)} extra credits ${until}`;
    }
    case "take_back": {
      const taken = Number(before.credits ?? 0) - Number(after.credits ?? 0);
      return `Took back ${n(taken)} ${kindWords(after.kind)} (${n(before.credits)} to ${n(after.credits)})`;
    }
    case "grant_end": {
      // "End now" sends the time of the change; the database may nudge it past the start.
      const endedNow = new Date(String(after.ends_at)).getTime() - new Date(c.createdAt).getTime() < 60_000;
      if (endedNow) return `Ended ${kindWords(after.kind)}`;
      return `${capital(kindWords(after.kind))} now end after ${formatDay(lastDayOf(String(after.ends_at)))}`;
    }
    case "plan_move": {
      // A new plan price set up on Razorpay for the next renewal, or why it couldn't be (D593).
      const to = `${formatRupees(Number(after.amount_minor ?? 0))} a month`;
      const refused = after.refused as MoveRefusal | null | undefined;
      if (refused) {
        return refused === "other"
          ? `Couldn't move the plan to ${to}. It stays at ${formatRupees(Number(before.amount_minor ?? 0))} until it changes plan`
          : `Couldn't move the plan to ${to}: it ${refusalWords(refused, 1).replace(/^pays/, "is paid")}. It stays at ${formatRupees(Number(before.amount_minor ?? 0))} until it changes plan`;
      }
      const from = typeof after.starts_at === "string" ? ` from the renewal on ${formatIstDate(new Date(after.starts_at))}` : " from the next renewal";
      return `Plan moves from ${formatRupees(Number(before.amount_minor ?? 0))} to ${to}${from}`;
    }
    default:
      return "Billing changed";
  }
}
