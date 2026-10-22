import { describe, it, expect, vi, beforeEach } from "vitest";
import { dubCredits } from "@/lib/dubbing/cost";

vi.mock("server-only", () => ({}));
const editorLock = vi.hoisted(() => ({ value: null as null | "editor" | "dub" }));
vi.mock("@/lib/db/generation-lock", () => ({ getEditorGenerationLock: async () => editorLock.value }));
const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  running: vi.fn(async () => false),
  insertGeneration: vi.fn(async () => ({ id: "gen-1" })),
  failGeneration: vi.fn(async () => undefined),
  reserveCredits: vi.fn(async () => ({ ok: true })),
  refundReservation: vi.fn(async () => undefined),
  sign: vi.fn(async () => ({ dubbed: { putUrl: "https://put/v", url: "https://own/v.mp4" }, dubbedAudio: { putUrl: "https://put/a", url: "https://own/a.mp3" } })),
  trigger: vi.fn(async () => ({ id: "run" })),
  nodeType: { value: "dubbing" },
}));
vi.mock("@/lib/api/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route-helpers")>("@/lib/api/route-helpers");
  return { ...actual, withNode: (_r: Request, _p: unknown, fn: (...a: unknown[]) => Promise<Response>) => fn("n1", { type: mocks.nodeType.value }, { userId: "u1", email: "u@x.com" }, "client-1", "org-1") };
});
vi.mock("@/lib/dubbing/source", () => ({ resolveDubSource: mocks.resolve }));
vi.mock("@/lib/db/nodes", () => ({ getUpstreamOutputs: vi.fn() }));
vi.mock("@/lib/db/versions", () => ({ getVersionById: vi.fn() }));
vi.mock("@/lib/db/generations", () => ({ insertGeneration: mocks.insertGeneration, failGeneration: mocks.failGeneration, hasRunningGeneration: mocks.running }));
vi.mock("@/lib/db/credit-transactions", () => ({ reserveCredits: mocks.reserveCredits, refundReservation: mocks.refundReservation, CreditLimitError: class extends Error {} }));
vi.mock("@/lib/storage", () => ({ signDubbingUploads: mocks.sign }));
vi.mock("@trigger.dev/sdk/v3", () => ({ tasks: { trigger: mocks.trigger } }));

import { POST } from "./route";

const post = (body: unknown) => POST(new Request("http://x/api/nodes/n1/dub", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "n1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.nodeType.value = "dubbing";
  process.env.SARVAM_API_KEY = "k";
  mocks.resolve.mockResolvedValue({ ok: true, sourceNodeId: "vg", sourceVersionId: "sv", sourceUrl: "https://own/src.mp4", durationSeconds: 8 });
});

describe("POST /api/nodes/[id]/dub", () => {
  it("records the source, reserves the dub's credits and triggers video-dub", async () => {
    const res = await post({ language: "ta-IN", style: "formal" });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ generationId: "gen-1" });
    expect(mocks.insertGeneration).toHaveBeenCalledWith(expect.objectContaining({
      nodeId: "n1", orgId: "org-1", clientId: "client-1", userId: "u1", type: "dub", modelUsed: "sarvam:dub",
      paramsSnapshot: { durationSeconds: 8 },
      inputsSnapshot: { dub: { sourceNodeId: "vg", sourceVersionId: "sv", sourceUrl: "https://own/src.mp4", srcLang: "en-IN", targetLang: "ta-IN", durationSeconds: 8, provider: "sarvam", model: "sarvam-dub", style: "formal" } },
    }));
    expect(mocks.reserveCredits).toHaveBeenCalledWith("org-1", "gen-1", dubCredits(8));
    expect(mocks.trigger).toHaveBeenCalledWith("video-dub", {
      generationId: "gen-1", sourceUrl: "https://own/src.mp4", targetLang: "ta-IN", style: "formal",
      dubbedPutUrl: "https://put/v", dubbedAudioPutUrl: "https://put/a",
      dubbedUrl: "https://own/v.mp4", dubbedAudioUrl: "https://own/a.mp3", durationSeconds: 8,
    });
  });

  it("dubs in the Everyday style when none is sent, and refuses an unknown style", async () => {
    await post({ language: "hi-IN" });
    expect(mocks.trigger).toHaveBeenCalledWith("video-dub", expect.objectContaining({ style: "modern-colloquial" }));
    expect((await post({ language: "hi-IN", style: "shouty" })).status).toBe(400);
  });

  it("dubs in a preset voice at its pace, and keeps the presenter's voice by default", async () => {
    await post({ language: "ta-IN", voice: "ishita", pace: "slow" });
    expect(mocks.trigger).toHaveBeenLastCalledWith("video-dub", expect.objectContaining({ voice: "ishita", pace: "slow" }));
    expect(mocks.insertGeneration).toHaveBeenLastCalledWith(expect.objectContaining({
      inputsSnapshot: { dub: expect.objectContaining({ voice: "ishita", pace: "slow" }) },
    }));
    await post({ language: "ta-IN", voice: "ishita" });
    expect(mocks.trigger).toHaveBeenLastCalledWith("video-dub", expect.objectContaining({ voice: "ishita", pace: "normal" }));
    await post({ language: "ta-IN", voice: "presenter", pace: "fast" });
    const last = (mocks.trigger.mock.calls.at(-1) as unknown as [string, Record<string, unknown>])[1];
    expect(last.voice).toBeUndefined();
    expect(last.pace).toBeUndefined();
    expect((await post({ language: "ta-IN", voice: "nobody" })).status).toBe(400);
  });

  it("refuses before recording anything", async () => {
    expect((await post({ language: "en-IN" })).status).toBe(400);
    mocks.resolve.mockResolvedValueOnce({ ok: false, reason: "Connect a video to dub." });
    const r = await post({ language: "hi-IN" });
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ error: "Connect a video to dub." });
    mocks.running.mockResolvedValueOnce(true);
    expect((await post({ language: "hi-IN" })).status).toBe(409);
    delete process.env.SARVAM_API_KEY;
    expect((await post({ language: "hi-IN" })).status).toBe(400);
    mocks.nodeType.value = "video-gen";
    process.env.SARVAM_API_KEY = "k";
    expect((await post({ language: "hi-IN" })).status).toBe(404);
    expect(mocks.insertGeneration).not.toHaveBeenCalled();
  });

  it("fails and refunds when the trigger throws", async () => {
    mocks.trigger.mockRejectedValueOnce(new Error("down"));
    expect((await post({ language: "hi-IN" })).status).toBe(500);
    expect(mocks.refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "gen-1" });
  });
});

// D390 — a clip in the Editor's reel can't generate, whoever asks.
describe("the Editor's generation lock", () => {
  it("refuses with the reason and records nothing", async () => {
    editorLock.value = "editor";
    try {
      const res = await post({ language: "ta-IN" });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "This clip is in the Editor's reel. Disconnect it from the Editor to generate." });
      expect(mocks.insertGeneration).not.toHaveBeenCalled();
      expect(mocks.trigger).not.toHaveBeenCalled();
    } finally {
      editorLock.value = null;
    }
  });
});
