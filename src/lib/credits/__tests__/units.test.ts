import { describe, it, expect, vi, afterEach } from "vitest";
import { creditsFromUsd, creditSettingsAt, DEFAULT_CREDIT_SETTINGS } from "../units";
import type { CreditSettings } from "@/lib/ai-models/types";

const STEP5 = { marginPercent: 0, roundStep: 5 } as const;

describe("creditsFromUsd", () => {
  it("converts USD to credits and rounds up to the nearest step", () => {
    // 0.005 USD * 1000 = 5 credits, already a multiple of 5 -> stays 5
    expect(creditsFromUsd(0.005, STEP5)).toBe(5);
  });

  it("rounds up even a tiny excess over a step boundary", () => {
    // 0.0051 USD * 1000 = 5.1 credits -> rounds up to 10, not down to 5
    expect(creditsFromUsd(0.0051, STEP5)).toBe(10);
  });

  it("leaves an already-clean multiple of the step unchanged", () => {
    // 0.24 USD * 1000 = 240 credits, already a multiple of 5
    expect(creditsFromUsd(0.24, STEP5)).toBe(240);
  });

  it("handles a large video-scale cost", () => {
    // 2.13 USD * 1000 = 2130 credits, already a multiple of 5
    expect(creditsFromUsd(2.13, STEP5)).toBe(2130);
  });

  it("returns 0 for a zero cost", () => {
    expect(creditsFromUsd(0, STEP5)).toBe(0);
  });

  it("ignores float noise before rounding up to the step", () => {
    // 5 x 0.084 = 0.42000000000000004 in floating point: 420 credits, not 425
    expect(creditsFromUsd(5 * 0.084, STEP5)).toBe(420);
    // voice change 87.5 s at $0.002 a second = 0.17500000000000002: 175, not 180
    expect(creditsFromUsd(87.5 * 0.002, STEP5)).toBe(175);
  });

  it("still rounds a real excess of a millionth of a credit up", () => {
    expect(creditsFromUsd(0.420001, STEP5)).toBe(425);
  });

  it("applies the margin before rounding", () => {
    // 810.88 credits x 1.10 = 891.968 -> 895
    expect(creditsFromUsd(0.81088, { marginPercent: 10, roundStep: 5 })).toBe(895);
  });

  it("rounds to a step of 1", () => {
    // 6.95 credits -> 7
    expect(creditsFromUsd(0.00695, { marginPercent: 0, roundStep: 1 })).toBe(7);
  });

  it("rounds to a step of 10", () => {
    // 12.3 credits -> 20
    expect(creditsFromUsd(0.0123, { marginPercent: 0, roundStep: 10 })).toBe(20);
  });

  it("rounds $0.0123 to 15 at a step of 5", () => {
    expect(creditsFromUsd(0.0123, STEP5)).toBe(15);
  });
});

describe("creditSettingsAt", () => {
  const row = (id: string, effectiveFrom: string, marginPercent: number): CreditSettings => ({
    id,
    effectiveFrom,
    marginPercent,
    roundStep: 5,
    note: null,
  });

  afterEach(() => vi.restoreAllMocks());

  it("picks the latest row that has started", () => {
    const catalog = {
      creditSettings: [
        row("a", "2026-01-01T00:00:00Z", 0),
        row("c", "2026-09-01T00:00:00Z", 20),
        row("b", "2026-06-01T00:00:00Z", 10),
      ],
    };
    expect(creditSettingsAt(catalog, new Date("2026-10-01T00:00:00Z")).id).toBe("c");
  });

  it("ignores a row that has not started yet", () => {
    const catalog = {
      creditSettings: [row("a", "2026-01-01T00:00:00Z", 0), row("f", "2027-01-01T00:00:00Z", 50)],
    };
    expect(creditSettingsAt(catalog, new Date("2026-10-01T00:00:00Z")).id).toBe("a");
  });

  it("falls back to the defaults and logs once when no row has started", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const catalog = { creditSettings: [row("f", "2027-01-01T00:00:00Z", 50)] };
    expect(creditSettingsAt(catalog, new Date("2026-10-01T00:00:00Z"))).toEqual(DEFAULT_CREDIT_SETTINGS);
    expect(creditSettingsAt({ creditSettings: [] }, new Date("2026-10-02T00:00:00Z"))).toEqual(DEFAULT_CREDIT_SETTINGS);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
