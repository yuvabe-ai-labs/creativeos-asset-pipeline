import { describe, it, expect, vi } from "vitest";
import { revoiceVideo, NonRetryableRevoiceError, type RevoiceDeps } from "../revoice";
import { ElevenLabsHttpError } from "@/lib/elevenlabs/client";

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

  it("wraps an extract-audio failure (no audio stream) as NonRetryableRevoiceError", async () => {
    const d = deps({
      extractAudio: vi.fn(async () => {
        throw new Error("ffmpeg exited with 1: Output file does not contain any stream");
      }),
    });
    await expect(revoiceVideo(PAYLOAD, d)).rejects.toBeInstanceOf(NonRetryableRevoiceError);
    expect(d.speechToSpeech).not.toHaveBeenCalled();
    expect(d.putBytes).not.toHaveBeenCalled();
  });

  it("wraps a non-429 ElevenLabs 4xx (e.g. 422 invalid voice) as NonRetryableRevoiceError", async () => {
    const d = deps({
      speechToSpeech: vi.fn(async () => {
        throw new ElevenLabsHttpError(422, "invalid voice_id");
      }),
    });
    await expect(revoiceVideo(PAYLOAD, d)).rejects.toBeInstanceOf(NonRetryableRevoiceError);
    expect(d.putBytes).not.toHaveBeenCalled();
  });

  it("rethrows a 429 ElevenLabs error as retryable, not NonRetryableRevoiceError", async () => {
    const d = deps({
      speechToSpeech: vi.fn(async () => {
        throw new ElevenLabsHttpError(429, "quota_exceeded");
      }),
    });
    const err = await revoiceVideo(PAYLOAD, d).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(NonRetryableRevoiceError);
    expect(err).toBeInstanceOf(ElevenLabsHttpError);
  });

  it("rethrows a 500 ElevenLabs error as retryable, not NonRetryableRevoiceError", async () => {
    const d = deps({
      speechToSpeech: vi.fn(async () => {
        throw new ElevenLabsHttpError(500, "internal_error");
      }),
    });
    const err = await revoiceVideo(PAYLOAD, d).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(NonRetryableRevoiceError);
    expect(err).toBeInstanceOf(ElevenLabsHttpError);
  });
});
