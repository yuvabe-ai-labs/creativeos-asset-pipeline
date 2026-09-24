import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  saveLibraryVoice: vi.fn(),
  getAccountVoicesCached: vi.fn(),
  getVoiceCached: vi.fn(),
  invalidateAccountVoices: vi.fn(),
  resolveCallerContextOrNull: vi.fn(async () => ({ userId: "u1" })),
}));
vi.mock("@/lib/elevenlabs/voice-catalog", () => ({ saveLibraryVoice: mocks.saveLibraryVoice }));
vi.mock("@/lib/elevenlabs/voices-cache", () => ({
  getAccountVoicesCached: mocks.getAccountVoicesCached,
  getVoiceCached: mocks.getVoiceCached,
  invalidateAccountVoices: mocks.invalidateAccountVoices,
}));
vi.mock("@/lib/dal", () => ({ resolveCallerContextOrNull: mocks.resolveCallerContextOrNull }));

import { POST } from "./route";
import { ElevenLabsHttpError } from "@/lib/elevenlabs/client";

const SAVED = { voiceId: "acct9", source: "account", name: "Anjali", description: null, previewUrl: null, labels: {}, category: "professional", priceMultiplier: 1, originalVoiceId: "lib2" };
const post = (body: unknown) => POST(new Request("http://x/api/elevenlabs/voices/save", { method: "POST", body: JSON.stringify(body) }));
const BODY = { publicOwnerId: "own2", voiceId: "lib2", name: "Anjali" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAccountVoicesCached.mockResolvedValue([]);
});

describe("POST /api/elevenlabs/voices/save", () => {
  it("saves, refreshes the caches and returns the saved account voice", async () => {
    mocks.saveLibraryVoice.mockResolvedValue("acct9");
    mocks.getVoiceCached.mockResolvedValue(SAVED);
    const res = await post(BODY);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ voice: SAVED });
    expect(mocks.saveLibraryVoice).toHaveBeenCalledWith(BODY);
    expect(mocks.invalidateAccountVoices).toHaveBeenCalledWith("acct9");
  });

  it("reuses an existing saved copy instead of adding a duplicate", async () => {
    mocks.getAccountVoicesCached.mockResolvedValue([SAVED]);
    const res = await post(BODY);
    expect(await res.json()).toEqual({ voice: SAVED });
    expect(mocks.saveLibraryVoice).not.toHaveBeenCalled();
  });

  it("passes ElevenLabs' refusal through", async () => {
    mocks.saveLibraryVoice.mockRejectedValue(new ElevenLabsHttpError(403, "Voice not allowed", "voice save"));
    const res = await post(BODY);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("Voice not allowed");
  });

  it("400s on an invalid body", async () => {
    expect((await post({ voiceId: "x" })).status).toBe(400);
  });

  it("401s without a session", async () => {
    mocks.resolveCallerContextOrNull.mockResolvedValueOnce(null);
    expect((await post(BODY)).status).toBe(401);
  });
});
