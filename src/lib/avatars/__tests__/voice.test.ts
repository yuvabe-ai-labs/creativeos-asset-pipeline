import { describe, it, expect } from "vitest";
import {
  allowedVoiceModes, avatarVoiceLabel, avatarVoiceToPickerVoice, isVoiceAllowed,
  pickerVoiceToAvatarVoice, voiceAfterFrontChange,
} from "../voice";
import { frontChangePatch } from "../utils";
import { GENERATED, makeAvatar, makeImage } from "./fixtures";
import type { AvatarVoice } from "../schema";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";

const NATIVE: AvatarVoice = { mode: "native" };
const NAMED: AvatarVoice = {
  mode: "named", voiceId: "v1", name: "Surabhi", labels: { gender: "female" }, previewUrl: "https://x/p.mp3",
};

describe("allowedVoiceModes", () => {
  it("a generated avatar can use its engine's own voice or a named one", () => {
    expect(allowedVoiceModes("generic")).toEqual(["native", "named"]);
  });

  it("a real person runs on an engine that takes no audio input: a named voice only", () => {
    expect(allowedVoiceModes("specific")).toEqual(["named"]);
  });

  it("nothing can be declared before there is a front image", () => {
    expect(allowedVoiceModes(null)).toEqual([]);
  });
});

describe("isVoiceAllowed", () => {
  it("refuses the native voice for a real person", () => {
    expect(isVoiceAllowed(NATIVE, "specific")).toBe(false);
    expect(isVoiceAllowed(NATIVE, "generic")).toBe(true);
    expect(isVoiceAllowed(NAMED, "specific")).toBe(true);
  });
});

describe("voiceAfterFrontChange", () => {
  it("drops a native voice when the avatar becomes a real person", () => {
    expect(voiceAfterFrontChange(NATIVE, "specific")).toBeNull();
  });

  it("keeps a named voice, and keeps a native one on a generated avatar", () => {
    expect(voiceAfterFrontChange(NAMED, "specific")).toBe(NAMED);
    expect(voiceAfterFrontChange(NATIVE, "generic")).toBe(NATIVE);
    expect(voiceAfterFrontChange(null, "specific")).toBeNull();
  });
});

describe("frontChangePatch and the voice", () => {
  it("clears a native voice when an uploaded photo replaces a generated face", () => {
    const current = makeAvatar({ personType: "generic", front: makeImage(GENERATED), voice: NATIVE });
    expect(frontChangePatch(current, makeImage())).toMatchObject({ personType: "specific", voice: null });
  });

  it("leaves a named voice alone on any front change", () => {
    const current = makeAvatar({ voice: NAMED });
    expect(frontChangePatch(current, makeImage(GENERATED))).not.toHaveProperty("voice");
  });
});

describe("avatarVoiceLabel", () => {
  it("names the voice, or says the engine's own", () => {
    expect(avatarVoiceLabel(NAMED)).toBe("Surabhi");
    expect(avatarVoiceLabel(NATIVE)).toBe("Engine's own voice");
    expect(avatarVoiceLabel(null)).toBeNull();
  });
});

describe("avatarVoiceToPickerVoice", () => {
  it("gives the picker's field the named voice, and nothing for a native voice or none", () => {
    expect(avatarVoiceToPickerVoice(NAMED)).toMatchObject({
      voiceId: "v1", name: "Surabhi", source: "account", previewUrl: "https://x/p.mp3", labels: { gender: "female" },
    });
    expect(avatarVoiceToPickerVoice(NATIVE)).toBeNull();
    expect(avatarVoiceToPickerVoice(null)).toBeNull();
  });
});

describe("pickerVoiceToAvatarVoice", () => {
  it("snapshots what the avatar needs to show and use the voice", () => {
    const picked: PickerVoice = {
      voiceId: "v9", source: "account", name: "James", description: null, previewUrl: null,
      labels: { gender: "male", accent: "indian" }, category: "cloned", priceMultiplier: 1,
    };
    expect(pickerVoiceToAvatarVoice(picked)).toEqual({
      mode: "named", voiceId: "v9", name: "James", labels: { gender: "male", accent: "indian" }, previewUrl: null,
    });
  });
});
