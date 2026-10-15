import { describe, it, expect, vi, beforeEach } from "vitest";
import { dubCredits } from "@/lib/dubbing/cost";

vi.mock("server-only", () => ({}));
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
    const res = await post({ language: "ta-IN" });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ generationId: "gen-1" });
    expect(mocks.insertGeneration).toHaveBeenCalledWith(expect.objectContaining({
      nodeId: "n1", orgId: "org-1", clientId: "client-1", userId: "u1", type: "dub", modelUsed: "sarvam:dub",
      paramsSnapshot: { durationSeconds: 8 },
      inputsSnapshot: { dub: { sourceNodeId: "vg", sourceVersionId: "sv", sourceUrl: "https://own/src.mp4", srcLang: "en-IN", targetLang: "ta-IN", durationSeconds: 8, provider: "sarvam", model: "sarvam-dub" } },
    }));
    expect(mocks.reserveCredits).toHaveBeenCalledWith("org-1", "gen-1", dubCredits(8));
    expect(mocks.trigger).toHaveBeenCalledWith("video-dub", {
      generationId: "gen-1", sourceUrl: "https://own/src.mp4", targetLang: "ta-IN",
      dubbedPutUrl: "https://put/v", dubbedAudioPutUrl: "https://put/a",
      dubbedUrl: "https://own/v.mp4", dubbedAudioUrl: "https://own/a.mp3", durationSeconds: 8,
    });
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
