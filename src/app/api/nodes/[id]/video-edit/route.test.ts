import { describe, it, expect, vi, beforeEach } from "vitest";
import { videoEditEstimateCredits } from "@/lib/video-edit/record";
import { seededPrice } from "@/lib/ai-models/test-prices";
import { GEMINI_OMNI_11_MODEL_ID, GEMINI_OMNI_12_MODEL_ID } from "@/lib/ai-models/model-ids";
import { videoModelsFrom } from "@/lib/ai-models/model-lists";
import { seededModelCatalog, seededSettingsRow } from "@/lib/ai-models/test-catalog";

const OMNI_12_MAX_REFS = videoModelsFrom(seededModelCatalog()).get(GEMINI_OMNI_12_MODEL_ID)!.imageInputs.maxReferenceImages;

vi.mock("server-only", () => ({}));
const cat = vi.hoisted(() => ({ value: null as import("@/lib/ai-models/types").AiCatalog | null }));
vi.mock("@/lib/ai-models/catalog", async () => {
  const { seededModelCatalog } = await import("@/lib/ai-models/test-catalog");
  return { getAiCatalog: async () => cat.value ?? seededModelCatalog() };
});
vi.mock("@/lib/video-gen/adapters", async () => {
  const { stubAdapters } = await import("@/lib/ai-models/test-catalog");
  return { videoAdapters: stubAdapters("video", async () => { throw new Error("a route never generates"); }) };
});
vi.mock("@/lib/ai-models/run-price", async () => (await import("@/lib/ai-models/test-run-price")).runPriceMock());
const editorLock = vi.hoisted(() => ({ value: null as null | "editor" | "dub" }));
vi.mock("@/lib/db/generation-lock", () => ({ getEditorGenerationLock: async () => editorLock.value }));
const mocks = vi.hoisted(() => ({
  node: { type: "video-gen", canvas_id: "c1" } as Record<string, unknown>,
  getVersionById: vi.fn(),
  hasRunning: vi.fn(async () => false),
  collect: vi.fn(),
  insertGeneration: vi.fn(async () => ({ id: "gen-7", created_at: new Date().toISOString() })),
  failGeneration: vi.fn(async () => undefined),
  reserveCredits: vi.fn(async () => ({ ok: true })),
  refundReservation: vi.fn(async () => undefined),
  trigger: vi.fn(async () => ({ id: "run" })),
}));
vi.mock("@/lib/api/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route-helpers")>("@/lib/api/route-helpers");
  return { ...actual, withNode: (_r: Request, _p: unknown, _guard: unknown, fn: (...a: unknown[]) => Promise<Response>) => fn("n1", mocks.node, { userId: "u1", email: "u@x.com" }, "client-1", "org-1") };
});
vi.mock("@/lib/db/versions", () => ({ getVersionById: mocks.getVersionById }));
vi.mock("@/lib/db/generations", () => ({ insertGeneration: mocks.insertGeneration, failGeneration: mocks.failGeneration, hasRunningGeneration: mocks.hasRunning }));
vi.mock("@/lib/db/credit-transactions", () => ({ reserveCredits: mocks.reserveCredits, refundReservation: mocks.refundReservation, CreditLimitError: class extends Error {} }));
vi.mock("@/lib/video-gen/connected-images", () => ({ collectConnectedUpstream: mocks.collect }));
vi.mock("@/lib/storage", () => ({ isOwnStoredUrl: (u: string) => u.startsWith("https://storage.googleapis.com/") }));
vi.mock("@trigger.dev/sdk/v3", () => ({ tasks: { trigger: mocks.trigger } }));

import { POST } from "./route";

const TAKE = "https://storage.googleapis.com/b/v3.mp4";
const PACK = { id: "n-pack", type: "file", imageUrl: "https://storage.googleapis.com/b/pack.jpg", filename: "Jackfruit 365 pack" };
const BASE = { id: "v3", node_id: "n1", output: TAKE, error: null, params_used: { durationSeconds: 6 }, inputs_used: { prompt: "p" } };
const BODY = { baseVersionId: "v3", instruction: "Make the flour beige", referenceNodeIds: ["n-pack"], resolution: "720p" };
const post = (body: unknown) => POST(new Request("http://x/api/nodes/n1/video-edit", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "n1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  editorLock.value = null;
  cat.value = null;
  mocks.node = { type: "video-gen", canvas_id: "c1" };
  process.env.GOOGLE_GENAI_API_KEY = "k";
  mocks.getVersionById.mockResolvedValue(BASE);
  mocks.collect.mockResolvedValue({ direct: [], promptNodes: [], promptUpstreamBatches: [], images: [PACK] });
});

