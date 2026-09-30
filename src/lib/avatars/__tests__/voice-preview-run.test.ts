import { describe, it, expect, vi } from "vitest";
import { runVoicePreview, type VoicePreviewRunDeps } from "../voice-preview-run";
import { DEFAULT_VOICE_CHANGE_SETTINGS } from "@/lib/elevenlabs/voice-settings";
import { ElevenLabsHttpError } from "@/lib/elevenlabs/client";
import { SYNC_DRIFT_MESSAGE } from "@/lib/voice-change/revoice";

const PAYLOAD = {
  frontUrl: "https://storage.googleapis.com/b/front.png",
  prompt: "p",
  params: { duration: 6 },
  voiceId: "v1",
  settings: DEFAULT_VOICE_CHANGE_SETTINGS,
  revoicedPutUrl: "https://signed/put",
};

function makeDeps(overrides: Partial<VoicePreviewRunDeps> = {}): VoicePreviewRunDeps {
  return {
    generateClip: vi.fn(async () => ({ videoUrl: "https://google/files/abc", durationSeconds: 6 })),
    fetchBytes: vi.fn(async () => Buffer.from("video")),
    extractAudio: vi.fn(async () => Buffer.from("audio")),
    speechToSpeech: vi.fn(async () => Buffer.from("voiced")),
    probeDurationSeconds: vi.fn(async () => 6),
    replaceAudio: vi.fn(async () => Buffer.from("final")),
    putBytes: vi.fn(async () => undefined),
    wait: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("runVoicePreview", () => {
  it("animates the front image, re-voices the clip and stores it", async () => {
    const deps = makeDeps();
    const result = await runVoicePreview(PAYLOAD, deps);
    expect(deps.generateClip).toHaveBeenCalledWith({
      prompt: "p", startFrameUrl: PAYLOAD.frontUrl, referenceUrls: [], params: { duration: 6 },
    });
    expect(deps.fetchBytes).toHaveBeenCalledWith("https://google/files/abc");
    expect(deps.speechToSpeech).toHaveBeenCalledWith(expect.objectContaining({ voiceId: "v1" }));
    expect(deps.putBytes).toHaveBeenCalledWith("https://signed/put", Buffer.from("final"), "video/mp4");
    expect(result).toEqual({ durationSeconds: 6, driftMs: 0 });
  });

  it("retries a passing voice-change failure against the same clip — the clip is never generated twice", async () => {
    const speechToSpeech = vi.fn()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce(Buffer.from("voiced"));
    const deps = makeDeps({ speechToSpeech });
    await runVoicePreview(PAYLOAD, deps);
    expect(deps.generateClip).toHaveBeenCalledTimes(1);
    expect(speechToSpeech).toHaveBeenCalledTimes(2);
    expect(deps.wait).toHaveBeenCalledTimes(1);
  });

  it("gives up after the second passing failure", async () => {
    const deps = makeDeps({ speechToSpeech: vi.fn(async () => { throw new Error("fetch failed"); }) });
    await expect(runVoicePreview(PAYLOAD, deps)).rejects.toThrow("fetch failed");
    expect(deps.speechToSpeech).toHaveBeenCalledTimes(2);
    expect(deps.putBytes).not.toHaveBeenCalled();
  });

  it("does not retry a voice that came back out of sync, and stores nothing", async () => {
    const probeDurationSeconds = vi.fn().mockResolvedValueOnce(6).mockResolvedValueOnce(7);
    const deps = makeDeps({ probeDurationSeconds });
    await expect(runVoicePreview(PAYLOAD, deps)).rejects.toThrow(SYNC_DRIFT_MESSAGE);
    expect(deps.speechToSpeech).toHaveBeenCalledTimes(1);
    expect(deps.putBytes).not.toHaveBeenCalled();
  });

  it("does not retry a request ElevenLabs refused", async () => {
    const deps = makeDeps({
      speechToSpeech: vi.fn(async () => { throw new ElevenLabsHttpError(400, "voice_not_found"); }),
    });
    await expect(runVoicePreview(PAYLOAD, deps)).rejects.toThrow();
    expect(deps.speechToSpeech).toHaveBeenCalledTimes(1);
  });

  it("does not attempt a voice change when the clip itself was refused", async () => {
    const deps = makeDeps({ generateClip: vi.fn(async () => { throw new Error("Omni generation failed: blocked"); }) });
    await expect(runVoicePreview(PAYLOAD, deps)).rejects.toThrow("blocked");
    expect(deps.fetchBytes).not.toHaveBeenCalled();
  });
});
