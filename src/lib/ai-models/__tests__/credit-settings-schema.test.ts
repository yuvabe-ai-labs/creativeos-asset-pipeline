import { describe, it, expect } from "vitest";
import { checkCreditSettingsRow, parseCreditSettingsRow } from "../schema";
import { seededModelCatalog } from "../test-catalog";
import { browserCatalog } from "../browser-catalog";

const ROW = {
  id: "c1", effective_from: "2026-01-01T00:00:00Z", margin_percent: "0.00", round_step: 5, note: "Starting settings",
};

describe("credit settings rows", () => {
  it("parses a row, turning the numeric string into a number", () => {
    expect(parseCreditSettingsRow(ROW)).toEqual({
      id: "c1", effectiveFrom: "2026-01-01T00:00:00Z", marginPercent: 0, roundStep: 5, note: "Starting settings",
    });
    expect(parseCreditSettingsRow({ ...ROW, margin_percent: "12.50", note: null })?.marginPercent).toBe(12.5);
    expect(parseCreditSettingsRow({ ...ROW, margin_percent: 20 })?.marginPercent).toBe(20);
  });

  it.each([
    ["margin over 200", { margin_percent: "250" }],
    ["a negative margin", { margin_percent: "-1" }],
    ["a step of 3", { round_step: 3 }],
    ["a missing effective_from", { effective_from: undefined }],
  ])("rejects %s with a problem list", (_name, patch) => {
    const { settings, problems } = checkCreditSettingsRow({ ...ROW, ...patch });
    expect(settings).toBeNull();
    expect(problems.length).toBeGreaterThan(0);
    expect(parseCreditSettingsRow({ ...ROW, ...patch })).toBeNull();
  });

  it("the seeded catalog has the one starting row", () => {
    const rows = seededModelCatalog().creditSettings;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ marginPercent: 0, roundStep: 5, effectiveFrom: "2026-01-01T00:00:00Z" });
  });

  it("browserCatalog keeps every settings row", () => {
    const catalog = seededModelCatalog();
    const extra = { id: "c2", effectiveFrom: "2027-01-01T00:00:00Z", marginPercent: 10, roundStep: 1 as const, note: null };
    const out = browserCatalog({ ...catalog, creditSettings: [...catalog.creditSettings, extra] });
    expect(out.creditSettings).toHaveLength(2);
  });
});
