import { describe, expect, it } from "vitest";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import { runPreviewUsd } from "@/lib/ai-models/model-edit";
import { usdToFinalCredits } from "@/lib/credits/units";
import {
  allowanceOptions,
  allowanceWarning,
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
const TODAY = "2026-11-23"; // the admin's local day, as the sheet passes it in

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
  const istToday = localDay(earlyIst, IST);

  it("means now up to the local today, and 00:00 UTC for a later day", () => {
    expect(effectiveFromFor("2026-11-23", now, TODAY)).toBe(now.toISOString());
    expect(effectiveFromFor("2026-12-01", now, TODAY)).toBe("2026-12-01T00:00:00.000Z");
  });

  it("defaults to the local day and allows the earlier of the local and UTC days", () => {
    expect(istToday).toBe("2026-11-24");
    expect(minStartDay(earlyIst, IST)).toBe("2026-11-23");
    expect(minStartDay(now, IST)).toBe("2026-11-23");
  });

  it("at 03:30 IST on the 24th: the 24th means now, the 25th means 00:00 UTC on the 25th", () => {
    expect(effectiveFromFor("2026-11-24", earlyIst, istToday)).toBe(earlyIst.toISOString());
    expect(effectiveFromFor("2026-11-25", earlyIst, istToday)).toBe("2026-11-25T00:00:00.000Z");
  });

  it("a stale UTC-yesterday still saves now", () => {
    expect(effectiveFromFor("2026-11-23", earlyIst, istToday)).toBe(earlyIst.toISOString());
    const later = new Date("2026-11-24T00:05:00Z");
    expect(effectiveFromFor("2026-11-23", later, "2026-11-24")).toBe(later.toISOString());
  });

  it("refuses an empty or malformed date instead of throwing", () => {
    const d = draftFromCurrent(current, now);
    for (const date of ["", "20261-01-01", "2026-02-31", "2026-1-1"]) {
      expect(draftToPayload(NANO_PRO, { ...d, date }, now, TODAY)).toEqual({ ok: false, error: "Pick a start date." });
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
    const r = draftToPayload(NANO_PRO, draftFromCurrent(current, now), now, TODAY);
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
    expect(draftToPayload(NANO_PRO, noUnit, now, TODAY)).toEqual({ ok: false, error: "Enter a price for every line." });
    const badAllowance = { ...d, estimate: [{ key: "thought_tokens", value: "x" }] };
    expect(draftToPayload(NANO_PRO, badAllowance, now, TODAY)).toEqual({ ok: false, error: "Enter a number for every allowance." });
  });

  it("trims condition values and refuses half-filled or repeated conditions", () => {
    const base = draftFromCurrent(null, now);
    const withWhen = (when: { key: string; value: string }[]) => ({ ...base, lines: [{ meter: "request" as const, unit: "1", when }] });
    const ok = draftToPayload(NANO_PRO, withWhen([{ key: " size ", value: " 2K " }]), now, TODAY);
    expect(ok.ok && ok.input.lines[0].when).toEqual({ size: "2K" });
    expect(draftToPayload(NANO_PRO, withWhen([{ key: "size", value: " " }]), now, TODAY))
      .toEqual({ ok: false, error: "Fill in or remove the empty condition." });
    expect(draftToPayload(NANO_PRO, withWhen([{ key: "", value: "2K" }]), now, TODAY))
      .toEqual({ ok: false, error: "Fill in or remove the empty condition." });
    expect(draftToPayload(NANO_PRO, withWhen([{ key: "size", value: "1K" }, { key: "size", value: "2K" }]), now, TODAY))
      .toEqual({ ok: false, error: "Each setting can appear once per line." });
  });

  it("leaves out empty conditions, empty allowances and an empty source and note", () => {
    const d = draftFromCurrent(null, now);
    const r = draftToPayload(NANO_PRO, {
      ...d,
      lines: [{ meter: "request", unit: "0.01", when: [{ key: "", value: "" }] }],
      estimate: [{ key: "", value: "" }],
    }, now, TODAY);
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

describe("allowance names", () => {
  it("offers the names the estimator reads, then any extra name on the current row", () => {
    const withExtra = { ...current, estimate: { ...current.estimate, legacy_allowance: 3 } };
    const options = allowanceOptions(model, withExtra);
    expect(options.slice(0, 3)).toEqual(["input_tokens_base", "input_tokens_per_reference", "text_output_tokens"]);
    expect(options).toContain("legacy_allowance");
    expect(new Set(options).size).toBe(options.length);
    expect(allowanceOptions(textModel, null)).toEqual([]);
  });
  it("warns about a name no estimate reads, and only then", () => {
    expect(allowanceWarning(model, "input_tokens_base")).toBeNull();
    expect(allowanceWarning(model, "")).toBeNull();
    expect(allowanceWarning(model, "  input_tokens_base ")).toBeNull();
    expect(allowanceWarning(model, "typo_tokens")).toBe("No estimate reads this name.");
  });
});