describe("POST /api/nodes/[id]/video-edit", () => {
  it("refuses a retired edit model before anything is recorded (D563)", async () => {
    const { seededModelCatalog, withModel } = await import("@/lib/ai-models/test-catalog");
    cat.value = withModel(seededModelCatalog(), GEMINI_OMNI_11_MODEL_ID, { status: "retired", replacedBy: GEMINI_OMNI_12_MODEL_ID });
    const res = await post({ ...BODY, modelId: GEMINI_OMNI_11_MODEL_ID });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("This model was retired. Pick another.");
    expect(mocks.insertGeneration).not.toHaveBeenCalled();
    expect(mocks.trigger).not.toHaveBeenCalled();
  });

  // D563 — "the node already uses it" for an edit is the model the base take was last edited with.
  describe("a hidden edit model", () => {
    const editedWith = (modelId: string) => ({
      ...BASE,
      inputs_used: { videoEdit: { baseVersionId: "v2", rootVersionId: "v1", instruction: "i", editPrompt: "e", referenceNodeIds: [], referenceUrls: [], resolution: "720p", modelId } },
    });
    beforeEach(async () => {
      const { seededModelCatalog, withModel } = await import("@/lib/ai-models/test-catalog");
      cat.value = withModel(seededModelCatalog(), GEMINI_OMNI_11_MODEL_ID, { status: "hidden" });
    });

    it("runs on a take already edited with it, whatever the node generates with", async () => {
      mocks.node = { type: "video-gen", canvas_id: "c1", data: { modelId: GEMINI_OMNI_12_MODEL_ID } };
      mocks.getVersionById.mockResolvedValueOnce(editedWith(GEMINI_OMNI_11_MODEL_ID));
      const res = await post({ ...BODY, modelId: GEMINI_OMNI_11_MODEL_ID });
      expect(res.status).toBe(202);
    });

    it("is refused on a take edited with another model, even when the node's model is it", async () => {
      mocks.node = { type: "video-gen", canvas_id: "c1", data: { modelId: GEMINI_OMNI_11_MODEL_ID } };
      mocks.getVersionById.mockResolvedValueOnce(editedWith(GEMINI_OMNI_12_MODEL_ID));
      const res = await post({ ...BODY, modelId: GEMINI_OMNI_11_MODEL_ID });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("This model isn't available. Pick another.");
      expect(mocks.insertGeneration).not.toHaveBeenCalled();
    });

    it("is refused on a take never edited, unless the node's own model is it", async () => {
      mocks.node = { type: "video-gen", canvas_id: "c1", data: { modelId: GEMINI_OMNI_12_MODEL_ID } };
      expect((await post({ ...BODY, modelId: GEMINI_OMNI_11_MODEL_ID })).status).toBe(400);
      mocks.node = { type: "video-gen", canvas_id: "c1", data: { modelId: GEMINI_OMNI_11_MODEL_ID } };
      expect((await post({ ...BODY, modelId: GEMINI_OMNI_11_MODEL_ID })).status).toBe(202);
    });
  });

  it("refuses a model with no price before anything is recorded (D557)", async () => {
    const { seededModelCatalog, withoutPrice } = await import("@/lib/ai-models/test-catalog");
    cat.value = withoutPrice(seededModelCatalog(), GEMINI_OMNI_12_MODEL_ID);
    const res = await post(BODY);
    expect(res.status).toBe(409);
    expect(mocks.insertGeneration).not.toHaveBeenCalled();
  });

  it("records a video generation with the edit, reserves Omni credits and triggers video-generate", async () => {
    const res = await post(BODY);
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ generationId: "gen-7" });
    const call = (mocks.insertGeneration.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(call).toMatchObject({ nodeId: "n1", orgId: "org-1", type: "edit", modelUsed: "gemini:gemini-omni-1.2-flash", modelPriceId: seededPrice("gemini:gemini-omni-1.2-flash").id, paramsSnapshot: { resolution: "720p", durationSeconds: 6 } });
    const snapshot = call.inputsSnapshot as Record<string, unknown>;
    expect(snapshot.referenceUrls).toEqual([PACK.imageUrl]);
    expect(snapshot.videoEdit).toMatchObject({ baseVersionId: "v3", rootVersionId: "v3", instruction: "Make the flour beige", referenceNodeIds: ["n-pack"], referenceUrls: [PACK.imageUrl], resolution: "720p" });
    expect(snapshot.prompt).toContain("Reference images, in the order attached: 1. Jackfruit 365 pack.");
    expect(snapshot.prompt).not.toContain("IMAGE_REF");
    expect(mocks.reserveCredits).toHaveBeenCalledWith("org-1", "gen-7", videoEditEstimateCredits(seededPrice(GEMINI_OMNI_12_MODEL_ID), 6, "720p", 1, seededSettingsRow()));
    expect(mocks.trigger).toHaveBeenCalledWith("video-generate", expect.objectContaining({
      generationId: "gen-7", modelId: "gemini:gemini-omni-1.2-flash", editVideoUrl: TAKE,
      referenceUrls: [PACK.imageUrl], params: { resolution: "720p", durationSeconds: 6 }, mockMode: false,
    }));
  });

  it("sends an @-mentioned connected image as a reference even when it wasn't ticked", async () => {
    await post({ ...BODY, referenceNodeIds: [], instruction: "Replace the pot with @[Image: pack](n-pack)" });
    const call = (mocks.insertGeneration.mock.calls[0] as unknown[])[0] as { inputsSnapshot: { prompt: string; videoEdit: { referenceNodeIds: string[] } } };
    expect(call.inputsSnapshot.videoEdit.referenceNodeIds).toEqual(["n-pack"]);
    expect(call.inputsSnapshot.prompt.startsWith("Replace the pot with Jackfruit 365 pack (reference image 1)")).toBe(true);
  });

  it("keeps the root of an edit chain", async () => {
    mocks.getVersionById.mockResolvedValueOnce({ ...BASE, inputs_used: { videoEdit: { baseVersionId: "v2", rootVersionId: "v1", instruction: "i", editPrompt: "e", referenceNodeIds: [], referenceUrls: [], resolution: "720p" } } });
    await post(BODY);
    const call = (mocks.insertGeneration.mock.calls[0] as unknown[])[0] as { inputsSnapshot: { videoEdit: { rootVersionId: string } } };
    expect(call.inputsSnapshot.videoEdit.rootVersionId).toBe("v1");
  });

  it("dedupes references and names the cap when too many are sent", async () => {
    await post({ ...BODY, referenceNodeIds: ["n-pack", "n-pack"] });
    const call = (mocks.insertGeneration.mock.calls[0] as unknown[])[0] as { inputsSnapshot: { videoEdit: { referenceNodeIds: string[] } } };
    expect(call.inputsSnapshot.videoEdit.referenceNodeIds).toEqual(["n-pack"]);
    mocks.insertGeneration.mockClear();
    const many = Array.from({ length: OMNI_12_MAX_REFS + 1 }, (_, i) => `n-${i}`);
    const res = await post({ ...BODY, referenceNodeIds: many });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: `Omni 1.2 takes up to ${OMNI_12_MAX_REFS} references. Untick some.` });
    expect(mocks.insertGeneration).not.toHaveBeenCalled();
  });

  // The limits are the catalog's, and only checked once the edit may run at all.
  describe("limits and their order", () => {
    const PACK2 = { ...PACK, id: "n-pack-2", imageUrl: "https://storage.googleapis.com/b/pack2.jpg" };
    const lowerOmni12Cap = async (max: number) => {
      const { seededModelCatalog, withModel } = await import("@/lib/ai-models/test-catalog");
      const base = seededModelCatalog();
      const row = base.models.find((m) => m.id === GEMINI_OMNI_12_MODEL_ID)!;
      const caps = row.capabilities as { imageInputs: Record<string, unknown> };
      return withModel(base, GEMINI_OMNI_12_MODEL_ID, {
        capabilities: { ...row.capabilities, imageInputs: { ...caps.imageInputs, maxReferenceImages: max } },
      });
    };

    it("names the catalog's reference cap and records nothing", async () => {
      cat.value = await lowerOmni12Cap(1);
      mocks.collect.mockResolvedValue({ direct: [], promptNodes: [], promptUpstreamBatches: [], images: [PACK, PACK2] });
      const res = await post({ ...BODY, referenceNodeIds: ["n-pack", "n-pack-2"] });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Omni 1.2 takes up to 1 references. Untick some." });
      expect(mocks.insertGeneration).not.toHaveBeenCalled();
      expect(mocks.reserveCredits).not.toHaveBeenCalled();
    });

    it("gives a retired model's refusal, not a limits message", async () => {
      const { seededModelCatalog, withModel } = await import("@/lib/ai-models/test-catalog");
      cat.value = withModel(seededModelCatalog(), GEMINI_OMNI_11_MODEL_ID, { status: "retired", replacedBy: GEMINI_OMNI_12_MODEL_ID });
      const many = Array.from({ length: 20 }, (_, i) => `n-${i}`);
      const res = await post({ ...BODY, modelId: GEMINI_OMNI_11_MODEL_ID, referenceNodeIds: many });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("This model was retired. Pick another.");
      expect(mocks.insertGeneration).not.toHaveBeenCalled();
    });

    it("gives the lock, not a limits message, for a clip in the Editor's reel", async () => {
      editorLock.value = "editor";
      const many = Array.from({ length: OMNI_12_MAX_REFS + 1 }, (_, i) => `n-${i}`);
      const res = await post({ ...BODY, referenceNodeIds: many });
      expect(res.status).toBe(409);
      expect((await res.json()).error).not.toContain("references");
      expect(mocks.insertGeneration).not.toHaveBeenCalled();
    });
  });

  it("with no model sent, runs on the first edit model offered on this take (Omni 1.2 hidden)", async () => {
    const { seededModelCatalog, withModel } = await import("@/lib/ai-models/test-catalog");
    cat.value = withModel(seededModelCatalog(), GEMINI_OMNI_12_MODEL_ID, { status: "hidden" });
    mocks.node = { type: "video-gen", canvas_id: "c1", data: { modelId: "kling:kling-3-0-omni" } };
    const res = await post(BODY);
    expect(res.status).toBe(202);
    const call = (mocks.insertGeneration.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(call).toMatchObject({ modelUsed: GEMINI_OMNI_11_MODEL_ID });
  });

  it("runs on Omni 1.1 when asked, with 1.1's price, limits and model on the record", async () => {
    const res = await post({ ...BODY, modelId: GEMINI_OMNI_11_MODEL_ID });
    expect(res.status).toBe(202);
    const call = (mocks.insertGeneration.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(call).toMatchObject({ type: "edit", modelUsed: GEMINI_OMNI_11_MODEL_ID });
    expect((call.inputsSnapshot as { videoEdit: { modelId: string } }).videoEdit.modelId).toBe(GEMINI_OMNI_11_MODEL_ID);
    expect(mocks.reserveCredits).toHaveBeenCalledWith("org-1", "gen-7", videoEditEstimateCredits(seededPrice(GEMINI_OMNI_11_MODEL_ID), 6, "720p", 1, seededSettingsRow()));
    expect(mocks.trigger).toHaveBeenCalledWith("video-generate", expect.objectContaining({ modelId: GEMINI_OMNI_11_MODEL_ID }));
    // 1.1 takes up to 10 s; 1.2 up to 15 s.
    mocks.insertGeneration.mockClear();
    mocks.getVersionById.mockResolvedValueOnce({ ...BASE, params_used: { durationSeconds: 12 } });
    const long = await post({ ...BODY, modelId: GEMINI_OMNI_11_MODEL_ID });
    expect(long.status).toBe(400);
    expect(await long.json()).toEqual({ error: "Omni 1.1 edits takes up to 10 seconds." });
    expect(mocks.insertGeneration).not.toHaveBeenCalled();
  });

  it("400s before recording anything on a bad request", async () => {
    expect((await post({ ...BODY, instruction: "  " })).status).toBe(400);
    expect((await post({ ...BODY, resolution: "8k" })).status).toBe(400);
    expect((await post({ ...BODY, modelId: "veo:veo-3.1" })).status).toBe(400);
    expect((await post({ ...BODY, referenceNodeIds: ["not-connected"] })).status).toBe(400);
    mocks.getVersionById.mockResolvedValueOnce({ ...BASE, node_id: "other" });
    expect((await post(BODY)).status).toBe(400);
    mocks.getVersionById.mockResolvedValueOnce({ ...BASE, error: "boom" });
    expect((await post(BODY)).status).toBe(400);
    mocks.getVersionById.mockResolvedValueOnce({ ...BASE, params_used: { durationSeconds: 16 } });
    expect((await post(BODY)).status).toBe(400);
    mocks.node = { type: "image-gen", canvas_id: "c1" };
    expect((await post(BODY)).status).toBe(404);
    expect(mocks.insertGeneration).not.toHaveBeenCalled();
    expect(mocks.reserveCredits).not.toHaveBeenCalled();
  });

  it("409s while the node is already working, and refuses a clip in the Editor's reel", async () => {
    mocks.hasRunning.mockResolvedValueOnce(true);
    expect((await post(BODY)).status).toBe(409);
    editorLock.value = "editor";
    expect((await post(BODY)).status).toBe(409);
    expect(mocks.insertGeneration).not.toHaveBeenCalled();
  });

  it("fails and refunds if the trigger throws after reserving", async () => {
    mocks.trigger.mockRejectedValueOnce(new Error("trigger down"));
    const res = await post(BODY);
    expect(res.status).toBe(500);
    expect(mocks.failGeneration).toHaveBeenCalled();
    expect(mocks.refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "gen-7" });
  });
});
