import { describe, it, expect } from "vitest";
import {
  buildVoicePreviewPrompt, defaultVoicePreviewLine, estimateVoicePreviewCredits,
  generationToVoicePreview, isVoicePreviewAbandoned, isVoicePreviewGeneration, isVoicePreviewStale,
  voicePreviewBlocker, voicePreviewCostUsd, voicePreviewKeepsSample, voicePreviewMode,
  voicePreviewEngine, voicePreviewParams, voicePreviewRowEngine, voicePreviewRowMode, VOICE_PREVIEW_ENGINE,
} from "../voice-preview";
import { AVATAR_VOICE_PREVIEW_SLOT, AVATAR_VOICE_SAMPLE_SECONDS } from "../constants";
import { GENERATED, makeAvatar, makeImage } from "./fixtures";
import type { AvatarVoice } from "../schema";
import type { GenerationRow } from "@/lib/db/types";
import { computeVideoCost } from "@/lib/video-gen/cost";
import { computeVoiceChangeCost } from "@/lib/elevenlabs/cost";
import { usdToFinalCredits } from "@/lib/credits/units";
import { GEMINI_OMNI_MODEL_ID, SEEDANCE_MODEL_ID } from "@/lib/video-gen/client-models";

const NAMED: AvatarVoice = { mode: "named", voiceId: "v1", name: "Surabhi", labels: {}, previewUrl: null };
const NATIVE: AvatarVoice = { mode: "native" };
const FRONT = makeImage().url;
/** A generated avatar is the only kind that may declare the engine's own voice (D293). */
const generated = (voice: AvatarVoice | null) =>
  makeAvatar({ personType: "generic", front: makeImage(GENERATED), voice });

function row(overrides: Partial<GenerationRow> = {}): GenerationRow {
  return {
    id: "g1", node_id: null, avatar_id: "a1", org_id: "org-1", client_id: "c1", type: "video",
    status: "succeeded", provider_job_id: null, model_used: GEMINI_OMNI_MODEL_ID,
    params_snapshot: voicePreviewParams("omni"),
    inputs_snapshot: {
      slot: AVATAR_VOICE_PREVIEW_SLOT, mode: "named", line: "Hello there.", voiceId: "v1",
      voiceName: "Surabhi", priceMultiplier: 1, frontUrl: FRONT,
    },
    output_snapshot: "https://storage.googleapis.com/b/preview.mp4",
    tokens_used: null, cost_usd: 0.61, credits_charged: 615, version_id: null, user_id: "u1",
    error: null, meta: null,
    created_at: "2026-09-30T10:00:00.000Z", updated_at: "2026-09-30T10:01:00.000Z",
    ...overrides,
  };
}

const nativeRow = (overrides: Partial<GenerationRow> = {}) =>
  row({
    model_used: SEEDANCE_MODEL_ID,
    params_snapshot: voicePreviewParams("seedance"),
    inputs_snapshot: {
      slot: AVATAR_VOICE_PREVIEW_SLOT, mode: "native", line: "Hello there.", frontUrl: FRONT,
    },
    ...overrides,
  });

describe("voicePreviewMode", () => {
  it("a named voice is heard through Omni and a re-voice", () => {
    expect(voicePreviewMode(makeAvatar({ voice: NAMED }))).toBe("named");
  });
  it("the engine's own voice is heard through Seedance", () => {
    expect(voicePreviewMode(generated(NATIVE))).toBe("native");
  });
  it("there is nothing to preview until a voice is declared", () => {
    expect(voicePreviewMode(makeAvatar({ voice: null }))).toBeNull();
  });
});

describe("VOICE_PREVIEW_ENGINE", () => {
  it("runs Omni at 720p for 6 s and Seedance at 480p for 5 s", () => {
    expect(VOICE_PREVIEW_ENGINE.omni).toEqual({ modelId: GEMINI_OMNI_MODEL_ID, resolution: "720p", seconds: 6 });
    expect(VOICE_PREVIEW_ENGINE.seedance).toEqual({ modelId: SEEDANCE_MODEL_ID, resolution: "480p", seconds: 5 });
  });
  it("keeps a sample only from the engine's own voice", () => {
    expect(voicePreviewKeepsSample("native")).toBe(true);
    expect(voicePreviewKeepsSample("named")).toBe(false);
  });
});

