import { describe, it, expect, vi, beforeEach } from "vitest";
import { lipSyncCredits } from "@/lib/dubbing/cost";

vi.mock("server-only", () => ({}));
const editorLock = vi.hoisted(() => ({ value: null as null | "editor" | "dub" }));
vi.mock("@/lib/db/generation-lock", () => ({ getEditorGenerationLock: async () => editorLock.value }));
const mocks = vi.hoisted(() => ({
  getVersion: vi.fn(),
  running: vi.fn(async () => false),
  insertGeneration: vi.fn(async () => ({ id: "gen-2" })),
  failGeneration: vi.fn(async () => undefined),
  reserveCredits: vi.fn(async () => ({ ok: true })),
  refundReservation: vi.fn(async () => undefined),
  sign: vi.fn(async () => ({ putUrl: "https://put/l", url: "https://own/l.mp4" })),
  trigger: vi.fn(async () => ({ id: "run" })),
}));
vi.mock("@/lib/api/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route-helpers")>("@/lib/api/route-helpers");
  return { ...actual, withNode: (_r: Request, _p: unknown, fn: (...a: unknown[]) => Promise<Response>) => fn("n1", { type: "dubbing", active_version_id: "ver-1" }, { userId: "u1", email: "u@x.com" }, "client-1", "org-1") };
});
vi.mock("@/lib/db/versions", () => ({ getVersionById: mocks.getVersion }));
vi.mock("@/lib/db/generations", () => ({ insertGeneration: mocks.insertGeneration, failGeneration: mocks.failGeneration, hasRunningGeneration: mocks.running }));
vi.mock("@/lib/db/credit-transactions", () => ({ reserveCredits: mocks.reserveCredits, refundReservation: mocks.refundReservation, CreditLimitError: class extends Error {} }));
vi.mock("@/lib/storage", () => ({ signLipSyncedUpload: mocks.sign }));
vi.mock("@trigger.dev/sdk/v3", () => ({ tasks: { trigger: mocks.trigger } }));

import { POST } from "./route";

const OUT = { language: "hi-IN", original: "https://own/o.mp4", dubbed: "https://own/d.mp4", dubbedAudio: "https://own/d.mp3", lipSynced: null };
const post = (body: unknown) => POST(new Request("http://x/api/nodes/n1/lip-sync", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "n1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.FAL_KEY = "k";
  mocks.getVersion.mockResolvedValue({ id: "ver-1", node_id: "n1", output: OUT, params_used: { durationSeconds: 8 } });
});

describe("POST /api/nodes/[id]/lip-sync", () => {
  it("lip-syncs the active dub's original to its dubbed audio", async () => {
    const res = await post({ versionId: "ver-1" });
    expect(res.status).toBe(202);
    expect(mocks.insertGeneration).toHaveBeenCalledWith(expect.objectContaining({
      type: "lipsync", modelUsed: "fal:lipsync-2-pro", paramsSnapshot: { durationSeconds: 8 },
      inputsSnapshot: { lipSync: { versionId: "ver-1", provider: "fal", model: "lipsync-2-pro", runs: 0 } },
    }));
    expect(mocks.reserveCredits).toHaveBeenCalledWith("org-1", "gen-2", lipSyncCredits(8));
    expect(mocks.trigger).toHaveBeenCalledWith("video-lip-sync", {
      generationId: "gen-2", videoUrl: "https://own/o.mp4", audioUrl: "https://own/d.mp3", model: "lipsync-2-pro",
      lipSyncedPutUrl: "https://put/l", lipSyncedUrl: "https://own/l.mp4", durationSeconds: 8,
    });
  });

  it("only runs on this node's active dub, one job at a time", async () => {
    expect((await post({ versionId: "ver-2" })).status).toBe(400);
    mocks.getVersion.mockResolvedValueOnce({ id: "ver-1", node_id: "other", output: OUT, params_used: { durationSeconds: 8 } });
    expect((await post({ versionId: "ver-1" })).status).toBe(400);
    mocks.getVersion.mockResolvedValueOnce({ id: "ver-1", node_id: "n1", output: "https://x.mp4", params_used: {} });
    expect((await post({ versionId: "ver-1" })).status).toBe(400);
    mocks.running.mockResolvedValueOnce(true);
    expect((await post({ versionId: "ver-1" })).status).toBe(409);
    expect(mocks.insertGeneration).not.toHaveBeenCalled();
  });
});

// D389 — a clip in the Editor's reel can't generate, whoever asks.
describe("the Editor's generation lock", () => {
  it("refuses with the reason and records nothing", async () => {
    editorLock.value = "editor";
    try {
      const res = await post({ versionId: "ver-1" });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "This clip is in the Editor's reel. Disconnect it from the Editor to generate." });
      expect(mocks.insertGeneration).not.toHaveBeenCalled();
      expect(mocks.trigger).not.toHaveBeenCalled();
    } finally {
      editorLock.value = null;
    }
  });
});
