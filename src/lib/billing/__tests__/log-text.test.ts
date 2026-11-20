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
      .toBe("Added 5,000 credits until 3 Dec 2026");
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

  it("names anything else plainly", () => {
    expect(describeBillingChange(entry("something_new", null, null))).toBe("Billing changed");
  });
});
