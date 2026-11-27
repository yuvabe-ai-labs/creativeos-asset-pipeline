import { describe, it, expect } from "vitest";
import { usageNotice, usageTiles, roundPace, type UsageStanding } from "../usage-standing";
import type { UsageOverview } from "../usage-overview";
import type { OwnerBillingSummary } from "../summary";

const NOW = new Date("2026-11-27T06:00:00Z");
const month = (over: Partial<UsageOverview> = {}): UsageOverview => ({
  period: "this_month",
  from: "2026-10-31T18:30:00.000Z",
  to: "2026-11-30T18:30:00.000Z",
  total: 300_000,
  runs: 420,
  previousTotal: 250_000,
  last7: 70_000,
  prev7: 50_000,
  days: [],
  groups: { kind: [], model: [], member: [], client: [], canvas: [] },
  ...over,
});
const summary = (over: Partial<OwnerBillingSummary>): OwnerBillingSummary => ({ mode: "plans", state: "ok", left: 600_000, total: 1_150_000, freeLeft: 0, freeEndsAt: null, planEndsAt: null, ...over });
const plan = { status: "active" as const, planName: "Starter", amountMinor: 1_200_000, endsAt: "2026-12-05T04:00:00Z", paymentDueSince: null };
const paying = (over: Partial<Extract<UsageStanding, { mode: "plans" }>> = {}): UsageStanding => ({ mode: "plans", summary: summary({}), plan, planRunning: true, grants: [], ...over });
const values = (s: UsageStanding, m = month()) => usageTiles(s, m, m, NOW).map((t) => [t.label, t.value]);

describe("the Usage page's four numbers (D597)", () => {
  it("all good: credits left, used, the pace and that they last past the renewal", () => {
    expect(values(paying())).toEqual([
      ["Credits left", "6,00,000"],
      ["Used this month", "3,00,000"],
      ["Daily pace", "10,000"],
      ["Lasts until", "Past 5 Dec"],
    ]);
    const pace = usageTiles(paying(), month(), month(), NOW)[2];
    expect(pace.sub).toBe("A day over the last 7 days, up 40% on the week before");
  });

  it("running low: the day they run out, before the renewal, and a notice to top up", () => {
    const s = paying({ summary: summary({ left: 50_000, state: "low" }) });
    const lasts = usageTiles(s, month(), month(), NOW)[3];
    expect(lasts).toMatchObject({ value: "About 2 Dec", tone: "warn", sub: "Plan renews 5 Dec 2026" });
    expect(usageNotice(s, month(), NOW)).toMatchObject({ title: "Credits are running low", action: "top_up" });
    expect(usageNotice(s, month(), NOW)?.body).toContain("run out around 2 Dec 2026, before your plan renews on 5 Dec 2026");
  });

  it("payment due: runs paused, the amount with GST, and Pay now with the date the plan ends", () => {
    const s = paying({ plan: { ...plan, status: "payment_due", paymentDueSince: "2026-11-26T00:30:00Z" }, planRunning: false });
    expect(values(s)[0]).toEqual(["AI runs", "Paused"]);
    expect(values(s)[1]).toEqual(["Payment due", "₹14,160"]);
    const n = usageNotice(s, month(), NOW);
    expect(n).toMatchObject({ tone: "bad", action: "pay" });
    expect(n?.body).toContain("₹14,160 for Starter is due.");
    expect(n?.body).toContain("If it isn't paid by 26 Dec 2026, the plan ends.");
  });

  it("free credits ending with no plan: says when, and offers the plans", () => {
    const s = paying({ plan: null, planRunning: false, summary: summary({ state: "free", left: 18_000, total: 50_000, freeLeft: 18_000, freeEndsAt: "2026-11-30T18:30:00.000Z" }) });
    expect(values(s)[0]).toEqual(["Free credits left", "18,000"]);
    expect(usageTiles(s, month(), month(), NOW)[3].sub).toBe("Free credits end 30 Nov 2026");
    expect(usageNotice(s, month(), NOW)).toMatchObject({ title: "Your free credits end on 30 Nov 2026", action: "plans" });
  });

  it("nothing used yet: no pace and too early to tell, and no notice", () => {
    const empty = month({ total: 0, runs: 0, previousTotal: 0, last7: 0, prev7: 0 });
    expect(values(paying(), empty).slice(2)).toEqual([["Daily pace", "None yet"], ["Lasts until", "Too early to tell"]]);
    expect(usageNotice(paying(), empty, NOW)).toBeNull();
  });

  it("managed with a limit: left of the limit, and when it is reached at this pace", () => {
    const s: UsageStanding = { mode: "managed", limit: 500_000 };
    expect(values(s)).toEqual([
      ["Left this month", "2,00,000"],
      ["Used this month", "3,00,000"],
      ["Daily pace", "10,000"],
      ["Lasts until", "Past 30 Nov"],
    ]);
    expect(usageNotice(s, month(), NOW)).toBeNull();
  });

  it("managed near the limit: a notice with no action, and runs out before the 1st", () => {
    const s: UsageStanding = { mode: "managed", limit: 330_000 };
    expect(usageNotice(s, month(), NOW)).toMatchObject({ tone: "warn", title: "90% of this month's credits used", action: null });
    expect(usageTiles(s, month(), month(), NOW)[3]).toMatchObject({ value: "About 30 Nov", tone: "warn" });
    expect(usageNotice({ mode: "managed", limit: 300_000 }, month(), NOW)).toMatchObject({ tone: "bad", title: "This month's credits are used up" });
  });

  it("managed with no limit: used, last month, the pace and the runs", () => {
    expect(values({ mode: "managed", limit: null })).toEqual([
      ["Used this month", "3,00,000"],
      ["Last month", "2,50,000"],
      ["Daily pace", "10,000"],
      ["Runs", "420"],
    ]);
  });

  it("rounds a large pace to hundreds", () => {
    expect(roundPace(12_345)).toBe(12_300);
    expect(roundPace(456.4)).toBe(456);
  });
});
