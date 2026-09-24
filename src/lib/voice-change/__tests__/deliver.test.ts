import { describe, it, expect, vi } from "vitest";
import { deliverWithVoice, OriginalStoreError, type DeliverDeps } from "../deliver";

const VOICE = {
  voiceId: "v1",
  voiceName: "Priya",
  originalPutUrl: "https://put/o",
  originalUrl: "https://storage.googleapis.com/b/o.mp4",
  revoicedPutUrl: "https://put/r",
  revoicedUrl: "https://storage.googleapis.com/b/r.mp4",
  priceMultiplier: 2,
};

function deps(overrides: Partial<DeliverDeps> = {}): DeliverDeps {
  return {
    fetchProviderVideo: vi.fn(async () => Buffer.from("video")),
    putBytes: vi.fn(async () => undefined),
    revoice: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };
}

describe("deliverWithVoice", () => {
  it("stores the original first, then returns the re-voiced URL when the voice change worked", async () => {
    const d = deps();
    const out = await deliverWithVoice({ providerVideoUrl: "https://provider/v", voice: VOICE }, d);
    expect(d.putBytes).toHaveBeenCalledWith("https://put/o", Buffer.from("video"), "video/mp4");
    expect(d.revoice).toHaveBeenCalledWith({
      sourceUrl: VOICE.originalUrl,
      voiceId: "v1",
      revoicedPutUrl: "https://put/r",
    });
    expect(out).toEqual({
      videoUrl: VOICE.revoicedUrl,
      meta: {
        voice: {
          voiceId: "v1",
          voiceName: "Priya",
          status: "applied",
          originalUrl: VOICE.originalUrl,
          priceMultiplier: 2,
        },
      },
    });
  });

  it("falls back to the original when the voice change failed", async () => {
    const d = deps({ revoice: vi.fn(async () => ({ ok: false as const, error: "429 quota" })) });
    const out = await deliverWithVoice({ providerVideoUrl: "https://provider/v", voice: VOICE }, d);
    expect(out.videoUrl).toBe(VOICE.originalUrl);
    expect(out.meta.voice).toMatchObject({ status: "failed", error: "429 quota" });
    expect(out.meta.voice.priceMultiplier).toBe(2);
  });

  it("throws OriginalStoreError and never re-voices when the original can't be stored", async () => {
    const d = deps({ putBytes: vi.fn(async () => { throw new Error("Upload failed (403)"); }) });
    await expect(
      deliverWithVoice({ providerVideoUrl: "https://provider/v", voice: VOICE }, d),
    ).rejects.toBeInstanceOf(OriginalStoreError);
    expect(d.revoice).not.toHaveBeenCalled();
  });
});
