import { describe, it, expect } from "vitest";
import { describeBillingChange } from "../log-text";

const entry = (action: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null, createdAt = "2026-11-20T06:00:00Z") =>
  ({ action, before, after, createdAt });

describe("billing log in plain words", () => {
  it("says what billing changed to", () => {
    expect(describeBillingChange(entry("billing_mode", { billing_mode: "managed" }, { billing_mode: "plans" }))).toBe("Billing changed to Pays for a plan");
  });

  it("says what was given, and until when", () => {
    expect(describeBillingChange(entry("grant", null, { kind: "free", credits: 50000, ends_at: "2026-12-03T18:30:00+00:00" })))
      .toBe("Gave 50,000 free credits until 3 Dec 2026");
    expect(describeBillingChange(entry("grant", null, { kind: "admin", credits: 5000, ends_at: "2026-12-03T18:30:00Z" })))
      .toBe("Added 5,000 extra credits until 3 Dec 2026");
  });

  it("says how much was taken back", () => {
    expect(describeBillingChange(entry("take_back", { kind: "free", credits: 50000 }, { kind: "free", credits: 48000 })))
      .toBe("Took back 2,000 free credits (50,000 to 48,000)");
  });

  it("says when credits now end, or that they were ended", () => {
    expect(describeBillingChange(entry("grant_end", { kind: "free", ends_at: "2026-12-03T18:30:00Z" }, { kind: "free", ends_at: "2026-12-10T18:30:00Z" })))
      .toBe("Free credits now end after 10 Dec 2026");
    expect(describeBillingChange(entry("grant_end", { kind: "plan", ends_at: "2026-12-03T18:30:00Z" }, { kind: "plan", ends_at: "2026-11-20T06:00:00.2Z" })))
      .toBe("Ended plan credits");
  });

  it("says a plan moves to a new price from its renewal, or why it can't (D593)", () => {
    const before = { price_id: "old", amount_minor: 1_000_000 };
    expect(describeBillingChange(entry("plan_move", before, { price_id: "new", amount_minor: 1_200_000, starts_at: "2026-12-03T06:00:00Z", refused: null })))
      .toBe("Plan moves from ₹10,000 to ₹12,000 a month from the renewal on 3 Dec 2026");
    expect(describeBillingChange(entry("plan_move", before, { price_id: "new", amount_minor: 1_200_000, refused: "upi" })))
      .toBe("Couldn't move the plan to ₹12,000 a month: it is paid by UPI. It stays at ₹10,000 until it changes plan");
    expect(describeBillingChange(entry("plan_move", before, { price_id: "new", amount_minor: 1_200_000, refused: "other" })))
      .toBe("Couldn't move the plan to ₹12,000 a month. It stays at ₹10,000 until it changes plan");
  });

  it("says the owner was asked to approve a new price, approved it, or the plan ended (D595)", () => {
    expect(describeBillingChange(entry("plan_move", { amount_minor: 1_000_000 }, { amount_minor: 1_200_000, refused: "emandate", ends_at: "2026-12-03T06:00:00Z" })))
      .toBe("Asked the owner to approve ₹12,000 a month: the plan is paid by bank mandate. It ends on 3 Dec 2026 unless they do");
    expect(describeBillingChange(entry("price_approved", { amount_minor: 1_000_000 }, { amount_minor: 1_200_000, starts_at: "2026-12-03T06:00:00Z" })))
      .toBe("Owner approved ₹12,000 a month, from 3 Dec 2026");
    expect(describeBillingChange(entry("price_not_approved", null, { amount_minor: 1_200_000, ends_at: "2026-12-03T06:00:00Z" })))
      .toBe("Plan ended on 3 Dec 2026: the owner didn't approve ₹12,000 a month");
  });

  it("names anything else plainly", () => {
    expect(describeBillingChange(entry("something_new", null, null))).toBe("Billing changed");
  });

  it("says which email the owner was sent", () => {
    expect(describeBillingChange(entry("owner_email", null, { email: "low_credits", used_percent: 82, left: 18000, total: 100000 })))
      .toBe("Told the owner credits are running low (82% used)");
    expect(describeBillingChange(entry("owner_email", null, { email: "free_ending", left: 30000, ends_at: "2026-12-03T18:30:00Z" })))
      .toBe("Told the owner free credits end after 3 Dec 2026");
  });
});
