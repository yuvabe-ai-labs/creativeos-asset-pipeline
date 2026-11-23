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
  const params = row(OMNI12).params;
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
  it("passes every seeded price row of every model", () => {
    for (const p of catalog.prices) {
      const m = catalog.models.find((x) => x.id === p.modelId)!;
      expect(priceConditionProblems(m.params, p.lines), p.modelId).toEqual([]);
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

describe("checkParamsChange", () => {
  const old = row(OMNI12).params;
  const prices = catalog.prices.filter((p) => p.modelId === OMNI12);
  const res = old.find((p) => p.name === "resolution")!;
  const swap = (name: string, f: (p: (typeof old)[number]) => (typeof old)[number]) =>
    old.map((p) => (p.name === name ? f(p) : p));

  it("accepts label, default, visible and order changes", () => {
    const next = swap("resolution", (p) => ({ ...p, label: "Size", visible: !p.visible, order: p.order + 5 }));
    expect(checkParamsChange(old, next, prices)).toEqual({ ok: true });
  });
  it("refuses a rename", () => {
    const next = swap("resolution", (p) => ({ ...p, name: "res" }));
    expect(checkParamsChange(old, next, prices).ok).toBe(false);
  });
  it("refuses a component or constraint type change", () => {
    const next = swap("resolution", (p) => ({ ...p, component: "toggle", constraints: { type: "toggle" } }));
    expect(checkParamsChange(old, next, prices).ok).toBe(false);
  });
  it("refuses removing an option a price line uses", () => {
    expect(res.constraints.type).toBe("select");
    const next = swap("resolution", (p) => ({
      ...p,
      constraints: { type: "select", options: (p.constraints as { options: string[] }).options.filter((o) => o !== "1080p") },
    }));
    expect(checkParamsChange(old, next, prices).ok).toBe(false);
  });
});

describe("runPreviewUsd", () => {
  it("prices a default-settings image and video run, and nothing for other kinds", () => {
    const imagePrice = catalog.prices.find((p) => p.modelId === NANO_PRO)!;
    const videoPrice = catalog.prices.find((p) => p.modelId === OMNI12)!;
    expect(runPreviewUsd(row(NANO_PRO), imagePrice)).toBeGreaterThan(0);
    expect(runPreviewUsd(row(OMNI12), videoPrice)).toBeGreaterThan(0);
    const text = catalog.models.find((m) => m.kind === "text")!;
    expect(runPreviewUsd(text, catalog.prices.find((p) => p.modelId === text.id)!)).toBeNull();
  });
});
