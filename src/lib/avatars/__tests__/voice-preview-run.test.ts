import { describe, it, expect, vi } from "vitest";
import {
  runNativeVoicePreview, runVoicePreview, VOICE_SAMPLE_TOO_SHORT_MESSAGE,
  type NativeVoicePreviewDeps, type VoicePreviewRunDeps,
} from "../voice-preview-run";
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

// ── The engine's own voice (D296) ──────────────────────────────────────────────

const NATIVE_PAYLOAD = {
  frontUrl: "https://storage.googleapis.com/b/front.png",
  prompt: "p",
  params: { duration: 5, resolution: "480p", ratio: "9:16" },
  clipPutUrl: "https://signed/clip",
  clipUrl: "https://storage.googleapis.com/b/clip.mp4",
  samplePutUrl: "https://signed/sample",
  sampleUrl: "https://storage.googleapis.com/b/sample.mp3",
};

function makeNativeDeps(overrides: Partial<NativeVoicePreviewDeps> = {}): NativeVoicePreviewDeps {
  return {
    generateClip: vi.fn(async () => ({ videoUrl: "https://byteplus/clip.mp4", durationSeconds: 5 })),
    fetchBytes: vi.fn(async () => Buffer.from("video")),
    extractVoiceReference: vi.fn(async () => Buffer.from("mp3")),
    probeDurationSeconds: vi.fn(async () => 4.8),
    putBytes: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("runNativeVoicePreview", () => {
  it("draws the front image as a reference, stores the clip, and stores its voice", async () => {
    const deps = makeNativeDeps();
    const result = await runNativeVoicePreview(NATIVE_PAYLOAD, deps);
    // A face is a reference, never a first frame — Seedance treats the two as exclusive.
    expect(deps.generateClip).toHaveBeenCalledWith({
      prompt: "p",
      referenceUrls: [NATIVE_PAYLOAD.frontUrl],
      params: NATIVE_PAYLOAD.params,
    });
    expect(deps.fetchBytes).toHaveBeenCalledWith("https://byteplus/clip.mp4");
    expect(deps.putBytes).toHaveBeenCalledWith(NATIVE_PAYLOAD.clipPutUrl, Buffer.from("video"), "video/mp4");
    expect(deps.extractVoiceReference).toHaveBeenCalledWith(Buffer.from("video"), 30);
    expect(deps.putBytes).toHaveBeenCalledWith(NATIVE_PAYLOAD.samplePutUrl, Buffer.from("mp3"), "audio/mpeg");
    expect(result).toEqual({
      durationSeconds: 5,
      sample: { url: NATIVE_PAYLOAD.sampleUrl, durationSeconds: 4.8 },
    });
  });

  it("stores the paid clip before extracting, so a failed extraction still leaves it", async () => {
    const deps = makeNativeDeps({
      extractVoiceReference: vi.fn(async () => { throw new Error("That clip has no audio track."); }),
    });
    await expect(runNativeVoicePreview(NATIVE_PAYLOAD, deps)).rejects.toThrow(/no audio track/);
    expect(deps.putBytes).toHaveBeenCalledWith(NATIVE_PAYLOAD.clipPutUrl, Buffer.from("video"), "video/mp4");
    expect(deps.putBytes).toHaveBeenCalledTimes(1);
  });

  it("refuses a sample under Seedance's two-second floor, and stores no sample", async () => {
    const deps = makeNativeDeps({ probeDurationSeconds: vi.fn(async () => 1.2) });
    await expect(runNativeVoicePreview(NATIVE_PAYLOAD, deps)).rejects.toThrow(VOICE_SAMPLE_TOO_SHORT_MESSAGE);
    expect(deps.putBytes).not.toHaveBeenCalledWith(NATIVE_PAYLOAD.samplePutUrl, expect.anything(), expect.anything());
  });

  it("stores nothing at all when the clip itself was refused", async () => {
    const deps = makeNativeDeps({
      generateClip: vi.fn(async () => { throw new Error("Seedance refuses a real person as a reference"); }),
    });
    await expect(runNativeVoicePreview(NATIVE_PAYLOAD, deps)).rejects.toThrow(/refuses a real person/);
    expect(deps.fetchBytes).not.toHaveBeenCalled();
    expect(deps.putBytes).not.toHaveBeenCalled();
  });
});
