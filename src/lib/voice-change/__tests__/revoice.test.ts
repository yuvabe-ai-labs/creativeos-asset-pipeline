import { describe, it, expect, vi } from "vitest";
import { revoiceVideo, type RevoiceDeps } from "../revoice";

function deps(overrides: Partial<RevoiceDeps> = {}): RevoiceDeps {
  return {
    fetchBytes: vi.fn(async () => Buffer.from("video")),
    extractAudio: vi.fn(async () => Buffer.from("audio")),
    speechToSpeech: vi.fn(async () => Buffer.from("voice")),
    replaceAudio: vi.fn(async () => Buffer.from("final")),
    putBytes: vi.fn(async () => undefined),
    ...overrides,
  };
}

const PAYLOAD = { sourceUrl: "https://s/o.mp4", voiceId: "v1", revoicedPutUrl: "https://put/r" };

describe("revoiceVideo", () => {
  it("runs download → extract → speech-to-speech → replace → upload in order", async () => {
    const d = deps();
    await revoiceVideo(PAYLOAD, d);
    expect(d.fetchBytes).toHaveBeenCalledWith("https://s/o.mp4");
    expect(d.extractAudio).toHaveBeenCalledWith(Buffer.from("video"));
    expect(d.speechToSpeech).toHaveBeenCalledWith({ audio: Buffer.from("audio"), voiceId: "v1" });
    expect(d.replaceAudio).toHaveBeenCalledWith(Buffer.from("video"), Buffer.from("voice"));
    expect(d.putBytes).toHaveBeenCalledWith("https://put/r", Buffer.from("final"), "video/mp4");
  });

  it("throws (so Trigger retries) when ElevenLabs fails, and uploads nothing", async () => {
    const d = deps({ speechToSpeech: vi.fn(async () => { throw new Error("429 quota"); }) });
    await expect(revoiceVideo(PAYLOAD, d)).rejects.toThrow("429 quota");
    expect(d.putBytes).not.toHaveBeenCalled();
  });
});
