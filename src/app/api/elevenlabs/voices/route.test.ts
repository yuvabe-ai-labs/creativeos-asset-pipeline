import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CallerContext } from "@/lib/dal";

const mocks = vi.hoisted(() => ({
  getVoicesCached: vi.fn(),
  resolveCallerContextOrNull: vi.fn(async (): Promise<CallerContext | null> => ({
    userId: "u1",
    email: null,
    platformRole: "member",
    orgId: "org1",
    orgRole: "designer",
    mustChangePassword: false,
  })),
}));

vi.mock("@/lib/elevenlabs/voices-cache", () => ({ getVoicesCached: mocks.getVoicesCached }));
vi.mock("@/lib/dal", () => ({ resolveCallerContextOrNull: mocks.resolveCallerContextOrNull }));

import { GET } from "./route";
import { ElevenLabsKeyMissingError } from "@/lib/elevenlabs/client";
import { VOICE_NOT_SET_UP_MESSAGE } from "@/lib/elevenlabs/constants";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/elevenlabs/voices", () => {
  it("returns the account's voices", async () => {
    const voices = [{ voiceId: "a", name: "A", category: "cloned", previewUrl: null }];
    mocks.getVoicesCached.mockResolvedValue(voices);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ voices });
  });

  it("503s with a setup message when the key is missing", async () => {
    mocks.getVoicesCached.mockRejectedValue(new ElevenLabsKeyMissingError());
    const res = await GET();
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe(VOICE_NOT_SET_UP_MESSAGE);
  });

  it("502s when ElevenLabs fails", async () => {
    mocks.getVoicesCached.mockRejectedValue(new Error("ElevenLabs voices request failed: 500"));
    const res = await GET();
    expect(res.status).toBe(502);
  });

  it("401s without a session", async () => {
    mocks.resolveCallerContextOrNull.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mocks.getVoicesCached).not.toHaveBeenCalled();
  });
});
