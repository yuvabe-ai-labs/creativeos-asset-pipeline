import { describe, expect, it } from "vitest";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import { lineFor } from "@/lib/ai-models/pricing";
import { runCredits, runSpec } from "@/lib/admin/typical-runs";
import type { AiModel, AiModelPrice } from "@/lib/ai-models/types";
import { lineKey } from "../price-grid";
import {
  agenciesAffected,
  buildReview,
  applyEdits,
  beforePrice,
  bulkMessage,
  cellState,
  confirmLabel,
  editTargets,
  editText,
  invalidKeys,
  priceChanges,
  replacedList,
  replacedRow,
  reviewWarnings,
  savedMessage,
  typicalBeforeAfter,
  undoPlan,
  whenInstant,
  whenProblem,
} from "../change-prices";

const catalog = seededModelCatalog();
const model = (id: string): AiModel => {
  const m = catalog.models.find((x) => x.id === id);
  if (!m) throw new Error(`no seeded model ${id}`);
  return m;
};
const prices = (id: string) => catalog.prices.filter((p) => p.modelId === id).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
const first = (id: string) => prices(id)[0];

const OMNI = "gemini:gemini-omni-1.1-flash";
const PRO_IMAGE = "gemini:gemini-3-pro-image";
const GPT_IMAGE = "openai:gpt-image-2";
const GPT5 = "openai:gpt-5";
const NOW = new Date("2026-11-24T06:30:00Z"); // 12:00 IST
const settings = { marginPercent: 0, roundStep: 5 as const };

/** The lines other than these keys, as they were. */
const others = (lines: AiModelPrice["lines"], keys: string[]) => lines.filter((l) => !keys.includes(lineKey(l.meter, l.when)));

describe("editText", () => {
  it("shows the stored price at full precision, tokens per 1M, never in exponent form", () => {
    expect(editText("video_second", 0.0337925)).toBe("0.0337925");
    expect(editText("input_token", 0.0000015)).toBe("1.5");
    expect(editText("cached_input_token", 7.5e-8)).toBe("0.075");
    expect(editText("output_image", 0.0000005)).toBe("0.0000005");
    expect(editText("output_image", null)).toBe("");
  });
});

