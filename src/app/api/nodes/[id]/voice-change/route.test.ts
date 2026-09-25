import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_VOICE_CHANGE_SETTINGS } from "@/lib/elevenlabs/voice-settings";
import { computeVoiceChangeCost } from "@/lib/elevenlabs/cost";
import { usdToFinalCredits } from "@/lib/credits/units";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  getVoiceCached: vi.fn(),
  insertGeneration: vi.fn(async () => ({ id: "gen-9" })),
  failGeneration: vi.fn(async () => undefined),
  reserveCredits: vi.fn(async () => ({ ok: true })),
  refundReservation: vi.fn(async () => undefined),
  sign: vi.fn(async () => ({ putUrl: "https://put/r", url: "https://storage.googleapis.com/b/gen-9-revoiced.mp4" })),
  trigger: vi.fn(async () => ({ id: "run" })),
}));
vi.mock("@/lib/api/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route-helpers")>("@/lib/api/route-helpers");
  return { ...actual, withNode: (_r: Request, _p: unknown, fn: (...a: unknown[]) => Promise<Response>) => fn("n1", {}, { userId: "u1", email: "u@x.com" }, "client-1", "org-1") };
});
vi.mock("@/lib/voice-change/source", async () => ({ ...(await vi.importActual<object>("@/lib/voice-change/source")), resolveVoiceChangeSource: mocks.resolve }));
vi.mock("@/lib/elevenlabs/voices-cache", () => ({ getVoiceCached: mocks.getVoiceCached }));
vi.mock("@/lib/db/generations", () => ({ insertGeneration: mocks.insertGeneration, failGeneration: mocks.failGeneration }));
vi.mock("@/lib/db/credit-transactions", () => ({ reserveCredits: mocks.reserveCredits, refundReservation: mocks.refundReservation, CreditLimitError: class extends Error {} }));
vi.mock("@/lib/db/versions", () => ({ getVersionById: vi.fn() }));
vi.mock("@/lib/storage", () => ({ signRevoicedVideoUrl: mocks.sign }));
vi.mock("@trigger.dev/sdk/v3", () => ({ tasks: { trigger: mocks.trigger } }));

import { POST } from "./route";

const ROOT = { id: "v2", model_used: "gemini:omni", params_used: { durationSeconds: 8, resolution: "720p" }, inputs_used: { prompt: "p" } };
const BASE = { id: "v3" };
const post = (body: unknown) => POST(new Request("http://x/api/nodes/n1/voice-change", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "n1" }) });
const BODY = { baseVersionId: "v3", voiceId: "a1", settings: DEFAULT_VOICE_CHANGE_SETTINGS };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ELEVEN_LABS_API_KEY = "k";
  mocks.resolve.mockResolvedValue({ ok: true, base: BASE, root: ROOT, sourceUrl: "https://storage.googleapis.com/b/v2.mp4", durationSeconds: 8 });
  mocks.getVoiceCached.mockResolvedValue({ voiceId: "a1", name: "Anjali", priceMultiplier: 2 });
});

describe("POST /api/nodes/[id]/voice-change", () => {
  it("reserves voice-only credits, records the root's model/params and triggers the task", async () => {
    const res = await post(BODY);
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ generationId: "gen-9" });
    expect(mocks.insertGeneration).toHaveBeenCalledWith(expect.objectContaining({
      nodeId: "n1", orgId: "org-1", type: "voice", modelUsed: "gemini:omni",
      paramsSnapshot: { durationSeconds: 8, resolution: "720p" },
      inputsSnapshot: {
        prompt: "p",
        voiceChange: {
          baseVersionId: "v3", rootVersionId: "v2", sourceUrl: "https://storage.googleapis.com/b/v2.mp4",
          voiceId: "a1", voiceName: "Anjali", priceMultiplier: 2, settings: DEFAULT_VOICE_CHANGE_SETTINGS,
        },
      },
    }));
    expect(mocks.reserveCredits).toHaveBeenCalledWith("org-1", "gen-9", usdToFinalCredits(computeVoiceChangeCost(8, 2).usd));
    expect(mocks.trigger).toHaveBeenCalledWith("video-voice-change", {
      generationId: "gen-9", sourceUrl: "https://storage.googleapis.com/b/v2.mp4", voiceId: "a1",
      settings: DEFAULT_VOICE_CHANGE_SETTINGS, revoicedPutUrl: "https://put/r",
      revoicedUrl: "https://storage.googleapis.com/b/gen-9-revoiced.mp4", durationSeconds: 8,
    });
  });

  it("400s before recording anything on a bad source, a gone voice, bad settings or no key", async () => {
    mocks.resolve.mockResolvedValueOnce({ ok: false, reason: "Pick a finished video version." });
    expect((await post(BODY)).status).toBe(400);
    mocks.getVoiceCached.mockResolvedValueOnce(null);
    expect((await post(BODY)).status).toBe(400);
    expect((await post({ ...BODY, settings: { ...DEFAULT_VOICE_CHANGE_SETTINGS, stability: 500 } })).status).toBe(400);
    delete process.env.ELEVEN_LABS_API_KEY;
    expect((await post(BODY)).status).toBe(400);
    expect(mocks.insertGeneration).not.toHaveBeenCalled();
    expect(mocks.reserveCredits).not.toHaveBeenCalled();
  });

  it("fails and refunds if the trigger throws after reserving", async () => {
    mocks.trigger.mockRejectedValueOnce(new Error("trigger down"));
    const res = await post(BODY);
    expect(res.status).toBe(500);
    expect(mocks.failGeneration).toHaveBeenCalled();
    expect(mocks.refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "gen-9" });
  });
});
