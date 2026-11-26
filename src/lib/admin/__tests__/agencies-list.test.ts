import { describe, it, expect } from "vitest";
import {
  ariaSort,
  countLine,
  creditPercent,
  DEFAULT_AGENCY_SORT,
  filterCounts,
  nextSort,
  searchAgencies,
  toAgencyRow,
  visibleAgencies,
  type AgencySource,
} from "../agencies-list";

const NOW = new Date("2026-11-26T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const daysAhead = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

const source = (over: Partial<AgencySource> = {}): AgencySource => ({
  id: "o1",
  name: "Acme",
  billingMode: "managed",
  monthlyLimit: null,
  clientCount: 2,
  hasOwner: true,
  ownerInvite: null,
  activity: { ownerEmail: "owner@acme.in", memberCount: 3, lastRunAt: daysAgo(1) },
  creditsUsedThisMonth: 0,
  grants: [],
  subscription: null,
  ...over,
});
const row = (over: Partial<AgencySource> = {}) => toAgencyRow(source(over), NOW);
const invite = (sentDays: number, expiresInDays: number) => ({ email: "new@acme.in", sentAt: daysAgo(sentDays), expiresAt: daysAhead(expiresInDays), link: "https://app/invite/t" });
const plan = (status: "active" | "payment_due" | "created" | "cancelling", over = {}) => ({ status, paymentDueSince: null, planName: "Growth", intervalMonths: 1, ...over });

describe("creditPercent", () => {
  it("rounds down, so 79.9% is not yet 80%", () => {
    expect(creditPercent(799, 1000)).toBe(79);
    expect(creditPercent(950, 1000)).toBe(95);
    expect(creditPercent(2000, 1000)).toBe(100);
    expect(creditPercent(0, 0)).toBe(100);
  });
});

describe("toAgencyRow: the one issue, most urgent first", () => {
  it("payment due beats everything, with how long ago the renewal failed", () => {
    const r = row({ billingMode: "plans", hasOwner: false, subscription: plan("payment_due", { paymentDueSince: daysAgo(3) }) });
    expect(r.issue).toEqual({ tone: "bad", label: "Payment due", note: "Renewal failed 3 days ago" });
    expect(r.fix).toEqual({ kind: "billing", label: "Open billing", href: "/admin/orgs/o1?tab=billing" });
    expect(r.billing).toMatchObject({ tone: "bad", label: "Growth · payment due", note: "Runs paused" });
    expect(r.rank).toBe(0);
  });

  it("an invited owner who hasn't joined: copy the stored link, or Resend once it has expired", () => {
    const open = row({ hasOwner: false, ownerInvite: invite(2, 5), activity: { ownerEmail: null, memberCount: 0, lastRunAt: null } });
    expect(open.issue).toMatchObject({ label: "Owner hasn't joined", note: "Invited 2 days ago" });
    expect(open.fix).toEqual({ kind: "copy_invite", link: "https://app/invite/t", email: "new@acme.in" });
    expect(open.ownerLine).toBe("new@acme.in · not joined");
    expect(open.ownerJoined).toBe(false);

    const expired = row({ hasOwner: false, ownerInvite: invite(9, -2) });
    expect(expired.fix).toEqual({ kind: "resend_invite" });
    expect(expired.issue?.note).toContain("expired");
  });

  it("no owner and no invite: Invite an owner", () => {
    const r = row({ hasOwner: false });
    expect(r.issue).toMatchObject({ tone: "warn", label: "No owner" });
    expect(r.fix).toEqual({ kind: "invite_owner" });
    expect(r.ownerLine).toBe("No owner");
  });

  it("free credits ending, for a paying agency with no plan yet", () => {
    const r = row({ billingMode: "plans", grants: [{ kind: "free", credits: 20000, used: 1000, endsAt: daysAhead(12.5) }] });
    expect(r.issue).toMatchObject({ tone: "warn", label: "Free credits end in 13 days", note: "No plan picked yet" });
    expect(r.billing).toMatchObject({ tone: "warn", label: "No plan yet", note: "Free credits" });
    expect(r.credits).toMatchObject({ used: 1000, limit: 20000, percent: 5 });
  });

  it("credits nearly gone at 80%: a managed limit, or a plan's open credits", () => {
    const managed = row({ monthlyLimit: 5000, creditsUsedThisMonth: 4620 });
    expect(managed.issue).toEqual({ tone: "warn", label: "92% of credits used", note: "380 left this month" });
    expect(managed.fix).toMatchObject({ kind: "billing", label: "Raise limit" });
    expect(managed.credits.bar).toBe("warn");

    const paying = row({ billingMode: "plans", subscription: plan("active"), grants: [{ kind: "plan", credits: 1000, used: 960, endsAt: daysAhead(10) }] });
    expect(paying.issue?.label).toBe("96% of credits used");
    expect(paying.fix).toMatchObject({ label: "Add credits" });
    expect(paying.credits.bar).toBe("bad");
    expect(paying.billing).toMatchObject({ tone: "ok", label: "Growth", note: "Renews monthly" });

    expect(row({ monthlyLimit: 5000, creditsUsedThisMonth: 3999 }).issue).toBeNull();
  });

  it("quiet for 30+ days only when it has run before", () => {
    expect(row({ activity: { ownerEmail: "a@b.in", memberCount: 1, lastRunAt: daysAgo(41) } }).issue).toEqual({ tone: "plain", label: "Quiet for 30+ days", note: "No runs for 41 days" });
    const never = row({ activity: { ownerEmail: "a@b.in", memberCount: 1, lastRunAt: null } });
    expect(never.issue).toBeNull();
    expect(never.activity.lastActive).toBe("Never");
    expect(never.quiet).toBe(false);
  });

  it("an activity read that failed shows as unknown, never as never active", () => {
    const r = row({ activity: null });
    expect(r.activity).toMatchObject({ known: false, lastActive: "—", days: null, size: "2 clients" });
    expect(r.ownerLine).toBe("—");
    expect(r.issue).toBeNull();
  });
});

describe("billing and credits", () => {
  it("managed: the monthly limit or Unlimited, and the used total alone with no limit", () => {
    expect(row({ monthlyLimit: 5000 }).billing).toMatchObject({ tone: "plain", label: "Managed", note: "5,000 a month" });
    const unlimited = row({ creditsUsedThisMonth: 182400 });
    expect(unlimited.billing.note).toBe("Unlimited");
    expect(unlimited.credits).toMatchObject({ limit: null, percent: null, noLimit: "Unlimited" });
    expect(unlimited.credits.tip).toBe("No monthly limit. 1,82,400 used this month.");
  });

  it("a paying agency's plan states", () => {
    expect(row({ billingMode: "plans", subscription: plan("cancelling") }).billing.note).toBe("Won't renew");
    expect(row({ billingMode: "plans", subscription: plan("active", { intervalMonths: 12 }) }).billing.note).toBe("Renews yearly");
    expect(row({ billingMode: "plans", subscription: plan("created") }).billing.label).toBe("No plan yet");
    const none = row({ billingMode: "plans" });
    expect(none.billing.note).toBe("No credits left");
    expect(none.credits).toMatchObject({ limit: null, noLimit: "No credits" });
  });
});

describe("search, filters, sort", () => {
  const rows = [
    row({ id: "a", name: "Tide Studio", monthlyLimit: 5000, creditsUsedThisMonth: 4620, activity: { ownerEmail: "maya@tide.in", memberCount: 4, lastRunAt: daysAgo(0) } }),
    row({ id: "b", name: "Coco", activity: { ownerEmail: "coco@yuvabe.com", memberCount: 1, lastRunAt: daysAgo(41) } }),
    row({ id: "c", name: "Northwind", billingMode: "plans", subscription: plan("payment_due"), activity: { ownerEmail: "nw@north.in", memberCount: 3, lastRunAt: daysAgo(1) } }),
    row({ id: "d", name: "Agency1", activity: { ownerEmail: "a1@yuvabe.com", memberCount: 2, lastRunAt: null } }),
    row({ id: "e", name: "nyka", hasOwner: false, ownerInvite: invite(108, -101), activity: { ownerEmail: null, memberCount: 0, lastRunAt: null }, creditsUsedThisMonth: 10 }),
  ];

  it("searches by name or owner email", () => {
    expect(searchAgencies(rows, "TIDE").map((r) => r.id)).toEqual(["a"]);
    expect(searchAgencies(rows, "yuvabe.com").map((r) => r.id)).toEqual(["b", "d"]);
    expect(searchAgencies(rows, "new@acme").map((r) => r.id)).toEqual(["e"]);
  });

  it("counts every chip over the searched rows", () => {
    expect(filterCounts(rows)).toEqual({ all: 5, attention: 3, plan: 1, managed: 4, notjoined: 1, quiet: 1 });
    expect(filterCounts(searchAgencies(rows, "yuvabe")).all).toBe(2);
  });

  it("sorts by need first, most recently active first within a level", () => {
    expect(visibleAgencies(rows, "", "all", DEFAULT_AGENCY_SORT).map((r) => r.id)).toEqual(["c", "a", "e", "b", "d"]);
    expect(visibleAgencies(rows, "", "attention", DEFAULT_AGENCY_SORT).map((r) => r.id)).toEqual(["c", "a", "e"]);
  });

  it("a second click reverses, except Needs attention; never-active sorts last both ways", () => {
    const byActive = nextSort(DEFAULT_AGENCY_SORT, "active");
    expect(byActive).toEqual({ key: "active", dir: 1 });
    expect(visibleAgencies(rows, "", "all", byActive).map((r) => r.id)).toEqual(["a", "c", "b", "d", "e"]);
    const reversed = nextSort(byActive, "active");
    expect(visibleAgencies(rows, "", "all", reversed).map((r) => r.id).slice(0, 3)).toEqual(["b", "c", "a"]);
    expect(nextSort(DEFAULT_AGENCY_SORT, "attention")).toEqual(DEFAULT_AGENCY_SORT);
  });

  it("names aria-sort for each header", () => {
    expect(ariaSort(DEFAULT_AGENCY_SORT, "attention")).toBe("other");
    expect(ariaSort(DEFAULT_AGENCY_SORT, "name")).toBe("none");
    expect(ariaSort({ key: "name", dir: 1 }, "name")).toBe("ascending");
    expect(ariaSort({ key: "credits", dir: 1 }, "credits")).toBe("descending");
    expect(ariaSort({ key: "credits", dir: -1 }, "credits")).toBe("ascending");
  });

  it("says honestly how many rows are shown", () => {
    expect(countLine(17, 17)).toBe("All 17 agencies");
    expect(countLine(4, 17)).toBe("4 of 17 agencies");
    expect(countLine(1, 1)).toBe("All 1 agency");
  });
});
