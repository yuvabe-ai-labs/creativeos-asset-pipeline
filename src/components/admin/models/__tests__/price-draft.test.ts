import { describe, expect, it } from "vitest";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import { runPreviewUsd } from "@/lib/ai-models/model-edit";
import { usdToFinalCredits } from "@/lib/credits/units";
import {
  currentPriceRow,
  draftFromCurrent,
  draftToPayload,
  effectiveFromFor,
  localDay,
  minStartDay,
  switchMeter,
  parseConditionValue,
  previewText,
  unitFromInput,
  unitToInput,
} from "../price-draft";
import type { AdminPriceRow } from "@/lib/db/ai-models-admin";

const catalog = seededModelCatalog();
const NANO_PRO = "gemini:gemini-3-pro-image";
const model = catalog.models.find((m) => m.id === NANO_PRO)!;
const current = catalog.prices.find((p) => p.modelId === NANO_PRO)!;
const textModel = catalog.models.find((m) => m.kind === "text")!;
const now = new Date("2026-11-23T10:30:00Z");

describe("parseConditionValue", () => {
  it("reads audio as a boolean and keeps size, resolution and quality as text", () => {
    expect(parseConditionValue("audio", "true")).toBe(true);
    expect(parseConditionValue("audio", "false")).toBe(false);
    expect(parseConditionValue("size", "512")).toBe("512");
    expect(parseConditionValue("resolution", "1080p")).toBe("1080p");
    expect(parseConditionValue("quality", "high")).toBe("high");
    expect(parseConditionValue("colour", "12")).toBe("12");
  });
});

describe("unit input", () => {
  it("shows and reads token meters per 1M tokens, other meters per unit", () => {
    expect(unitToInput("text_input_token", 0.000002)).toBe("2");
    expect(unitFromInput("text_input_token", "2")).toBe(0.000002);
    expect(unitToInput("output_image", 0.134)).toBe("0.134");
    expect(unitFromInput("output_image", "0.134")).toBe(0.134);
    expect(unitFromInput("output_image", "")).toBeNull();
    expect(unitFromInput("output_image", "-1")).toBeNull();
    expect(unitFromInput("output_image", "abc")).toBeNull();
  });
});

describe("start date", () => {
  const IST = -330; // getTimezoneOffset() in India
  // 03:30 IST on the 24th: the 24th has begun locally but not yet in UTC.
  const earlyIst = new Date("2026-11-23T22:00:00Z");

  it("means now for a day already begun in UTC, and 00:00 UTC for a later day", () => {
    expect(effectiveFromFor("2026-11-23", now)).toBe(now.toISOString());
    expect(effectiveFromFor("2026-12-01", now)).toBe("2026-12-01T00:00:00.000Z");
  });

  it("defaults to the local day and allows the earlier of the local and UTC days", () => {
    expect(localDay(earlyIst, IST)).toBe("2026-11-24");
    expect(minStartDay(earlyIst, IST)).toBe("2026-11-23");
    expect(minStartDay(now, IST)).toBe("2026-11-23");
  });

  it("in IST before 05:30: the UTC day means now, local today means 00:00 UTC that day", () => {
    expect(effectiveFromFor("2026-11-23", earlyIst)).toBe(earlyIst.toISOString());
    expect(effectiveFromFor("2026-11-24", earlyIst)).toBe("2026-11-24T00:00:00.000Z");
    expect(effectiveFromFor("2026-11-25", earlyIst)).toBe("2026-11-25T00:00:00.000Z");
  });

  it("a sheet left open past UTC midnight still saves now", () => {
    const later = new Date("2026-11-24T00:05:00Z");
    expect(effectiveFromFor("2026-11-23", later)).toBe(later.toISOString());
  });

  it("refuses an empty or malformed date instead of throwing", () => {
    const d = draftFromCurrent(current, now);
    for (const date of ["", "20261-01-01", "2026-02-31", "2026-1-1"]) {
      expect(draftToPayload(NANO_PRO, { ...d, date }, now)).toEqual({ ok: false, error: "Pick a start date." });
    }
  });
});

describe("switchMeter", () => {
  it("clears the amount when the meter moves between token and non-token units", () => {
    const line = { meter: "output_image" as const, unit: "0.134", when: [] };
    expect(switchMeter(line, "text_input_token").unit).toBe("");
    expect(switchMeter(line, "request").unit).toBe("0.134");
    const tok = { meter: "text_input_token" as const, unit: "2", when: [] };
    expect(switchMeter(tok, "thought_token")).toEqual({ ...tok, meter: "thought_token" });
    expect(switchMeter(tok, "output_image").unit).toBe("");
  });
});

describe("draftFromCurrent", () => {
  it("copies the current lines and estimate in, starting today", () => {
    const d = draftFromCurrent(current, now);
    expect(d.date).toBe(localDay(now));
    expect(d.lines).toHaveLength(current.lines.length);
    expect(d.lines[0]).toMatchObject({ meter: "output_image", unit: "0.134", when: [{ key: "size", value: "1K" }] });
    expect(d.estimate).toContainEqual({ key: "text_output_tokens", value: "1000" });
  });

  it("starts with one empty line when there is no current price", () => {
    const d = draftFromCurrent(null, now);
    expect(d.lines).toHaveLength(1);
    expect(d.estimate).toEqual([]);
  });
});

