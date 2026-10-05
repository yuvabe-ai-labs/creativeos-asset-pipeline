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
  it("any face can have a voice chosen for it, or a named one (D301)", () => {
    expect(allowedVoiceModes("generic")).toEqual(["native", "named"]);
    expect(allowedVoiceModes("specific")).toEqual(["native", "named"]);
  });

  it("nothing can be declared before there is a front image", () => {
    expect(allowedVoiceModes(null)).toEqual([]);
  });
});

describe("isVoiceAllowed", () => {
  it("allows either voice on any face, and nothing before there is one", () => {
    expect(isVoiceAllowed(NATIVE, "specific")).toBe(true);
    expect(isVoiceAllowed(NAMED, "generic")).toBe(true);
    expect(isVoiceAllowed(NATIVE, null)).toBe(false);
  });
});

describe("voiceAfterFrontChange", () => {
  it("keeps every voice across a front change — the preview goes stale instead (D301)", () => {
    expect(voiceAfterFrontChange(NATIVE, "specific")).toBe(NATIVE);
    expect(voiceAfterFrontChange(NAMED, "specific")).toBe(NAMED);
    expect(voiceAfterFrontChange(NATIVE, "generic")).toBe(NATIVE);
    expect(voiceAfterFrontChange(null, "specific")).toBeNull();
  });
});

describe("frontChangePatch and the voice", () => {
  it("keeps a voice chosen for the avatar when an uploaded photo replaces a generated face", () => {
    const current = makeAvatar({ personType: "generic", front: makeImage(GENERATED), voice: NATIVE });
    const patch = frontChangePatch(current, makeImage());
    expect(patch).toMatchObject({ personType: "specific" });
    expect(patch).not.toHaveProperty("voice");
  });

  it("leaves a named voice alone on any front change", () => {
    const current = makeAvatar({ voice: NAMED });
    expect(frontChangePatch(current, makeImage(GENERATED))).not.toHaveProperty("voice");
  });
});

describe("avatarVoiceLabel", () => {
  it("names the voice, or says it was chosen for the avatar", () => {
    expect(avatarVoiceLabel(NAMED)).toBe("Surabhi");
    expect(avatarVoiceLabel(NATIVE)).toBe("Chosen for me");
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
  it("records where the voice came from when told", () => {
    const picked: PickerVoice = {
      voiceId: "v9", source: "account", name: "James", description: null, previewUrl: null,
      labels: {}, category: "cloned", priceMultiplier: 1,
    };
    expect(pickerVoiceToAvatarVoice(picked, "custom")).toMatchObject({ origin: "custom" });
  });
});
