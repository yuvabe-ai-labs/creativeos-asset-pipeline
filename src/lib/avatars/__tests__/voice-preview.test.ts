import { describe, it, expect } from "vitest";
import {
  buildVoicePreviewPrompt, defaultVoicePreviewLine, estimateVoicePreviewCredits,
  generationToVoicePreview, isVoicePreviewAbandoned, isVoicePreviewGeneration, isVoicePreviewStale, voicePreviewBlocker,
  voicePreviewCostUsd, voicePreviewParams,
} from "../voice-preview";
import { AVATAR_VOICE_PREVIEW_SECONDS, AVATAR_VOICE_PREVIEW_SLOT } from "../constants";
import { GENERATED, makeAvatar, makeImage } from "./fixtures";
import type { AvatarVoice } from "../schema";
import type { GenerationRow } from "@/lib/db/types";
import { computeVideoCost } from "@/lib/video-gen/cost";
import { computeVoiceChangeCost } from "@/lib/elevenlabs/cost";
import { usdToFinalCredits } from "@/lib/credits/units";
import { GEMINI_OMNI_MODEL_ID } from "@/lib/video-gen/client-models";

const NAMED: AvatarVoice = { mode: "named", voiceId: "v1", name: "Surabhi", labels: {}, previewUrl: null };
const FRONT = makeImage().url;

function row(overrides: Partial<GenerationRow> = {}): GenerationRow {
  return {
    id: "g1", node_id: null, avatar_id: "a1", org_id: "org-1", client_id: "c1", type: "video",
    status: "succeeded", provider_job_id: null, model_used: GEMINI_OMNI_MODEL_ID,
    params_snapshot: voicePreviewParams(),
    inputs_snapshot: {
      slot: AVATAR_VOICE_PREVIEW_SLOT, line: "Hello there.", voiceId: "v1", voiceName: "Surabhi",
      priceMultiplier: 1, frontUrl: FRONT,
    },
    output_snapshot: "https://storage.googleapis.com/b/preview.mp4",
    tokens_used: null, cost_usd: 0.61, credits_charged: 615, version_id: null, user_id: "u1",
    error: null, meta: null,
    created_at: "2026-09-30T10:00:00.000Z", updated_at: "2026-09-30T10:01:00.000Z",
    ...overrides,
  };
}

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
    const prompt = buildVoicePreviewPrompt("Hello there.");
    expect(prompt).toContain('"Hello there."');
    expect(prompt).toMatch(/nothing else/i);
    expect(prompt).toMatch(/no music/i);
  });
  it("keeps a quote inside the line from closing the quotation", () => {
    expect(buildVoicePreviewPrompt('Say "hi" now')).toContain("\"Say 'hi' now\"");
  });
});

describe("cost", () => {
  it("is the Omni clip plus the voice change, at the voice's rate", () => {
    const video = computeVideoCost(GEMINI_OMNI_MODEL_ID, 6, false, "720p")!.usd;
    expect(voicePreviewCostUsd(6, "720p", 2)).toBeCloseTo(video + computeVoiceChangeCost(6, 2).usd);
  });
  it("estimates the fixed preview length", () => {
    expect(estimateVoicePreviewCredits(1)).toBe(
      usdToFinalCredits(voicePreviewCostUsd(AVATAR_VOICE_PREVIEW_SECONDS, "720p", 1)!),
    );
  });
  it("has no price for a resolution Omni does not sell", () => {
    expect(voicePreviewCostUsd(6, "8k", 1)).toBeNull();
  });
});

describe("voicePreviewBlocker", () => {
  it("allows an avatar with a front image and a named voice", () => {
    expect(voicePreviewBlocker(makeAvatar({ voice: NAMED }))).toBeNull();
  });
  it("needs a front image", () => {
    expect(voicePreviewBlocker(makeAvatar({ front: null, voice: NAMED }))).toMatch(/front image/i);
  });
  it("needs a named voice — the engine's own voice has nothing to apply", () => {
    expect(voicePreviewBlocker(makeAvatar({ voice: null }))).toMatch(/named voice/i);
    expect(
      voicePreviewBlocker(makeAvatar({ personType: "generic", front: makeImage(GENERATED), voice: { mode: "native" } })),
    ).toMatch(/named voice/i);
  });
});

describe("generationToVoicePreview", () => {
  it("reads a finished preview", () => {
    expect(generationToVoicePreview(row())).toEqual({
      generationId: "g1", status: "succeeded", url: "https://storage.googleapis.com/b/preview.mp4",
      line: "Hello there.", voiceId: "v1", voiceName: "Surabhi", frontUrl: FRONT, error: null,
      createdAt: "2026-09-30T10:00:00.000Z",
    });
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
  const preview = generationToVoicePreview(row())!;
  it("is current while the voice and the front image are the ones it was made with", () => {
    expect(isVoicePreviewStale(preview, makeAvatar({ voice: NAMED }))).toBe(false);
  });
  it("is out of date once the voice changes", () => {
    expect(isVoicePreviewStale(preview, makeAvatar({ voice: { ...NAMED, voiceId: "v2" } }))).toBe(true);
    expect(isVoicePreviewStale(preview, makeAvatar({ voice: null }))).toBe(true);
  });
  it("is out of date once the front image changes", () => {
    const front = { ...makeImage(), url: "https://storage.googleapis.com/b/other.png" };
    expect(isVoicePreviewStale(preview, makeAvatar({ voice: NAMED, front }))).toBe(true);
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
