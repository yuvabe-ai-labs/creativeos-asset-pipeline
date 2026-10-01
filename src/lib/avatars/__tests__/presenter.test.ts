import { describe, it, expect } from "vitest";
import {
  hasOnCameraLine, matchingVoiceReference, namedVoiceSampleKey, presenterInShot, presenterUpstreamRow,
  presenterVideoNotes, seedanceVoiceText, seedingScriptId, unavailableModelsFor,
} from "../presenter";
import { GEMINI_OMNI_MODEL_ID, SEEDANCE_MODEL_ID } from "@/lib/video-gen/client-models";
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
      data: {
        presenter: true,
        title: "Riya",
        fileKind: "image",
        fileUrl: avatar.front!.url,
        processedOutput: "The presenter, Riya: the person on camera in this shot. Show them as they appear in this image.",
      },
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

describe("unavailableModelsFor", () => {
  it("a real person's photo rules out Seedance and Veo, each with its reason", () => {
    const out = unavailableModelsFor(makeAvatar());
    expect(out[SEEDANCE_MODEL_ID]).toMatch(/refuses a real person's face/);
    expect(out["veo:veo-3.1-fast"]).toMatch(/may refuse a real person's face/);
    expect(out[GEMINI_OMNI_MODEL_ID]).toBeUndefined();
    expect(out["kling:kling-3-0"]).toBeUndefined();
  });
  it("a Seedream face rules out nothing", () => {
    expect(unavailableModelsFor(makeAvatar({ personType: "generic", front: makeImage(GENERATED) }))).toEqual({});
  });
  it("another generated face rules out Seedance only, saying which model it needs", () => {
    const other = GENERATED.kind === "generated" ? { ...GENERATED, modelId: "gemini:gemini-3-pro-image" } : GENERATED;
    const out = unavailableModelsFor(makeAvatar({ personType: "generic", front: makeImage(other) }));
    expect(Object.keys(out)).toEqual([SEEDANCE_MODEL_ID]);
    expect(out[SEEDANCE_MODEL_ID]).toMatch(/Seedream 5\.0 Lite/);
  });
});

describe("presenterVideoNotes", () => {
  const native = { mode: "native" as const };
  const sample = { url: "u", durationSeconds: 5, sourceKey: "gen-1" };
  it("on Seedance with a still as first frame, says the face is left out", () => {
    const notes = presenterVideoNotes({ avatar: makeAvatar(), provider: "seedance", hasStartFrame: true });
    expect(notes).toEqual([expect.stringMatching(/first frame/)]);
  });
  it("on Seedance, says when the engine's own voice has no reference", () => {
    expect(presenterVideoNotes({ avatar: makeAvatar({ voice: native }), provider: "seedance", hasStartFrame: false }))
      .toEqual([expect.stringMatching(/reference is missing/)]);
    expect(presenterVideoNotes({ avatar: makeAvatar({ voice: native, voiceSample: sample }), provider: "seedance", hasStartFrame: false }))
      .toEqual([]);
  });
  it("elsewhere, says only Seedance keeps the engine's own voice", () => {
    expect(presenterVideoNotes({ avatar: makeAvatar({ voice: native }), provider: "kling", hasStartFrame: true }))
      .toEqual(["Only Seedance keeps the engine's own voice the same across clips."]);
    expect(presenterVideoNotes({ avatar: makeAvatar(), provider: "kling", hasStartFrame: false })).toEqual([]);
  });
});