describe("applyEdits", () => {
  it("video: replaces only the edited cells' prices and keeps every other line and the estimate", () => {
    const m = model(OMNI);
    const base = first(OMNI);
    const k720 = lineKey("video_second", { resolution: "720p" });
    const kIn = lineKey("input_token", {});
    const lines = applyEdits(m, base, { [k720]: "0.07", [kIn]: "−31%" });
    expect(lines).toHaveLength(base.lines.length);
    expect(lines.find((l) => lineKey(l.meter, l.when) === k720)?.unit_usd).toBe(0.07);
    // 1.5 per 1M, −31% = 1.035 per 1M, stored per token.
    expect(lines.find((l) => lineKey(l.meter, l.when) === kIn)?.unit_usd).toBe(0.000001035);
    expect(others(lines, [k720, kIn])).toEqual(others(base.lines, [k720, kIn]));
    // Order is kept, so a run matches the same line as before.
    expect(lines.map((l) => lineKey(l.meter, l.when))).toEqual(base.lines.map((l) => lineKey(l.meter, l.when)));
    expect(base.lines.find((l) => lineKey(l.meter, l.when) === k720)?.unit_usd).toBe(0.10136);
  });

  it("image: edits a size cell and a token charge per 1M", () => {
    const m = model(PRO_IMAGE);
    const base = first(PRO_IMAGE);
    const k4 = lineKey("output_image", { size: "4K" });
    const kOut = lineKey("image_output_token", {});
    const lines = applyEdits(m, base, { [k4]: "0.2", [kOut]: "100" });
    expect(lines.find((l) => lineKey(l.meter, l.when) === k4)?.unit_usd).toBe(0.2);
    expect(lines.find((l) => lineKey(l.meter, l.when) === kOut)?.unit_usd).toBe(0.0001);
    expect(others(lines, [k4, kOut])).toEqual(others(base.lines, [k4, kOut]));
  });

  it("image grid (OpenAI): edits one size and quality only", () => {
    const m = model(GPT_IMAGE);
    const base = first(GPT_IMAGE);
    const k = lineKey("output_image", { quality: "high", size: "1024x1024" });
    const lines = applyEdits(m, base, { [k]: "+10%" });
    const old = base.lines.find((l) => lineKey(l.meter, l.when) === k)!.unit_usd;
    expect(lines.find((l) => lineKey(l.meter, l.when) === k)?.unit_usd).toBe(Number((old * 1.1).toPrecision(4)));
    expect(others(lines, [k])).toEqual(others(base.lines, [k]));
  });

  it("token-priced text model: every price is per 1M, others untouched", () => {
    const m = model(GPT5);
    const base = first(GPT5);
    const kIn = lineKey("input_token", {});
    const lines = applyEdits(m, base, { [kIn]: "1.1" });
    expect(lines.find((l) => l.meter === "input_token")?.unit_usd).toBe(0.0000011);
    expect(others(lines, [kIn])).toEqual(others(base.lines, [kIn]));
  });

  it("leaves untouched, blank, invalid and unchanged entries alone, at full stored precision", () => {
    const m = model("fal:lipsync-2-pro");
    const base = first("fal:lipsync-2-pro");
    const k = lineKey("video_second", {});
    expect(applyEdits(m, base, {})).toEqual(base.lines);
    expect(applyEdits(m, base, { [k]: "" })).toEqual(base.lines);
    expect(applyEdits(m, base, { [k]: "abc" })).toEqual(base.lines);
    expect(applyEdits(m, base, { [k]: editText("video_second", base.lines[0].unit_usd) })[0].unit_usd).toBe(0.08333333333333333);
  });

  it("a cell priced by a broader line gets its own line, placed before the broader one", () => {
    const m = model(OMNI);
    const base: AiModelPrice = { ...first(OMNI), lines: [{ meter: "video_second", unit_usd: 0.1 }, { meter: "input_token", unit_usd: 0.0000015 }] };
    const k720 = lineKey("video_second", { resolution: "720p" });
    const lines = applyEdits(m, base, { [k720]: "0.07" });
    expect(lines).toEqual([
      { meter: "video_second", unit_usd: 0.07, when: { resolution: "720p" } },
      { meter: "video_second", unit_usd: 0.1 },
      { meter: "input_token", unit_usd: 0.0000015 },
    ]);
    const next = { ...base, lines };
    expect(lineFor(next, "video_second", { resolution: "720p" })?.unit_usd).toBe(0.07);
    expect(lineFor(next, "video_second", { resolution: "1080p" })?.unit_usd).toBe(0.1);
  });

  it("a model with no price yet gets a line per priced cell", () => {
    const m = model(OMNI);
    const empty: AiModelPrice = { id: "", modelId: OMNI, effectiveFrom: "", lines: [], estimate: {}, sourceUrl: null, note: null };
    const lines = applyEdits(m, empty, { [lineKey("video_second", { resolution: "720p" })]: "0.1" });
    expect(lines).toEqual([{ meter: "video_second", unit_usd: 0.1, when: { resolution: "720p" } }]);
  });

  it("never writes a cell the model doesn't offer", () => {
    const m = model(OMNI);
    const lines = applyEdits(m, first(OMNI), { [lineKey("video_second", { resolution: "8k" })]: "1" });
    expect(lines).toEqual(first(OMNI).lines);
  });
});

describe("invalidKeys and cellState", () => {
  const m = model(OMNI);
  const base = first(OMNI);
  const k720 = lineKey("video_second", { resolution: "720p" });
  it("lists cells that aren't a price", () => {
    expect(invalidKeys(m, base, { [k720]: "abc", [lineKey("input_token", {})]: "1.2" })).toEqual([k720]);
    expect(invalidKeys(m, base, { [k720]: "-120%" })).toEqual([k720]);
  });
  it("reads a cell as unchanged, changed (with a big-change flag), new, empty or invalid", () => {
    expect(cellState("video_second", 0.1, undefined, false)).toEqual({ kind: "unchanged" });
    expect(cellState("video_second", 0.1, "0.10", false)).toEqual({ kind: "unchanged" });
    expect(cellState("video_second", null, "", false)).toEqual({ kind: "empty" });
    expect(cellState("video_second", 0.1, "x", false)).toEqual({ kind: "invalid" });
    expect(cellState("video_second", null, "0.2", false)).toEqual({ kind: "new", usd: 0.2, approximate: false });
    expect(cellState("video_second", 0.1, "−31%", false)).toMatchObject({ kind: "changed", usd: 0.069, oldUsd: 0.1, big: false, approximate: true });
    expect(cellState("video_second", 0.023172, "0.05", false)).toMatchObject({ kind: "changed", big: true, approximate: false });
    expect(cellState("input_token", 0.0000015, "1.035", true)).toMatchObject({ kind: "changed", usd: 0.000001035, approximate: true });
  });
});

