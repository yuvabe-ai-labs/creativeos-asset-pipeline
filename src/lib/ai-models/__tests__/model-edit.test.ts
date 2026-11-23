import { describe, it, expect } from "vitest";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import {
  checkModelPatch, checkNewPrice, checkParamsChange, priceConditionProblems, runPreviewUsd,
} from "@/lib/ai-models/model-edit";
import type { AiModel } from "@/lib/ai-models/types";

const catalog = seededModelCatalog();
const row = (id: string) => catalog.models.find((m) => m.id === id)!;
// The row as the database holds it (snake_case), which is what the action reads and patches.
const raw = (m: AiModel) => ({
  id: m.id, provider: m.provider, kind: m.kind, label: m.label, picker_label: m.pickerLabel,
  provider_label: m.providerLabel, description: m.description, status: m.status, replaced_by: m.replacedBy,
  sort_order: m.sortOrder, adapter_key: m.adapterKey, provider_model_id: m.providerModelId,
  params: m.params, rules: m.rules, capabilities: m.capabilities, updated_at: m.updatedAt,
});
const keys = new Set(catalog.models.filter((m) => m.status !== "retired").map((m) => m.adapterKey));
const ctx = { models: catalog.models, prices: catalog.prices, runnableKeys: keys };
const NANO_PRO = "gemini:gemini-3-pro-image";
const GPT1 = "openai:gpt-image-1"; // retired, no adapter
const SUNBURST = "openai:gpt-image-2.5-sunburst";
const OMNI12 = "gemini:gemini-omni-1.2-flash";

