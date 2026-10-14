import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage", () => ({ uploadAvatarNamedVoiceSample: vi.fn() }));
vi.mock("@/lib/db/avatars", () => ({ updateAvatar: vi.fn() }));

import { prepareNamedVoiceReference, voiceReferenceLine, type VoiceReferenceDeps } from "../voice-reference";
import { GENERATED, makeAvatar, makeImage } from "./fixtures";
import type { AvatarVoice } from "../schema";

/** `seconds` of MPEG-1 Layer III at 128 kbps / 44.1 kHz. */
function mp3(seconds: number): Buffer {
  const frame = Buffer.alloc(417);
  frame[0] = 0xff;
  frame[1] = 0xfb;
  frame[2] = 0x90;
  return Buffer.concat(Array.from({ length: Math.round((seconds * 44100) / 1152) }, () => frame));
}

const named = (previewUrl: string | null): AvatarVoice => ({
  mode: "named", voiceId: "v1", name: "Surabhi", labels: {}, previewUrl,
});
/** A Seedream face: the only kind that runs on Seedance, so the only kind given a reference. */
const seedream = (voice: AvatarVoice | null) =>
  makeAvatar({ name: "Riya", personType: "generic", front: makeImage(GENERATED), likenessConsentAt: null, voice });

function makeDeps(overrides: Partial<VoiceReferenceDeps> = {}): VoiceReferenceDeps {
  return {
    fetchBytes: vi.fn(async () => mp3(8)),
    textToSpeech: vi.fn(async () => mp3(9)),
    upload: vi.fn(async () => ({ url: "https://storage.googleapis.com/b/elevenlabs-v1.mp3" })),
    save: vi.fn(async () => null),
    ...overrides,
  };
}

describe("prepareNamedVoiceReference", () => {
  it("copies the voice's own ElevenLabs sample into the bucket and records it for that voice", async () => {
    const deps = makeDeps();
    const sample = await prepareNamedVoiceReference("c1", seedream(named("https://el/preview.mp3")), deps);
    expect(deps.fetchBytes).toHaveBeenCalledWith("https://el/preview.mp3");
    expect(deps.textToSpeech).not.toHaveBeenCalled();
    expect(sample).toEqual({ url: "https://storage.googleapis.com/b/elevenlabs-v1.mp3", durationSeconds: 8, sourceKey: "elevenlabs:v1" });
    expect(deps.save).toHaveBeenCalledWith("c1", "a1", sample);
  });

  it("reads a line with text-to-speech when the voice has no sample — a cloned voice", async () => {
    const deps = makeDeps();
    const sample = await prepareNamedVoiceReference("c1", seedream(named(null)), deps);
    expect(deps.textToSpeech).toHaveBeenCalledWith({ voiceId: "v1", text: voiceReferenceLine("Riya") });
    expect(sample?.durationSeconds).toBe(9);
  });

  it("falls back to text-to-speech when the sample is too short to be a reference", async () => {
    const deps = makeDeps({ fetchBytes: vi.fn(async () => mp3(1)) });
    await prepareNamedVoiceReference("c1", seedream(named("https://el/p.mp3")), deps);
    expect(deps.textToSpeech).toHaveBeenCalled();
  });

  it("makes nothing for an avatar that cannot run on Seedance — a real person's photo", async () => {
    const deps = makeDeps();
    expect(await prepareNamedVoiceReference("c1", makeAvatar({ voice: named(null) }), deps)).toBeNull();
    expect(deps.textToSpeech).not.toHaveBeenCalled();
  });

  it("makes nothing for the engine's own voice — its reference comes from its preview", async () => {
    const deps = makeDeps();
    expect(await prepareNamedVoiceReference("c1", seedream({ mode: "native" }), deps)).toBeNull();
  });

  it("returns the reference already made for this voice without making another", async () => {
    const deps = makeDeps();
    const existing = { url: "u", durationSeconds: 7, sourceKey: "elevenlabs:v1" };
    expect(await prepareNamedVoiceReference("c1", { ...seedream(named(null)), voiceSample: existing }, deps)).toBe(existing);
    expect(deps.textToSpeech).not.toHaveBeenCalled();
  });

  it("returns null rather than throwing when ElevenLabs fails — the declaration still stands", async () => {
    const deps = makeDeps({ textToSpeech: vi.fn(async () => { throw new Error("429"); }) });
    expect(await prepareNamedVoiceReference("c1", seedream(named(null)), deps)).toBeNull();
    expect(deps.save).not.toHaveBeenCalled();
  });
});