describe("editTargets", () => {
  it("lists offered cells and other charges with the amount a person types", () => {
    const t = editTargets(model(OMNI), first(OMNI));
    expect(t.cells.map((c) => c.amount)).toEqual([0.0337925, 0.10136, 0.15204, 0.30408]);
    expect(t.otherCharges.find((o) => o.key === lineKey("input_token", {}))?.amount).toBe(1.5);
  });
});

describe("priceChanges and replacedList", () => {
  const m = model(OMNI);
  const [live, scheduled] = prices(OMNI);
  it("lists each changed price with its percent, named for people", () => {
    const k720 = lineKey("video_second", { resolution: "720p" });
    const lines = applyEdits(m, live, { [k720]: "0.07" });
    const ch = priceChanges(m, live, { ...live, lines });
    expect(ch).toHaveLength(1);
    expect(ch[0]).toMatchObject({ key: k720, name: "720p, per second of video", oldAmount: 0.10136, newAmount: 0.07 });
    expect(ch[0].percent).toBeCloseTo(-30.94, 1);
  });
  it("shows token prices per 1M", () => {
    const k = lineKey("input_token", {});
    const ch = priceChanges(m, live, { ...live, lines: applyEdits(m, live, { [k]: "1.2" }) });
    expect(ch[0]).toMatchObject({ name: "Per 1M input tokens", oldAmount: 1.5, newAmount: 1.2 });
  });
  it("counts a cell priced for the first time as new", () => {
    const empty = { ...live, lines: [] };
    const ch = priceChanges(m, empty, { ...live, lines: [{ meter: "video_second" as const, unit_usd: 0.1, when: { resolution: "720p" } }] });
    expect(ch).toEqual([expect.objectContaining({ oldAmount: null, newAmount: 0.1, percent: null })]);
  });
  it("lists every price a replaced change held, with what is saved instead", () => {
    const k360 = lineKey("video_second", { resolution: "360p" });
    const lines = applyEdits(m, scheduled, { [k360]: "0.05" });
    const list = replacedList(m, scheduled, lines);
    expect(list).toHaveLength(scheduled.lines.length);
    expect(list[0]).toMatchObject({ name: "360p, per second of video", oldAmount: 0.023172, newAmount: 0.05 });
    expect(list[1]).toMatchObject({ oldAmount: 0.069504, newAmount: 0.069504, same: true });
  });
});

describe("when", () => {
  it("now is now; a date is the IST date and typed time", () => {
    expect(whenInstant({ mode: "now", date: "2026-11-25", time: "00:00" }, NOW)).toEqual(NOW);
    expect(whenInstant({ mode: "date", date: "2026-12-03", time: "1:30 pm" }, NOW)?.toISOString()).toBe("2026-12-03T08:00:00.000Z");
    expect(whenInstant({ mode: "date", date: "2026-12-03", time: "25" }, NOW)).toBeNull();
  });
  it("explains a time it can't read and a moment that has passed", () => {
    expect(whenProblem({ mode: "date", date: "2026-12-03", time: "soon" }, NOW)).toBe("Type a time like 8, 8:00, 8 pm or 20:00.");
    expect(whenProblem({ mode: "date", date: "2026-11-24", time: "11:00" }, NOW)).toBe("That moment has passed. Pick a later time or choose Now.");
    expect(whenProblem({ mode: "date", date: "2026-11-24", time: "13:00" }, NOW)).toBeNull();
    expect(whenProblem({ mode: "now", date: "", time: "" }, NOW)).toBeNull();
  });
});

