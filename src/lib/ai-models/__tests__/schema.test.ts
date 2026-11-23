import { describe, it, expect } from "vitest";
import { parseAiModelRow, parseAiModelPriceRow } from "../schema";

const ROW = {
  id: "gemini:gemini-omni-1.2-flash",
  provider: "gemini",
  kind: "video",
  label: "Gemini Omni 1.2 Flash",
  picker_label: "Omni 1.2",
  provider_label: "Google",
  description: null,
  status: "live",
  replaced_by: null,
  sort_order: 7,
  adapter_key: "video:gemini",
  provider_model_id: null,
  params: [
    {
      name: "resolution", label: "Resolution", component: "select", group: "primary", order: 0,
      visible: true, defaultValue: "720p", constraints: { type: "select", options: ["360p", "720p"] },
    },
  ],
  rules: [
    {
      id: "end-needs-start",
      when: { op: "and", conditions: [
        { field: "hasEndFrame", op: "eq", value: true },
        { field: "hasStartFrame", op: "eq", value: false },
      ] },
      effect: { disableGenerate: true },
      reason: "End frame needs a start frame",
    },
  ],
  capabilities: { maxDurationSeconds: 15, imageInputs: { startFrame: true, endFrame: true, maxReferenceImages: 3 } },
  updated_at: "2026-11-21T00:00:00Z",
};

describe("parseAiModelRow", () => {
  it("maps a valid row to an AiModel", () => {
    expect(parseAiModelRow(ROW)).toEqual({
      id: "gemini:gemini-omni-1.2-flash",
      provider: "gemini",
      kind: "video",
      label: "Gemini Omni 1.2 Flash",
      pickerLabel: "Omni 1.2",
      providerLabel: "Google",
      description: null,
      status: "live",
      replacedBy: null,
      sortOrder: 7,
      adapterKey: "video:gemini",
      providerModelId: null,
      params: ROW.params,
      rules: ROW.rules,
      capabilities: ROW.capabilities,
      updatedAt: "2026-11-21T00:00:00Z",
    });
  });

  it("refuses an unknown kind or status", () => {
    expect(parseAiModelRow({ ...ROW, kind: "podcast" })).toBeNull();
    expect(parseAiModelRow({ ...ROW, status: "beta" })).toBeNull();
  });

  it("refuses a param whose constraints don't fit its type", () => {
    const bad = { ...ROW, params: [{ ...ROW.params[0], constraints: { type: "slider", min: 1 } }] };
    expect(parseAiModelRow(bad)).toBeNull();
  });

  it("refuses a rule with an unknown condition field", () => {
    const bad = { ...ROW, rules: [{ ...ROW.rules[0], when: { field: "colour", op: "eq", value: true } }] };
    expect(parseAiModelRow(bad)).toBeNull();
  });

  it("refuses an empty provider model name, but keeps a missing one", () => {
    expect(parseAiModelRow({ ...ROW, provider_model_id: "" })).toBeNull();
    expect(parseAiModelRow({ ...ROW, provider_model_id: null })).not.toBeNull();
    expect(parseAiModelRow({ ...ROW, provider_model_id: "gemini-omni-1.2-flash" })?.providerModelId).toBe("gemini-omni-1.2-flash");
  });
});

const PRICE = {
  id: "p1",
  model_id: "gemini:gemini-omni-1.2-flash",
  effective_from: "2026-11-21T00:00:00Z",
  lines: [
    { meter: "video_output_token", unit_usd: 0.000012 },
    { meter: "video_second", unit_usd: 0.104, when: { resolution: "1080p" } },
  ],
  estimate: { thought_token: 1500 },
  source_url: "https://aistudio.google.com/docs/pricing",
  note: null,
};

describe("parseAiModelPriceRow", () => {
  it("maps a valid row to an AiModelPrice", () => {
    expect(parseAiModelPriceRow(PRICE)).toEqual({
      id: "p1",
      modelId: "gemini:gemini-omni-1.2-flash",
      effectiveFrom: "2026-11-21T00:00:00Z",
      lines: PRICE.lines,
      estimate: { thought_token: 1500 },
      sourceUrl: "https://aistudio.google.com/docs/pricing",
      note: null,
    });
  });

  it("refuses an unknown meter, a negative price or no lines", () => {
    expect(parseAiModelPriceRow({ ...PRICE, lines: [{ meter: "vibes", unit_usd: 1 }] })).toBeNull();
    expect(parseAiModelPriceRow({ ...PRICE, lines: [{ meter: "request", unit_usd: -1 }] })).toBeNull();
    expect(parseAiModelPriceRow({ ...PRICE, lines: [] })).toBeNull();
  });
});

describe("capabilities by kind (D539)", () => {
  const IMAGE = {
    ...ROW,
    id: "openai:gpt-image-2",
    kind: "image",
    rules: [],
    capabilities: { maxReferenceImages: 16, maxReferenceSizeBytes: 52428800, maxImageEdgePx: 3840, supportsMask: true },
  };

  it("keeps an image row's capabilities", () => {
    expect(parseAiModelRow(IMAGE)?.capabilities).toEqual(IMAGE.capabilities);
  });

  it("refuses an image row with no reference limit, or one that is not a number", () => {
    expect(parseAiModelRow({ ...IMAGE, capabilities: { maxReferenceSizeBytes: 0 } })).toBeNull();
    expect(parseAiModelRow({ ...IMAGE, capabilities: { ...IMAGE.capabilities, maxReferenceImages: "16" } })).toBeNull();
    expect(parseAiModelRow({ ...IMAGE, capabilities: { ...IMAGE.capabilities, supportsMask: "yes" } })).toBeNull();
  });

  it("refuses a video row with no image inputs, or a frame flag that is not a boolean", () => {
    expect(parseAiModelRow({ ...ROW, capabilities: { maxDurationSeconds: 15 } })).toBeNull();
    expect(
      parseAiModelRow({
        ...ROW,
        capabilities: { maxDurationSeconds: 15, imageInputs: { startFrame: "yes", endFrame: true, maxReferenceImages: 3 } },
      }),
    ).toBeNull();
  });

  it("drops a key it does not know instead of refusing the row", () => {
    expect(parseAiModelRow({ ...IMAGE, capabilities: { ...IMAGE.capabilities, futureFlag: 1 } })?.capabilities).toEqual(IMAGE.capabilities);
  });

  it("leaves the other kinds' capabilities as they are", () => {
    expect(parseAiModelRow({ ...ROW, id: "sarvam:dub", kind: "dub", params: [], rules: [], capabilities: {} })?.capabilities).toEqual({});
  });
});
