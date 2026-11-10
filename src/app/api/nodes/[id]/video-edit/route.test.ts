import { describe, it, expect, vi, beforeEach } from "vitest";
import { videoEditEstimateCredits } from "@/lib/video-edit/record";
import { GEMINI_OMNI_12_IMAGE_INPUTS } from "@/lib/video-gen/gemini-omni-shape";
import { GEMINI_OMNI_11_MODEL_ID, GEMINI_OMNI_12_MODEL_ID } from "@/lib/video-gen/client-models";

vi.mock("server-only", () => ({}));
const editorLock = vi.hoisted(() => ({ value: null as null | "editor" | "dub" }));
vi.mock("@/lib/db/generation-lock", () => ({ getEditorGenerationLock: async () => editorLock.value }));
const mocks = vi.hoisted(() => ({
  node: { type: "video-gen", canvas_id: "c1" } as Record<string, unknown>,
  getVersionById: vi.fn(),
  hasRunning: vi.fn(async () => false),
  collect: vi.fn(),
  insertGeneration: vi.fn(async () => ({ id: "gen-7" })),
  failGeneration: vi.fn(async () => undefined),
  reserveCredits: vi.fn(async () => ({ ok: true })),
  refundReservation: vi.fn(async () => undefined),
  trigger: vi.fn(async () => ({ id: "run" })),
}));
vi.mock("@/lib/api/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route-helpers")>("@/lib/api/route-helpers");
  return { ...actual, withNode: (_r: Request, _p: unknown, fn: (...a: unknown[]) => Promise<Response>) => fn("n1", mocks.node, { userId: "u1", email: "u@x.com" }, "client-1", "org-1") };
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
  mocks.node = { type: "video-gen", canvas_id: "c1" };
  process.env.GOOGLE_GENAI_API_KEY = "k";
  mocks.getVersionById.mockResolvedValue(BASE);
  mocks.collect.mockResolvedValue({ direct: [], promptNodes: [], promptUpstreamBatches: [], images: [PACK] });
});

describe("POST /api/nodes/[id]/video-edit", () => {
  it("records a video generation with the edit, reserves Omni credits and triggers video-generate", async () => {
    const res = await post(BODY);
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ generationId: "gen-7" });
    const call = (mocks.insertGeneration.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(call).toMatchObject({ nodeId: "n1", orgId: "org-1", type: "edit", modelUsed: "gemini:gemini-omni-1.2-flash", paramsSnapshot: { resolution: "720p", durationSeconds: 6 } });
    const snapshot = call.inputsSnapshot as Record<string, unknown>;
    expect(snapshot.referenceUrls).toEqual([PACK.imageUrl]);
    expect(snapshot.videoEdit).toMatchObject({ baseVersionId: "v3", rootVersionId: "v3", instruction: "Make the flour beige", referenceNodeIds: ["n-pack"], referenceUrls: [PACK.imageUrl], resolution: "720p" });
    expect(snapshot.prompt).toContain("<IMAGE_REF_0> is Jackfruit 365 pack.");
    expect(mocks.reserveCredits).toHaveBeenCalledWith("org-1", "gen-7", videoEditEstimateCredits(6, "720p", GEMINI_OMNI_12_MODEL_ID));
    expect(mocks.trigger).toHaveBeenCalledWith("video-generate", expect.objectContaining({
      generationId: "gen-7", modelId: "gemini:gemini-omni-1.2-flash", editVideoUrl: TAKE,
      referenceUrls: [PACK.imageUrl], params: { resolution: "720p", durationSeconds: 6 }, mockMode: false,
    }));
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
    const many = Array.from({ length: GEMINI_OMNI_12_IMAGE_INPUTS.maxReferenceImages + 1 }, (_, i) => `n-${i}`);
    const res = await post({ ...BODY, referenceNodeIds: many });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: `Omni 1.2 takes up to ${GEMINI_OMNI_12_IMAGE_INPUTS.maxReferenceImages} references. Untick some.` });
    expect(mocks.insertGeneration).not.toHaveBeenCalled();
  });

  it("runs on Omni 1.1 when asked, with 1.1's price, limits and model on the record", async () => {
    const res = await post({ ...BODY, modelId: GEMINI_OMNI_11_MODEL_ID });
    expect(res.status).toBe(202);
    const call = (mocks.insertGeneration.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(call).toMatchObject({ type: "edit", modelUsed: GEMINI_OMNI_11_MODEL_ID });
    expect((call.inputsSnapshot as { videoEdit: { modelId: string } }).videoEdit.modelId).toBe(GEMINI_OMNI_11_MODEL_ID);
    expect(mocks.reserveCredits).toHaveBeenCalledWith("org-1", "gen-7", videoEditEstimateCredits(6, "720p", GEMINI_OMNI_11_MODEL_ID));
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
