import { describe, it, expect } from "vitest";
import { checkNewCreditSettings, CREDIT_SETTINGS_LEAD_MS } from "../settings-edit";

const now = new Date("2026-06-01T12:00:00Z");
const later = new Date("2026-07-01T00:00:00Z");
const ok = (over: Record<string, unknown> = {}) =>
  checkNewCreditSettings({ effectiveFrom: later, marginPercent: 20, roundStep: 5, ...over }, [], now);

describe("checkNewCreditSettings", () => {
  it("accepts a valid change and returns the stored shape", () => {
    expect(ok({ note: "  Spring  " })).toEqual({
      ok: true,
      value: { effectiveFrom: later.toISOString(), marginPercent: 20, roundStep: 5, note: "Spring" },
    });
  });
  it("turns an empty or missing note into null", () => {
    expect(ok({ note: "   " })).toMatchObject({ ok: true, value: { note: null } });
    expect(ok()).toMatchObject({ ok: true, value: { note: null } });
  });
  it.each([-1, 200.01, NaN, Infinity, "20", null, 12.345])("refuses margin %s", (margin) => {
    expect(ok({ marginPercent: margin })).toEqual({ ok: false, error: "The margin must be between 0% and 200%." });
  });
  it.each([0, 200, 12.5, 0.01])("accepts margin %s", (margin) => {
    expect(ok({ marginPercent: margin }).ok).toBe(true);
  });
  it.each([2, 0, "5", null, 5.5])("refuses step %s", (step) => {
    expect(ok({ roundStep: step })).toEqual({ ok: false, error: "Pick a rounding step of 1, 5 or 10." });
  });
  it.each([1, 5, 10])("accepts step %s", (step) => {
    expect(ok({ roundStep: step }).ok).toBe(true);
  });
  it("moves a start sooner than the lead time to exactly now plus the lead time", () => {
    const at = (ms: number) => checkNewCreditSettings({ effectiveFrom: new Date(now.getTime() + ms), marginPercent: 0, roundStep: 1 }, [], now);
    const lead = new Date(now.getTime() + CREDIT_SETTINGS_LEAD_MS).toISOString();
    expect(CREDIT_SETTINGS_LEAD_MS).toBe(120_000);
    expect(at(0)).toMatchObject({ ok: true, value: { effectiveFrom: lead } });
    expect(at(-59_000)).toMatchObject({ ok: true, value: { effectiveFrom: lead } });
    expect(at(60_000)).toMatchObject({ ok: true, value: { effectiveFrom: lead } });
    expect(at(CREDIT_SETTINGS_LEAD_MS + 1_000)).toMatchObject({ ok: true, value: { effectiveFrom: new Date(now.getTime() + 121_000).toISOString() } });
  });
  it("checks a taken start against the moved start", () => {
    const lead = new Date(now.getTime() + CREDIT_SETTINGS_LEAD_MS);
    expect(checkNewCreditSettings({ effectiveFrom: now, marginPercent: 0, roundStep: 1 }, [{ effectiveFrom: lead.toISOString() }], now))
      .toEqual({ ok: false, error: "There is already a change starting then." });
  });
  it("allows a start within the 60 s allowance and refuses earlier or invalid ones", () => {
    const at = (ms: number) => checkNewCreditSettings({ effectiveFrom: new Date(now.getTime() + ms), marginPercent: 0, roundStep: 1 }, [], now);
    expect(at(-59_000).ok).toBe(true);
    expect(at(-60_000).ok).toBe(true);
    expect(at(-61_000)).toEqual({ ok: false, error: "A change can't start in the past." });
    expect(checkNewCreditSettings({ effectiveFrom: new Date("x"), marginPercent: 0, roundStep: 1 }, [], now))
      .toEqual({ ok: false, error: "A change can't start in the past." });
  });
  it("refuses a start that is already taken, whatever the text form", () => {
    expect(checkNewCreditSettings({ effectiveFrom: later, marginPercent: 0, roundStep: 1 }, [{ effectiveFrom: "2026-07-01T00:00:00+00:00" }], now))
      .toEqual({ ok: false, error: "There is already a change starting then." });
  });
  it("refuses a note over 500 characters", () => {
    expect(ok({ note: "a".repeat(501) })).toEqual({ ok: false, error: "Keep the note under 500 characters." });
    expect(ok({ note: "a".repeat(500) }).ok).toBe(true);
    expect(ok({ note: 5 })).toEqual({ ok: false, error: "Keep the note under 500 characters." });
  });
});