describe("draftToPayload", () => {
  it("round-trips the current price", () => {
    const r = draftToPayload(NANO_PRO, draftFromCurrent(current, now), now);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.lines).toEqual(current.lines);
    expect(r.input.estimate).toEqual(current.estimate);
    expect(r.input.effectiveFrom).toBe(now.toISOString());
    expect(r.input.sourceUrl).toBe(current.sourceUrl);
  });

  it("refuses a line without a price and an allowance without a number", () => {
    const d = draftFromCurrent(current, now);
    const noUnit = { ...d, lines: [{ ...d.lines[0], unit: "" }] };
    expect(draftToPayload(NANO_PRO, noUnit, now)).toEqual({ ok: false, error: "Enter a price for every line." });
    const badAllowance = { ...d, estimate: [{ key: "thought_tokens", value: "x" }] };
    expect(draftToPayload(NANO_PRO, badAllowance, now)).toEqual({ ok: false, error: "Enter a number for every allowance." });
  });

  it("trims condition values and refuses half-filled or repeated conditions", () => {
    const base = draftFromCurrent(null, now);
    const withWhen = (when: { key: string; value: string }[]) => ({ ...base, lines: [{ meter: "request" as const, unit: "1", when }] });
    const ok = draftToPayload(NANO_PRO, withWhen([{ key: " size ", value: " 2K " }]), now);
    expect(ok.ok && ok.input.lines[0].when).toEqual({ size: "2K" });
    expect(draftToPayload(NANO_PRO, withWhen([{ key: "size", value: " " }]), now))
      .toEqual({ ok: false, error: "Fill in or remove the empty condition." });
    expect(draftToPayload(NANO_PRO, withWhen([{ key: "", value: "2K" }]), now))
      .toEqual({ ok: false, error: "Fill in or remove the empty condition." });
    expect(draftToPayload(NANO_PRO, withWhen([{ key: "size", value: "1K" }, { key: "size", value: "2K" }]), now))
      .toEqual({ ok: false, error: "Each setting can appear once per line." });
  });

  it("leaves out empty conditions, empty allowances and an empty source and note", () => {
    const d = draftFromCurrent(null, now);
    const r = draftToPayload(NANO_PRO, {
      ...d,
      lines: [{ meter: "request", unit: "0.01", when: [{ key: "", value: "" }] }],
      estimate: [{ key: "", value: "" }],
    }, now);
    expect(r).toEqual({
      ok: true,
      input: { modelId: NANO_PRO, effectiveFrom: now.toISOString(), lines: [{ meter: "request", unit_usd: 0.01 }], estimate: {} },
    });
  });
});

describe("previewText", () => {
  it("prices a default run on the draft and on the current price", () => {
    const d = draftFromCurrent(current, now);
    const was = usdToFinalCredits(runPreviewUsd(model, current)!);
    const doubled = { ...d, lines: d.lines.map((l) => (l.meter === "output_image" ? { ...l, unit: "0.268" } : l)) };
    const draftPrice = { ...current, lines: current.lines.map((l) => (l.meter === "output_image" ? { ...l, unit_usd: 0.268 } : l)) };
    const n = usdToFinalCredits(runPreviewUsd(model, draftPrice)!);
    expect(previewText(model, doubled, current)).toBe(`A default run: ${n} credits (was ${was})`);
    expect(previewText(model, d, null)).toBe(`A default run: ${was} credits`);
  });

  it("has no preview for a text model", () => {
    expect(previewText(textModel, draftFromCurrent(null, now), null)).toBe("No run preview for this kind of model.");
  });

  it("asks for every price while a line is empty, and says when no line prices a default run", () => {
    expect(previewText(model, draftFromCurrent(null, now), current)).toBe("Fill in every price to see a default run.");
    const d = { ...draftFromCurrent(null, now), lines: [{ meter: "request" as const, unit: "1", when: [] }] };
    expect(previewText(model, d, current)).toBe("No line prices a run at the default settings.");
  });
});

describe("currentPriceRow", () => {
  const row = (id: string, effectiveFrom: string, ok = true): AdminPriceRow => ({
    price: ok ? { ...current, id, effectiveFrom } : null,
    problems: ok ? [] : ["lines: bad"],
    id, modelId: NANO_PRO, effectiveFrom, createdAt: effectiveFrom, createdBy: null, createdByName: null, raw: {},
  });

  it("is the newest started row that passes its check", () => {
    const rows = [row("future", "2026-12-01T00:00:00Z"), row("broken", "2026-11-01T00:00:00Z", false), row("old", "2026-01-01T00:00:00Z")];
    expect(currentPriceRow(rows, now)?.id).toBe("old");
    expect(currentPriceRow([row("future", "2026-12-01T00:00:00Z")], now)).toBeNull();
  });
});
