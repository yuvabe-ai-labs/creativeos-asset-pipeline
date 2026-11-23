import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AiCatalog } from "@/lib/ai-models/types";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ catalog: null as AiCatalog | null }));
const adapter = vi.hoisted(() => vi.fn(async () => ({ videoUrl: "https://x/v.mp4", durationSeconds: 8 })));
vi.mock("@/lib/ai-models/catalog", async () => {
  const { seededModelCatalog } = await import("@/lib/ai-models/test-catalog");
  return { getAiCatalog: async () => state.catalog ?? seededModelCatalog() };
});
vi.mock("@/lib/video-gen/adapters", async () => {
  const { stubAdapters } = await import("@/lib/ai-models/test-catalog");
  return { videoAdapters: stubAdapters("video", adapter) };
});

import { videoRun, videoGenerateForTask } from "../video-run";
import { seededModelCatalog, withModel } from "@/lib/ai-models/test-catalog";
import { ModelUnavailableError } from "@/lib/ai-models/runnable";

const INPUT = { prompt: "A cab door opens", referenceUrls: [], params: {} };

beforeEach(() => {
  state.catalog = null;
  adapter.mockClear();
});

describe("videoRun (D538, D540)", () => {
  it("gives the catalog's spec, with Kling's rules, and generates through the adapter", async () => {
    const r = videoRun(seededModelCatalog(), "kling:kling-3-0");
    if (!r.ok) throw new Error("expected a run");
    expect(r.spec.imageInputs).toEqual({ startFrame: true, endFrame: true, maxReferenceImages: 0 });
    expect(r.spec.rules?.map((x) => x.id)).toContain("kling-requires-start-frame");
    await r.generate(INPUT);
    expect(adapter).toHaveBeenCalledWith(INPUT, { spec: r.spec, providerModelId: "kling-3.0" });
  });

  it("refuses a retired Veo model with the plain copy", () => {
    expect(videoRun(seededModelCatalog(), "veo:veo-3.1")).toMatchObject({ ok: false, message: "This model was retired. Pick another." });
  });
});

describe("videoGenerateForTask (D541)", () => {
  it("runs a hidden model, and fails for good on a missing one", async () => {
    state.catalog = withModel(seededModelCatalog(), "kling:kling-o1", { status: "hidden" });
    await (await videoGenerateForTask("kling:kling-o1"))(INPUT);
    expect(adapter).toHaveBeenCalledTimes(1);
    await expect(videoGenerateForTask("kling:kling-9")).rejects.toThrow(ModelUnavailableError);
  });
});
