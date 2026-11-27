import { describe, it, expect } from "vitest";
import { isPaused, summarizeBilling } from "../summary";
import type { OpenGrant } from "../grants";

const grant = (kind: OpenGrant["kind"], credits: number, left: number, endsAt = "2026-12-03T18:30:00.000Z"): OpenGrant => ({ id: kind + credits, kind, credits, used: credits - left, left, endsAt });
const plan = { status: "active", currentPeriodEnd: "2026-12-21T00:00:00Z" };

describe("billing at a glance", () => {
  it("says managed for Yuvabe-managed agencies, never paused", () => {
    const s = summarizeBilling("managed", [], null);
    expect(s.state).toBe("managed");
    expect(isPaused(s)).toBe(false);
  });

  it("asks a paying agency with nothing to pick a plan", () => {
    const s = summarizeBilling("plans", [], null);
    expect(s.state).toBe("no_plan");
    expect(isPaused(s)).toBe(true);
  });

  it("shows free credits and their end while there is no paid plan", () => {
    const s = summarizeBilling("plans", [grant("free", 50_000, 48_000)], null);
    expect(s).toMatchObject({ state: "free", freeLeft: 48_000, freeEndsAt: "2026-12-03T18:30:00.000Z", planEndsAt: null });
  });

  it("dates free credits by the grants that still have credits, not an emptied one", () => {
    const emptied = grant("free", 0, 0, "2026-12-01T18:30:00.000Z");
    const s = summarizeBilling("plans", [emptied, grant("free", 2_000, 2_000, "2026-12-15T18:30:00.000Z")], null);
    expect(s).toMatchObject({ state: "free", freeLeft: 2_000, freeEndsAt: "2026-12-15T18:30:00.000Z" });
    expect(summarizeBilling("plans", [emptied], null).freeEndsAt).toBeNull();
  });

  it("stops at a due payment even with credits left", () => {
    const s = summarizeBilling("plans", [grant("plan", 100_000, 90_000)], { ...plan, status: "payment_due" });
    expect(s.state).toBe("payment_due");
    expect(isPaused(s)).toBe(true);
  });

  it("warns at 80% used, and asks to top up when used up", () => {
    expect(summarizeBilling("plans", [grant("plan", 100_000, 20_000)], plan).state).toBe("low");
    expect(summarizeBilling("plans", [grant("plan", 100_000, 21_000)], plan).state).toBe("ok");
    expect(summarizeBilling("plans", [grant("plan", 100_000, 0)], plan).state).toBe("used_up");
  });

  it("adds up every open grant and keeps the plan's end", () => {
    const s = summarizeBilling("plans", [grant("free", 10_000, 5_000), grant("plan", 100_000, 100_000), grant("topup", 25_000, 25_000)], plan);
    expect(s).toMatchObject({ state: "ok", left: 130_000, total: 135_000, planEndsAt: "2026-12-21T00:00:00Z" });
  });
});
