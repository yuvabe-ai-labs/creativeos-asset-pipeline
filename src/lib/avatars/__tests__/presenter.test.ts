import { describe, it, expect } from "vitest";
import {
  hasOnCameraLine, matchingVoiceReference, namedVoiceSampleKey, presenterInShot, presenterUpstreamRow,
  seedanceVoiceText, seedingScriptId,
} from "../presenter";
import { makeAvatar, makeImage, GENERATED } from "./fixtures";
import type { AvatarVoice, AvatarVoiceSample } from "../schema";

const NAMED: AvatarVoice = {
  mode: "named", voiceId: "v1", name: "Surabhi",
  labels: { gender: "female", language: "Hindi", accent: "Indian", description: "warm" }, previewUrl: null,
};
const narrator = { text: "Stay hydrated.", speaker: "narrator", delivery: "", language: "en" };
const riya = { text: "Hi, I'm Riya.", speaker: "Riya", delivery: "", language: "en" };
const shot = (lines: object[]) => ({
  nodeId: "shot-1", type: "shot",
  data: { seededFrom: { scriptNodeId: "script-1" }, script: { visual_script: { shots: [{ voiceover: lines }] } } },
});

describe("seedingScriptId", () => {
  it("is the script that created the upstream Shot or Multishot", () => {
    expect(seedingScriptId([{ nodeId: "f", type: "file", data: {} }, shot([])])).toBe("script-1");
    expect(seedingScriptId([{ nodeId: "m", type: "multishot", data: { seededFrom: { scriptNodeId: "s2" } } }])).toBe("s2");
  });
  it("is null with no seeded upstream", () => {
    expect(seedingScriptId([{ nodeId: "f", type: "file", data: {} }])).toBeNull();
    expect(seedingScriptId([{ nodeId: "s", type: "shot", data: {} }])).toBeNull();
  });
});

describe("hasOnCameraLine", () => {
  it("narration alone is not on camera", () => expect(hasOnCameraLine([shot([narrator])])).toBe(false));
  it("a line in someone's mouth is", () => expect(hasOnCameraLine([shot([narrator, riya])])).toBe(true));
  it("reads a Multishot's cuts and its sequence lines", () => {
    expect(hasOnCameraLine([{ nodeId: "m", type: "multishot", data: { cuts: [{ voiceover: [riya] }] } }])).toBe(true);
    expect(hasOnCameraLine([{ nodeId: "m", type: "multishot", data: { cuts: [], sequenceVoiceover: [riya] } }])).toBe(true);
    expect(hasOnCameraLine([{ nodeId: "m", type: "multishot", data: { cuts: [{ voiceover: [narrator] }] } }])).toBe(false);
  });
});

describe("presenterInShot", () => {
  it("defaults to whether the shot has an on-camera line", () => {
    expect(presenterInShot(undefined, [shot([riya])])).toBe(true);
    expect(presenterInShot(undefined, [shot([narrator])])).toBe(false);
  });
  it("the operator's choice wins either way", () => {
    expect(presenterInShot({ inShot: false }, [shot([riya])])).toBe(false);
    expect(presenterInShot({ inShot: true }, [shot([narrator])])).toBe(true);
  });
});

describe("presenterUpstreamRow", () => {
  it("is a virtual image input under the Avatar node's own id, titled as the presenter", () => {
    const avatar = makeAvatar({ name: "Riya" });
    expect(presenterUpstreamRow("avatar-node-1", avatar)).toEqual({
      nodeId: "avatar-node-1",
      type: "file",
      data: { title: "Presenter: Riya", fileKind: "image", fileUrl: avatar.front!.url },
      activeOutput: null,
      versionId: null,
    });
  });
  it("is nothing without a front image", () => {
    expect(presenterUpstreamRow("n", makeAvatar({ front: null }))).toBeNull();
  });
});

describe("matchingVoiceReference", () => {
  const sample = (sourceKey: string): AvatarVoiceSample => ({ url: "https://x/s.mp3", durationSeconds: 5, sourceKey });
  it("a named voice uses the sample made for that voice only", () => {
    expect(matchingVoiceReference(makeAvatar({ voice: NAMED, voiceSample: sample(namedVoiceSampleKey("v1")) }))?.sourceKey).toBe("elevenlabs:v1");
    expect(matchingVoiceReference(makeAvatar({ voice: NAMED, voiceSample: sample(namedVoiceSampleKey("v2")) }))).toBeNull();
    expect(matchingVoiceReference(makeAvatar({ voice: NAMED, voiceSample: sample("gen-1") }))).toBeNull();
  });
  it("the engine's own voice uses the sample from its preview", () => {
    const avatar = makeAvatar({ personType: "generic", front: makeImage(GENERATED), voice: { mode: "native" }, voiceSample: sample("gen-1") });
    expect(matchingVoiceReference(avatar)?.sourceKey).toBe("gen-1");
    expect(matchingVoiceReference({ ...avatar, voiceSample: sample("elevenlabs:v1") })).toBeNull();
  });
  it("no voice, no reference", () => {
    expect(matchingVoiceReference(makeAvatar({ voice: null, voiceSample: sample("gen-1") }))).toBeNull();
  });
});

describe("seedanceVoiceText", () => {
  it("binds the audio by position, limits it to timbre, and says the voice in words", () => {
    const text = seedanceVoiceText(NAMED);
    expect(text).toContain("@Audio 1");
    expect(text).toMatch(/voice timbre/i);
    expect(text).toMatch(/not its music or sound effects/i);
    expect(text).toMatch(/female/);
    expect(text).toMatch(/Hindi/);
  });
  it("describes the engine's own voice plainly", () => {
    expect(seedanceVoiceText({ mode: "native" })).toMatch(/the presenter's own voice/);
  });
});
