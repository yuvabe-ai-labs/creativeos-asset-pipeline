import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getVoiceCached: vi.fn(),
  resolveCallerContextOrNull: vi.fn(async (): Promise<{ userId: string } | null> => ({ userId: "u1" })),
}));
vi.mock("@/lib/elevenlabs/voices-cache", () => ({ getVoiceCached: mocks.getVoiceCached }));
vi.mock("@/lib/dal", () => ({ resolveCallerContextOrNull: mocks.resolveCallerContextOrNull }));

import { GET } from "./route";

const V = { voiceId: "s1", source: "account", name: "David", description: null, previewUrl: null, labels: {}, category: "professional", priceMultiplier: 2 };
const get = (id: string) => GET(new Request(`http://x/api/elevenlabs/voices/${id}`), { params: Promise.resolve({ voiceId: id }) });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/elevenlabs/voices/[voiceId]", () => {
  it("returns the voice with its multiplier", async () => {
    mocks.getVoiceCached.mockResolvedValue(V);
    const res = await get("s1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ voice: V });
  });

  it("404s when the account doesn't have it", async () => {
    mocks.getVoiceCached.mockResolvedValue(null);
    const res = await get("gone");
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("That voice is no longer on the ElevenLabs account.");
  });

  it("401s without a session", async () => {
    mocks.resolveCallerContextOrNull.mockResolvedValueOnce(null);
    expect((await get("s1")).status).toBe(401);
  });
});
