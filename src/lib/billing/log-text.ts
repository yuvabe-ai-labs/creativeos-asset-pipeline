import { formatDay, lastDayOf } from "./dates";
import type { BillingMode, GrantKind } from "./grants";

// The agency page's billing log, one line per change (billing_log, migration 0067).

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
      return after.kind === "free" ? `Gave ${n(after.credits)} free credits ${until}` : `Added ${n(after.credits)} credits ${until}`;
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
    default:
      return "Billing changed";
  }
}
