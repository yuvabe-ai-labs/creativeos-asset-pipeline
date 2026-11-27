import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ list: vi.fn(), claim: vi.fn(), release: vi.fn(), log: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/db/owner-credit-emails", () => ({ listDueOwnerEmails: m.list, claimOwnerEmail: m.claim, releaseOwnerEmail: m.release, logOwnerEmails: m.log }));
vi.mock("@/lib/email/send", () => ({ sendEmail: m.send }));

import { composeOwnerEmail, FREE_ENDING_NOTICE_HOURS, sendOwnerCreditEmails } from "../owner-credit-emails";
import { LOW_CREDITS_SHARE } from "../summary";
import type { DueOwnerEmail } from "@/lib/db/owner-credit-emails";
import type { OpenGrant } from "../grants";

const NOW = Date.parse("2026-11-27T06:00:00Z");
const CLAIM = "2026-11-27T06:00:00.123456+00:00";
const grant = (over: Partial<OpenGrant> = {}): OpenGrant => ({ id: "g1", kind: "plan", credits: 100_000, used: 82_000, left: 18_000, endsAt: "2026-12-10T10:00:00Z", ...over });
const low = (over: Partial<DueOwnerEmail> = {}): DueOwnerEmail => ({
  kind: "low_credits", orgId: "org_1", agency: "Acme", to: ["owner@acme.test"], grantId: null, grants: [grant()],
  subscription: { status: "active", currentPeriodEnd: "2026-12-10T10:00:00Z" }, warnedAt: null, ...over,
});
const free = (over: Partial<DueOwnerEmail> = {}): DueOwnerEmail => ({
  kind: "free_ending", orgId: "org_2", agency: "Beta", to: ["o@beta.test"], grantId: "f1",
  grants: [grant({ id: "f1", kind: "free", credits: 50_000, used: 20_000, left: 30_000, endsAt: "2026-11-29T18:30:00Z" })],
  subscription: null, warnedAt: null, ...over,
});

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  process.env.APP_URL = "https://app.example";
  m.claim.mockResolvedValue(CLAIM);
  m.send.mockResolvedValue({ sent: true });
  m.log.mockResolvedValue(undefined);
  m.release.mockResolvedValue(undefined);
});

describe("which owner emails go (D596)", () => {
  it("uses Billing's low rule: a running plan at 82% gets the email with a top-up", () => {
    const built = composeOwnerEmail(low(), NOW)!;
    expect(built.log).toEqual({ email: "low_credits", used_percent: 82, left: 18_000, total: 100_000 });
    expect(built.email.text).toContain("buy a top-up");
    expect(built.email.text).toContain("Open Billing: https://app.example/billing");
  });

  it("sends nothing below 80%, on a payment due, or while free credits run without a plan", () => {
    expect(composeOwnerEmail(low({ grants: [grant({ used: 79_000, left: 21_000 })] }), NOW)).toBeNull();
    expect(composeOwnerEmail(low({ subscription: { status: "payment_due", currentPeriodEnd: null } }), NOW)).toBeNull();
    expect(composeOwnerEmail(low({ subscription: null, grants: [grant({ kind: "free" })] }), NOW)).toBeNull();
  });

  it("asks an agency without a plan to pick one, with no top-up", () => {
    const built = composeOwnerEmail(low({ subscription: null, grants: [grant({ kind: "admin" })] }), NOW)!;
    expect(built.email.text).toContain("pick a plan");
    expect(built.email.text).not.toContain("top-up");
    expect(built.email.text).toContain("Pick a plan: https://app.example/billing/plans");
  });

  it("tells about the free grant ending, with what's left", () => {
    const built = composeOwnerEmail(free(), NOW)!;
    expect(built.email.subject).toBe("Your free credits end on 29 Nov");
    expect(built.log).toEqual({ email: "free_ending", grant_id: "f1", left: 30_000, ends_at: "2026-11-29T18:30:00Z" });
  });

  it("reads with Billing's share and the 3-day notice", async () => {
    m.list.mockResolvedValue([]);
    await sendOwnerCreditEmails(NOW);
    expect(m.list).toHaveBeenCalledWith(LOW_CREDITS_SHARE, FREE_ENDING_NOTICE_HOURS, 200);
    expect(FREE_ENDING_NOTICE_HOURS).toBe(72);
  });
});

describe("sending once (D596)", () => {
  it("claims before sending and logs one row per email in one write", async () => {
    m.list.mockResolvedValue([low(), free()]);
    const report = await sendOwnerCreditEmails(NOW);
    expect(report).toEqual({ lowCredits: 1, freeEnding: 1, failed: 0 });
    expect(m.claim.mock.invocationCallOrder[0]).toBeLessThan(m.send.mock.invocationCallOrder[0]);
    expect(m.log).toHaveBeenCalledTimes(1);
    expect(m.log.mock.calls[0][0]).toEqual([
      { orgId: "org_1", after: { email: "low_credits", used_percent: 82, left: 18_000, total: 100_000 } },
      { orgId: "org_2", after: { email: "free_ending", grant_id: "f1", left: 30_000, ends_at: "2026-11-29T18:30:00Z" } },
    ]);
  });

  it("sends nothing when another run took the claim", async () => {
    m.list.mockResolvedValue([low()]);
    m.claim.mockResolvedValue(null);
    const report = await sendOwnerCreditEmails(NOW);
    expect(m.send).not.toHaveBeenCalled();
    expect(report.lowCredits).toBe(0);
    expect(m.log).toHaveBeenCalledWith([]);
  });

  it("gives the claim back when the send fails, so the next hour tries again, and goes on", async () => {
    m.list.mockResolvedValue([low(), free()]);
    m.send.mockResolvedValueOnce({ sent: false, reason: "failed" });
    const report = await sendOwnerCreditEmails(NOW);
    expect(report).toEqual({ lowCredits: 0, freeEnding: 1, failed: 1 });
    expect(m.release).toHaveBeenCalledWith(expect.objectContaining({ kind: "low_credits", orgId: "org_1" }), CLAIM);
    expect(m.log.mock.calls[0][0]).toHaveLength(1);
  });

  it("claims nothing for a row Billing's rule doesn't count as low", async () => {
    m.list.mockResolvedValue([low({ subscription: { status: "payment_due", currentPeriodEnd: null } })]);
    await sendOwnerCreditEmails(NOW);
    expect(m.claim).not.toHaveBeenCalled();
  });

  it("a failed read is never treated as nothing due", async () => {
    m.list.mockRejectedValue(new Error("db down"));
    await expect(sendOwnerCreditEmails(NOW)).rejects.toThrow("db down");
    expect(m.log).not.toHaveBeenCalled();
  });
});