describe("replacedRow and beforePrice", () => {
  const all = prices(OMNI);
  const [live, scheduled] = all;
  it("a start on the scheduled change's IST day replaces it, at any time that day", () => {
    expect(replacedRow(all, { mode: "date", date: "2026-12-03", time: "20:00" }, NOW)?.id).toBe(scheduled.id);
    expect(replacedRow(all, { mode: "date", date: "2026-12-04", time: "00:00" }, NOW)).toBeNull();
    expect(replacedRow(all, { mode: "now", date: "2026-12-03", time: "13:30" }, NOW)).toBeNull();
  });
  it("compares with the replaced change, or with what would be live at the start", () => {
    expect(beforePrice(all, { mode: "date", date: "2026-12-03", time: "13:30" }, NOW)?.id).toBe(scheduled.id);
    expect(beforePrice(all, { mode: "now", date: "", time: "" }, NOW)?.id).toBe(live.id);
    expect(beforePrice(all, { mode: "date", date: "2026-12-05", time: "00:00" }, NOW)?.id).toBe(scheduled.id);
  });
});

describe("reviewWarnings", () => {
  const m = model(OMNI);
  const all = prices(OMNI);
  const [live, scheduled] = all;
  it("notes a change that still follows, a big change and a free price", () => {
    const k360 = lineKey("video_second", { resolution: "360p" });
    const kIn = lineKey("input_token", {});
    const lines = applyEdits(m, live, { [k360]: "0.06", [kIn]: "0" });
    const w = reviewWarnings(m, all, live, { ...live, lines }, { mode: "now", date: "", time: "" }, NOW);
    expect(w.map((x) => x.text)).toEqual([
      "The change scheduled for 3 Dec 2026, 13:30 IST still follows and replaces these prices then.",
      "360p, per second of video changes by +78%. Check it isn't a typo.",
      "Per 1M input tokens changes by −100%. Check it isn't a typo.",
      "Per 1M input tokens would be free.",
    ]);
  });
  it("says when nothing new would be saved over the scheduled change", () => {
    const w = reviewWarnings(m, all, scheduled, scheduled, { mode: "date", date: "2026-12-03", time: "13:30" }, NOW);
    expect(w).toEqual([{ tone: "info", text: "These are the same prices already scheduled for 3 Dec 2026, 13:30 IST. Nothing new would be saved.", same: true }]);
  });
});

describe("typical run and agencies", () => {
  const m = model(OMNI);
  const [live] = prices(OMNI);
  const k720 = lineKey("video_second", { resolution: "720p" });
  const next = { ...live, lines: applyEdits(m, live, { [k720]: "−31%" }) };
  it("works out the typical run before and after with the live settings", () => {
    const t = typicalBeforeAfter(m, live, next, settings);
    const spec = runSpec(m, next)!;
    expect(t).toEqual({ label: "8 s, 720p", before: runCredits(m, live, spec, settings), after: runCredits(m, next, spec, settings) });
    expect(t?.after).toBeLessThan(t!.before!);
  });
  it("multiplies each agency's runs this month by the typical run", () => {
    const t = { label: "x", before: 560, after: 385 };
    const rows = agenciesAffected([{ orgName: "Tide Studio", runs: 23 }, { orgName: "Digital Marketing", runs: 151 }], t);
    expect(rows).toEqual([
      { name: "Digital Marketing", runs: 151, before: 84560, after: 58135, percent: expect.closeTo(-31.25, 2) },
      { name: "Tide Studio", runs: 23, before: 12880, after: 8855, percent: expect.closeTo(-31.25, 2) },
    ]);
  });
});

