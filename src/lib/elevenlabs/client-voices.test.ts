import { describe, it, expect } from "vitest";
import {
  clientPickerVoices, isVoiceAvailableToClient, validateVoiceCloneInput,
  VOICE_CLONE_MAX_TOTAL_BYTES,
} from "./client-voices";
import type { PickerVoice } from "./voice-catalog";

const voice = (over: Partial<PickerVoice>): PickerVoice => ({
  voiceId: "v", source: "account", name: "n", description: null, previewUrl: null,
  labels: {}, category: "premade", priceMultiplier: 1, ...over,
});
const ACCOUNT = [
  voice({ voiceId: "stock", name: "Aria", category: "premade" }),
  voice({ voiceId: "mine", name: "James", category: "cloned" }),
  voice({ voiceId: "theirs", name: "Other client's clone", category: "cloned" }),
  voice({ voiceId: "lib", name: "Surabhi", category: "professional" }),
];

describe("clientPickerVoices", () => {
  it("lists the client's own voices and the stock voices, never another client's", () => {
    const out = clientPickerVoices(ACCOUNT, ["mine", "lib"]);
    expect(out.map((v) => v.voiceId)).toEqual(["stock", "mine", "lib"]);
  });

  it("shows only stock voices for a client with none of its own", () => {
    expect(clientPickerVoices(ACCOUNT, []).map((v) => v.voiceId)).toEqual(["stock"]);
  });
});

describe("isVoiceAvailableToClient", () => {
  it("accepts a stock voice and the client's own; refuses another client's", () => {
    expect(isVoiceAvailableToClient(ACCOUNT[0], [])).toBe(true);
    expect(isVoiceAvailableToClient(ACCOUNT[1], ["mine"])).toBe(true);
    expect(isVoiceAvailableToClient(ACCOUNT[2], ["mine"])).toBe(false);
  });
});

describe("validateVoiceCloneInput", () => {
  const ok = { name: "James", consent: true, files: [{ name: "james v1.MP3", size: 900_000 }] };

  it("accepts a named, consented clone with audio", () => {
    expect(validateVoiceCloneInput(ok)).toBeNull();
  });

  it("requires the speaker's permission", () => {
    expect(validateVoiceCloneInput({ ...ok, consent: false })).toMatch(/permission/);
  });

  it("requires a name and at least one audio file", () => {
    expect(validateVoiceCloneInput({ ...ok, name: "  " })).toMatch(/name/i);
    expect(validateVoiceCloneInput({ ...ok, files: [] })).toMatch(/audio/i);
  });

  it("rejects other file types and an upload over the size limit, stating the rule", () => {
    expect(validateVoiceCloneInput({ ...ok, files: [{ name: "clip.mp4", size: 10 }] })).toMatch(/mp3, wav, m4a/);
    const big = [{ name: "a.wav", size: VOICE_CLONE_MAX_TOTAL_BYTES + 1 }];
    expect(validateVoiceCloneInput({ ...ok, files: big })).toMatch(/4 MB/);
  });
});