describe("checkModelPatch", () => {
  it("accepts a label, order and description change", () => {
    const r = checkModelPatch(raw(row(NANO_PRO)), { label: "Pro", sort_order: 3, description: "x" }, ctx);
    expect(r).toEqual({ ok: true, fields: { label: "Pro", sort_order: 3, description: "x" } });
  });

  it("refuses any field outside the editable list", () => {
    for (const patch of [{ params: [] }, { adapter_key: "image:x" }, { provider_model_id: "y" }, { kind: "video" }]) {
      expect(checkModelPatch(raw(row(NANO_PRO)), patch, ctx).ok).toBe(false);
    }
  });

  it("lets a model go live only with an adapter in this build", () => {
    expect(checkModelPatch(raw(row(GPT1)), { status: "live", replaced_by: null }, ctx)).toEqual({
      ok: false, error: "This model can't go live: this build has no code to run it.",
    });
    expect(checkModelPatch(raw(row(NANO_PRO)), { status: "hidden" }, ctx).ok).toBe(true);
  });

  it("takes a live same-kind replacement only when retiring, and clears it otherwise", () => {
    const retire = checkModelPatch(raw(row(NANO_PRO)), { status: "retired", replaced_by: SUNBURST }, ctx);
    expect(retire).toEqual({ ok: true, fields: { status: "retired", replaced_by: SUNBURST } });
    for (const bad of [OMNI12, NANO_PRO, GPT1, "nope:nope"]) {
      expect(checkModelPatch(raw(row(NANO_PRO)), { status: "retired", replaced_by: bad }, ctx)).toEqual({
        ok: false, error: "Pick a live model of the same kind as the replacement.",
      });
    }
    const live = checkModelPatch(raw(row(GPT1)), { status: "hidden" }, { ...ctx, runnableKeys: new Set([...keys, row(GPT1).adapterKey]) });
    expect(live).toEqual({ ok: true, fields: { status: "hidden", replaced_by: null } });
  });

  it("refuses a patch whose row would fail the catalog's check", () => {
    const r = checkModelPatch(raw(row(NANO_PRO)), { label: 42 }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("These changes would break the model's settings.");
  });
});

describe("priceConditionProblems", () => {
  const params = row(OMNI12);
  it("passes conditions that name a param and one of its values", () => {
    expect(priceConditionProblems(params, [{ meter: "video_second", unit_usd: 0.1, when: { resolution: "1080p" } }])).toEqual([]);
  });
  it("flags an unknown param or a value the param can't take", () => {
    expect(priceConditionProblems(params, [{ meter: "video_second", unit_usd: 0.1, when: { colour: "red" } }])).toHaveLength(1);
    expect(priceConditionProblems(params, [{ meter: "video_second", unit_usd: 0.1, when: { resolution: "8k" } }])).toHaveLength(1);
  });
  it("accepts the price dimensions the estimators add that are not params", () => {
    expect(priceConditionProblems(params, [{ meter: "video_second", unit_usd: 0.1, when: { audio: true } }])).toEqual([]);
  });
  it("flags dead conditions: a non-dimension param, a bad value, the wrong kind", () => {
    const cond = (when: Record<string, string | number | boolean>) => [{ meter: "video_second" as const, unit_usd: 0.1, when }];
    expect(priceConditionProblems(row(OMNI12), cond({ duration: 5 }))).toHaveLength(1);
    expect(priceConditionProblems(row(OMNI12), cond({ audio: "yes" }))).toHaveLength(1);
    expect(priceConditionProblems(row(NANO_PRO), cond({ size: "8K" }))).toHaveLength(1);
    expect(priceConditionProblems(row(NANO_PRO), cond({ resolution: "720p" }))).toHaveLength(1);
    expect(priceConditionProblems(row(NANO_PRO), cond({ quality: "high" }))).toHaveLength(1);
    expect(priceConditionProblems(row(NANO_PRO), cond({ size: "1K" }))).toEqual([]);
  });
  it("passes every seeded price row of every model", () => {
    for (const p of catalog.prices) {
      const m = catalog.models.find((x) => x.id === p.modelId)!;
      expect(priceConditionProblems(m, p.lines), p.modelId).toEqual([]);
    }
  });
});

describe("checkNewPrice", () => {
  const now = new Date("2026-11-23T10:00:00Z");
  const lines = [{ meter: "output_image" as const, unit_usd: 0.1 }];
  it("accepts a price starting now or later", () => {
    expect(checkNewPrice(row(NANO_PRO), { effectiveFrom: now, lines, estimate: {} }, [], now)).toEqual({ ok: true });
  });
  it("refuses the past, a taken start, and a condition on an unknown setting", () => {
    expect(checkNewPrice(row(NANO_PRO), { effectiveFrom: new Date("2026-11-22T00:00:00Z"), lines, estimate: {} }, [], now))
      .toEqual({ ok: false, error: "A price can't start in the past." });
    const taken = [{ ...catalog.prices[0], modelId: NANO_PRO, effectiveFrom: "2026-12-01T00:00:00.000Z" }];
    expect(checkNewPrice(row(NANO_PRO), { effectiveFrom: new Date("2026-12-01T00:00:00Z"), lines, estimate: {} }, taken, now))
      .toEqual({ ok: false, error: "This model already has a price starting then." });
    expect(checkNewPrice(row(NANO_PRO), { effectiveFrom: now, lines: [{ ...lines[0], when: { colour: "red" } }], estimate: {} }, [], now))
      .toEqual({ ok: false, error: "A price condition names a setting this model doesn't have." });
  });
});

describe("checkNewPrice schema and boundary", () => {
  const now = new Date("2026-11-23T10:00:00Z");
  const ok = [{ meter: "output_image" as const, unit_usd: 0.1 }];
  const run = (lines: unknown, estimate: Record<string, number> = {}, from = now) =>
    checkNewPrice(row(NANO_PRO), { effectiveFrom: from, lines: lines as never, estimate }, [], now);
  const broke = { ok: false, error: "These changes would break the model's settings." };
  it("refuses rows the catalog would drop", () => {
    expect(run([{ meter: "output_image", unit_usd: "5" }])).toEqual(broke);
    expect(run([{ meter: "zzz", unit_usd: 1 }])).toEqual(broke);
    expect(run(ok, { a: -5 })).toEqual(broke);
    expect(run([])).toEqual(broke);
    expect(run([{ meter: "output_image", unit_usd: NaN }])).toEqual(broke);
  });
  it("allows 59 s in the past and refuses 61 s", () => {
    expect(run(ok, {}, new Date(now.getTime() - 59_000))).toEqual({ ok: true });
    expect(run(ok, {}, new Date(now.getTime() - 61_000))).toEqual({ ok: false, error: "A price can't start in the past." });
  });
});

describe("checkParamsChange", () => {
  const omni = row(OMNI12);
  const old = omni.params;
  const prices = catalog.prices.filter((p) => p.modelId === OMNI12);
  const swap = (name: string, f: (p: (typeof old)[number]) => (typeof old)[number]) =>
    old.map((p) => (p.name === name ? f(p) : p));
  const opts = (p: (typeof old)[number]) => (p.constraints as { options: string[] }).options;
  const sel = (p: (typeof old)[number], options: string[]) => ({ ...p, constraints: { type: "select" as const, options } });

  it("accepts the same params and label, visible and order changes", () => {
    expect(checkParamsChange(omni, old, prices)).toEqual({ ok: true });
    for (const m of catalog.models.filter((x) => x.kind === "image" || x.kind === "video")) {
      expect(checkParamsChange(m, m.params, catalog.prices.filter((p) => p.modelId === m.id)), m.id).toEqual({ ok: true });
    }
    const next = swap("resolution", (p) => ({ ...p, label: "Size", visible: !p.visible, order: p.order + 5 }));
    expect(checkParamsChange(omni, next, prices)).toEqual({ ok: true });
  });
  it("refuses a rename, an added or a removed param", () => {
    expect(checkParamsChange(omni, swap("resolution", (p) => ({ ...p, name: "res" })), prices).ok).toBe(false);
    expect(checkParamsChange(omni, old.slice(1), prices).ok).toBe(false);
    expect(checkParamsChange(omni, [...old, { ...old[0], name: "extra" }], prices).ok).toBe(false);
  });
  it("refuses a component or constraint type change", () => {
    const next = swap("resolution", (p) => ({ ...p, component: "toggle", constraints: { type: "toggle" } }));
    expect(checkParamsChange(omni, next, prices).ok).toBe(false);
  });
  it("refuses removing an option a price line uses", () => {
    const next = swap("resolution", (p) => sel(p, opts(p).filter((o) => o !== "1080p")));
    expect(checkParamsChange(omni, next, prices).ok).toBe(false);
  });
  it("refuses a default that is no longer valid", () => {
    const next = swap("resolution", (p) => ({ ...p, defaultValue: "8k" }));
    expect(checkParamsChange(omni, next, prices).ok).toBe(false);
  });
  it("refuses a rule lock the param can no longer take", () => {
    const m = { ...omni, rules: [{ id: "r", when: { field: "duration" as const, op: "gt" as const, value: 1 }, effect: { lockParams: [{ name: "resolution", value: "720p" }] }, reason: "x" }] };
    const next = swap("resolution", (p) => ({ ...sel(p, ["1080p"]), defaultValue: "1080p" }));
    expect(checkParamsChange(m, next, []).ok).toBe(false);
    expect(checkParamsChange(m, old, []).ok).toBe(true);
  });
  it("refuses removing an image size or an OpenAI aspect ratio a price uses", () => {
    const nano = row(NANO_PRO);
    const np = catalog.prices.filter((p) => p.modelId === NANO_PRO);
    const size = nano.params.find((p) => p.name === "image_size")!;
    const used = np.flatMap((p) => p.lines.map((l) => l.when?.size)).find((v) => typeof v === "string") as string;
    const dropped = nano.params.map((p) => (p === size ? { ...sel(p, opts(p).filter((o) => o !== used)), defaultValue: null } : p));
    expect(checkParamsChange(nano, dropped, np).ok).toBe(false);
    const gpt = row(SUNBURST);
    const gp = catalog.prices.filter((p) => p.modelId === SUNBURST);
    const ar = gpt.params.find((p) => p.name === "aspect_ratio")!;
    const only11 = gpt.params.map((p) => (p === ar ? { ...sel(p, ["1:1"]), defaultValue: "1:1" } : p));
    expect(checkParamsChange(gpt, only11, gp).ok).toBe(false);
  });
  it("refuses a slider range that excludes a default", () => {
    const m = { ...omni, params: [{ ...old[0], component: "slider" as const, constraints: { type: "slider" as const, min: 1, max: 10 }, defaultValue: 5 }] };
    const next = [{ ...m.params[0], constraints: { type: "slider" as const, min: 6, max: 10 } }];
    expect(checkParamsChange(m, next, []).ok).toBe(false);
  });
});

describe("runPreviewUsd", () => {
  it("prices a default-settings image and video run, and nothing for other kinds", () => {
    const imagePrice = catalog.prices.find((p) => p.modelId === NANO_PRO)!;
    const videoPrice = catalog.prices.find((p) => p.modelId === OMNI12)!;
    expect(runPreviewUsd(row(NANO_PRO), imagePrice)).toBeGreaterThan(0);
    expect(runPreviewUsd(row(OMNI12), videoPrice)).toBeGreaterThan(0);
    const zero = { ...row(OMNI12), params: row(OMNI12).params.map((p) => (p.name === "duration" ? { ...p, defaultValue: 0 } : p)) };
    expect(runPreviewUsd(zero, videoPrice)).toBeNull();
    const text = catalog.models.find((m) => m.kind === "text")!;
    expect(runPreviewUsd(text, catalog.prices.find((p) => p.modelId === text.id)!)).toBeNull();
  });
});