describe("words", () => {
  it("bulk message", () => {
    expect(bulkMessage({ changed: 7, kept: 1, percent: -31, hasOtherCharges: true, includeOtherCharges: true })).toBe(
      "Changed 7 prices by −31%, rounded to 4 significant figures, other charges included. 1 price you typed was left as it is.",
    );
    expect(bulkMessage({ changed: 1, kept: 0, percent: 20, hasOtherCharges: true, includeOtherCharges: false })).toBe(
      "Changed 1 price by +20%, rounded to 4 significant figures. Other charges were left out.",
    );
  });
  it("confirm label", () => {
    const at = new Date("2026-12-03T08:00:00Z");
    expect(confirmLabel({ same: true, replaced: null, mode: "now", at })).toBe("Nothing new to save");
    expect(confirmLabel({ same: false, replaced: at, mode: "date", at })).toBe("Replace the 3 Dec change");
    expect(confirmLabel({ same: false, replaced: null, mode: "now", at })).toBe("Apply new prices now");
    expect(confirmLabel({ same: false, replaced: null, mode: "date", at })).toBe("Schedule for 3 Dec");
  });
  it("saved message shows the start the server gave", () => {
    const at = new Date("2026-12-03T08:00:00Z");
    expect(savedMessage({ label: "Omni", mode: "now", replaced: null, requested: NOW, effective: NOW, now: NOW })).toBe("New prices for Omni are live.");
    const moved = new Date(NOW.getTime() + 120_000);
    expect(savedMessage({ label: "Omni", mode: "date", replaced: null, requested: new Date(NOW.getTime() + 30_000), effective: moved, now: NOW })).toBe(
      "New prices for Omni start in 2 minutes, at 12:02 IST.",
    );
    expect(savedMessage({ label: "Omni", mode: "date", replaced: null, requested: at, effective: at, now: NOW })).toBe("New prices for Omni scheduled for 3 Dec 2026, 13:30 IST.");
    expect(savedMessage({ label: "Omni", mode: "date", replaced: at, requested: at, effective: at, now: NOW })).toBe("The 3 Dec change for Omni is replaced.");
  });
  it("undo plan: cancel a future row, undo a started one, nothing inside the 2-minute lead", () => {
    const later = new Date("2026-12-03T08:00:00Z");
    expect(undoPlan({ effective: later, now: NOW, replaced: null, otherScheduled: false })).toBe("cancel");
    expect(undoPlan({ effective: later, now: NOW, replaced: { id: "old" } as AiModelPrice, otherScheduled: false })).toBe("restore");
    expect(undoPlan({ effective: NOW, now: NOW, replaced: null, otherScheduled: false })).toBe("undo");
    expect(undoPlan({ effective: NOW, now: NOW, replaced: null, otherScheduled: true })).toBeNull();
    expect(undoPlan({ effective: new Date(NOW.getTime() + 120_000), now: NOW, replaced: null, otherScheduled: false })).toBeNull();
  });
});

describe("buildReview", () => {
  const m = model(OMNI);
  const all = prices(OMNI);
  const [live, scheduled] = all;
  const k360 = lineKey("video_second", { resolution: "360p" });
  const agencies = [{ orgName: "Tide Studio", runs: 23 }];

  it("editing the scheduled change at its own start replaces it, listing every price it held", () => {
    const after = { ...scheduled, lines: applyEdits(m, scheduled, { [k360]: "0.05" }) };
    const r = buildReview({ model: m, label: "Omni", prices: all, base: scheduled, after, when: { mode: "date", date: "2026-12-03", time: "20:00" }, now: NOW, settings, agencies });
    expect(r.summary).toBe("1 change, from 3 Dec 2026, 20:00 IST, in 9 days.");
    expect(r.replaced?.title).toBe("This replaces the change scheduled for 3 Dec 2026, 13:30 IST.");
    expect(r.replaced?.detail).toBe(`Every price in it is listed with what you're saving instead. Its note, "${scheduled.note?.replace(/\.$/, "")}", stays.`);
    expect(r.replaced?.rows).toHaveLength(scheduled.lines.length);
    expect(r.confirm).toBe("Replace the 3 Dec change");
    expect(r.canSave).toBe(true);
    expect(r.agencies).toHaveLength(1);
  });

  it("a change from today's prices applied now is compared with today's prices", () => {
    const after = { ...live, lines: applyEdits(m, live, { [k360]: "0.03" }) };
    const r = buildReview({ model: m, label: "Omni", prices: all, base: live, after, when: { mode: "now", date: "", time: "" }, now: NOW, settings, agencies: [] });
    expect(r.summary).toBe("1 change, starting now.");
    expect(r.replaced).toBeNull();
    expect(r.compareText).toBe("Compared with today's prices.");
    expect(r.beforeLabel).toBe("Now");
    expect(r.changes).toHaveLength(1);
    expect(r.confirm).toBe("Apply new prices now");
  });

  it("can't save the same prices over the scheduled change", () => {
    const r = buildReview({ model: m, label: "Omni", prices: all, base: scheduled, after: scheduled, when: { mode: "date", date: "2026-12-03", time: "13:30" }, now: NOW, settings, agencies: [] });
    expect(r.canSave).toBe(false);
    expect(r.confirm).toBe("Nothing new to save");
  });
});