describe("voicePreviewEngine", () => {
  const named: AvatarVoice = { mode: "named", voiceId: "v1", name: "Surabhi", labels: {}, previewUrl: null };
  it("re-voices a named voice on Omni, whatever the face", () => {
    expect(voicePreviewEngine({ voice: named, front: makeImage(GENERATED) })).toBe("omni");
  });
  it("makes the engine's own voice with Seedance on a Seedream face, and with Omni on any other", () => {
    expect(voicePreviewEngine({ voice: { mode: "native" }, front: makeImage(GENERATED) })).toBe("seedance");
    expect(voicePreviewEngine({ voice: { mode: "native" }, front: makeImage() })).toBe("omni");
    const nano = { ...GENERATED, modelId: "gemini:gemini-3.1-flash-image" } as typeof GENERATED;
    expect(voicePreviewEngine({ voice: { mode: "native" }, front: makeImage(nano) })).toBe("omni");
  });
  it("is null without a voice or a front", () => {
    expect(voicePreviewEngine({ voice: null, front: makeImage() })).toBeNull();
    expect(voicePreviewEngine({ voice: { mode: "native" }, front: null })).toBeNull();
  });
});

describe("voicePreviewRowEngine", () => {
  it("reads the engine a preview was made with, and infers it for rows written before D301", () => {
    expect(voicePreviewRowEngine({ inputs_snapshot: { mode: "native", engine: "omni" } } as never)).toBe("omni");
    expect(voicePreviewRowEngine({ inputs_snapshot: { mode: "native" } } as never)).toBe("seedance");
    expect(voicePreviewRowEngine({ inputs_snapshot: {} } as never)).toBe("omni");
  });
});

describe("defaultVoicePreviewLine", () => {
  it("introduces the avatar by name", () => {
    expect(defaultVoicePreviewLine("  Riya ")).toBe("Hi, I'm Riya. This is how I sound.");
  });
  it("drops the introduction for an unnamed avatar", () => {
    expect(defaultVoicePreviewLine("")).toBe("Hi. This is how I sound.");
  });
});

describe("buildVoicePreviewPrompt", () => {
  it("quotes the line as the only thing said, with no music", () => {
    const prompt = buildVoicePreviewPrompt("Hello there.", "named");
    expect(prompt).toContain('"Hello there."');
    expect(prompt).toMatch(/nothing else/i);
    expect(prompt).toMatch(/no music/i);
  });
  it("keeps a quote inside the line from closing the quotation", () => {
    expect(buildVoicePreviewPrompt('Say "hi" now', "named")).toContain("\"Say 'hi' now\"");
  });
  it("asks Seedance for a voice that suits the person, and for nothing riding along with it", () => {
    const prompt = buildVoicePreviewPrompt("Hello there.", "native");
    expect(prompt).toContain('"Hello there."');
    expect(prompt).toMatch(/suited to their age/i);
    expect(prompt).toMatch(/no sound effects/i);
  });
});

describe("voicePreviewParams", () => {
  it("sends Omni an aspect_ratio and Seedance a ratio — neither takes the other's key", () => {
    expect(voicePreviewParams("omni")).toEqual({ resolution: "720p", duration: 6, aspect_ratio: "9:16" });
    expect(voicePreviewParams("seedance")).toEqual({ resolution: "480p", duration: 5, ratio: "9:16" });
  });
});

describe("cost", () => {
  it("a named preview is the Omni clip plus the voice change, at the voice's rate", () => {
    const video = computeVideoCost(GEMINI_OMNI_MODEL_ID, 6, false, "720p")!.usd;
    expect(voicePreviewCostUsd("named", "omni", 6, "720p", 2)).toBeCloseTo(video + computeVoiceChangeCost(6, 2).usd);
  });
  it("a native preview is the Seedance clip alone — its voice arrives with it", () => {
    expect(voicePreviewCostUsd("native", "seedance", 5, "480p", 1))
      .toBeCloseTo(computeVideoCost(SEEDANCE_MODEL_ID, 5, false, "480p")!.usd);
  });
  it("a voice's price multiplier never touches a native preview", () => {
    expect(voicePreviewCostUsd("native", "seedance", 5, "480p", 3)).toBe(voicePreviewCostUsd("native", "seedance", 5, "480p", 1));
  });
  it("estimates each mode at its own fixed length", () => {
    expect(estimateVoicePreviewCredits("native", "seedance")).toBe(
      usdToFinalCredits(voicePreviewCostUsd("native", "seedance", AVATAR_VOICE_SAMPLE_SECONDS, "480p", 1)!),
    );
    expect(estimateVoicePreviewCredits("named", "omni", 1)).toBe(
      usdToFinalCredits(voicePreviewCostUsd("named", "omni", 6, "720p", 1)!),
    );
  });
  it("an engine's own voice on Omni is the Omni clip alone — nothing is re-voiced", () => {
    expect(voicePreviewCostUsd("native", "omni", 6, "720p", 2))
      .toBeCloseTo(computeVideoCost(GEMINI_OMNI_MODEL_ID, 6, false, "720p")!.usd);
  });
  it("has no price for a resolution the engine does not sell", () => {
    expect(voicePreviewCostUsd("named", "omni", 6, "8k", 1)).toBeNull();
  });
});

