import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getAccountVoicesCached: vi.fn(),
  getLibraryPageCached: vi.fn(),
  resolveCallerContextOrNull: vi.fn(async (): Promise<{ userId: string } | null> => ({ userId: "u1" })),
}));
vi.mock("@/lib/elevenlabs/voices-cache", () => ({
  getAccountVoicesCached: mocks.getAccountVoicesCached,
  getLibraryPageCached: mocks.getLibraryPageCached,
}));
vi.mock("@/lib/dal", () => ({ resolveCallerContextOrNull: mocks.resolveCallerContextOrNull }));

import { GET } from "./route";
import { ElevenLabsKeyMissingError, ElevenLabsHttpError } from "@/lib/elevenlabs/client";
import { VOICE_NOT_SET_UP_MESSAGE } from "@/lib/elevenlabs/constants";

const V = { voiceId: "a", source: "account", name: "A", description: null, previewUrl: null, labels: {}, category: "premade", priceMultiplier: 1 };
const get = (qs = "") => GET(new Request(`http://x/api/elevenlabs/voices${qs}`));

beforeEach(() => vi.clearAllMocks());

describe("GET /api/elevenlabs/voices", () => {
  it("defaults to the whole account list with no cursor", async () => {
    mocks.getAccountVoicesCached.mockResolvedValue([V]);
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ voices: [V], nextCursor: null });
  });

  it("pages the Library, passing filters and returning the next cursor", async () => {
    mocks.getLibraryPageCached.mockResolvedValue({ voices: [V], hasMore: true });
    const res = await get("?source=library&search=warm&gender=female&language=hi&useCase=social_media&sort=trending&cursor=2");
    expect(mocks.getLibraryPageCached).toHaveBeenCalledWith({
      page: 2, search: "warm", gender: "female", language: "hi", useCase: "social_media", sort: "trending",
    });
    expect(await res.json()).toEqual({ voices: [V], nextCursor: "3" });
  });

  it("returns nextCursor null on the last Library page, and page 0 without a cursor", async () => {
    mocks.getLibraryPageCached.mockResolvedValue({ voices: [], hasMore: false });
    const res = await get("?source=library");
    expect(mocks.getLibraryPageCached).toHaveBeenCalledWith({ page: 0 });
    expect((await res.json()).nextCursor).toBeNull();
  });

  it("400s on an unknown source or a bad cursor", async () => {
    expect((await get("?source=nope")).status).toBe(400);
    expect((await get("?source=library&cursor=-1")).status).toBe(400);
  });

  it("503s without a key, passes ElevenLabs 4xx through, 502s otherwise", async () => {
    mocks.getAccountVoicesCached.mockRejectedValueOnce(new ElevenLabsKeyMissingError());
    const a = await get();
    expect(a.status).toBe(503);
    expect((await a.json()).error).toBe(VOICE_NOT_SET_UP_MESSAGE);
    mocks.getAccountVoicesCached.mockRejectedValueOnce(new ElevenLabsHttpError(403, "forbidden", "voices"));
    expect((await get()).status).toBe(403);
    mocks.getAccountVoicesCached.mockRejectedValueOnce(new Error("socket hang up"));
    expect((await get()).status).toBe(502);
  });

  it("401s without a session", async () => {
    mocks.resolveCallerContextOrNull.mockResolvedValueOnce(null);
    expect((await get()).status).toBe(401);
  });
});