describe("voicePreviewBlocker", () => {
  it("allows an avatar with a front image and a declared voice", () => {
    expect(voicePreviewBlocker(makeAvatar({ voice: NAMED }))).toBeNull();
    expect(voicePreviewBlocker(generated(NATIVE))).toBeNull();
  });
  it("needs a front image", () => {
    expect(voicePreviewBlocker(makeAvatar({ front: null, voice: NAMED }))).toMatch(/front image/i);
  });
  it("needs a declaration — it is what picks the engine", () => {
    expect(voicePreviewBlocker(makeAvatar({ voice: null }))).toMatch(/choose a voice/i);
  });
});

describe("generationToVoicePreview", () => {
  it("reads a finished named preview", () => {
    expect(generationToVoicePreview(row())).toEqual({
      generationId: "g1", mode: "named", status: "succeeded",
      url: "https://storage.googleapis.com/b/preview.mp4", line: "Hello there.",
      voiceId: "v1", voiceName: "Surabhi", frontUrl: FRONT, error: null,
      createdAt: "2026-09-30T10:00:00.000Z",
    });
  });
  it("reads a native preview, which has no voice id of its own", () => {
    expect(generationToVoicePreview(nativeRow())).toMatchObject({ mode: "native", voiceId: null, voiceName: "" });
  });
  it("treats a row written before the modes existed as a named preview", () => {
    const legacy = row({ inputs_snapshot: { slot: AVATAR_VOICE_PREVIEW_SLOT, line: "x", voiceId: "v1", frontUrl: FRONT } });
    expect(voicePreviewRowMode(legacy)).toBe("named");
    expect(generationToVoicePreview(legacy)?.voiceId).toBe("v1");
  });
  it("carries the reason a preview failed", () => {
    const preview = generationToVoicePreview(row({ status: "failed", output_snapshot: null, error: "Refused" }));
    expect(preview).toMatchObject({ status: "failed", url: null, error: "Refused" });
  });
  it("is not an avatar image generation", () => {
    const image = row({ type: "image", inputs_snapshot: { slot: "front" } });
    expect(isVoicePreviewGeneration(image)).toBe(false);
    expect(generationToVoicePreview(image)).toBeNull();
  });
  it("is not a canvas node's generation", () => {
    expect(isVoicePreviewGeneration(row({ node_id: "n1", avatar_id: null }))).toBe(false);
  });
});

describe("isVoicePreviewStale", () => {
  const named = generationToVoicePreview(row())!;
  const native = generationToVoicePreview(nativeRow())!;

  it("is current while the voice and the front image are the ones it was made with", () => {
    expect(isVoicePreviewStale(named, makeAvatar({ voice: NAMED }))).toBe(false);
    expect(isVoicePreviewStale(native, generated(NATIVE))).toBe(false);
  });
  it("is out of date once the voice changes", () => {
    expect(isVoicePreviewStale(named, makeAvatar({ voice: { ...NAMED, voiceId: "v2" } }))).toBe(true);
    expect(isVoicePreviewStale(named, makeAvatar({ voice: null }))).toBe(true);
  });
  it("is out of date once the declaration switches engines", () => {
    expect(isVoicePreviewStale(native, makeAvatar({ voice: NAMED }))).toBe(true);
    expect(isVoicePreviewStale(named, generated(NATIVE))).toBe(true);
  });
  it("is out of date once the front image changes", () => {
    const front = { ...makeImage(GENERATED), url: "https://storage.googleapis.com/b/other.png" };
    expect(isVoicePreviewStale(native, makeAvatar({ personType: "generic", front, voice: NATIVE }))).toBe(true);
  });
});

describe("isVoicePreviewAbandoned", () => {
  const started = new Date("2026-09-30T10:00:00.000Z").getTime();
  it("leaves a preview alone while its task can still be running", () => {
    expect(isVoicePreviewAbandoned(row({ status: "running" }), started + 5 * 60 * 1000)).toBe(false);
  });
  it("gives up on one still running long after its task must have ended", () => {
    expect(isVoicePreviewAbandoned(row({ status: "running" }), started + 16 * 60 * 1000)).toBe(true);
  });
  it("never applies to a finished preview", () => {
    expect(isVoicePreviewAbandoned(row(), started + 60 * 60 * 1000)).toBe(false);
  });
});
