import "server-only";
import { logger } from "@trigger.dev/sdk/v3";
import { submitFalJob, getFalStatus, getFalVideoResult, FalHttpError, type FalJob } from "@/lib/fal/client";
import { isSequenceVoParagraph, withShortSequenceVoPrefix } from "@/lib/nodes/multishot-plan";
import type { VideoGenResult } from "../types";
import { isVideoAudioEnabled } from "../cost";
import { avoidClause } from "./avoid-clause";
import { NO_ON_SCREEN_TEXT_LINE, SPEECH_TIMING, hasSpokenLine, shortSoundLine } from "../compose-omni-prompt";

/**
 * D484 — Kling through fal.ai's queue instead of Kling's own API (pay per use, no subscription).
 *
 * fal hosts the same models under its own names and request shape:
 *   Kling 3.0       → fal-ai/kling-video/v3/{tier}/image-to-video
 *   Kling 3.0 Omni  → fal-ai/kling-video/o3/{tier}/reference-to-video ("Kling O3" on fal)
 *   Kling O1        → fal-ai/kling-video/o1/image-to-video (frames) or …/o1/reference-to-video
 * where the tier IS the resolution: standard = 720p, pro = 1080p, 4k = 4k. Prices per second match
 * Kling's own table at every tier, so cost.ts is unchanged for 3.0 and 3.0 Omni.
 *
 * The prompt arrives in Kling's own dialect (it is what the prompt writers produce, and what the
 * native transport in kling.ts still sends), and is translated here, at the boundary:
 *   - `@image_N` handles become fal's `@ImageN` (Q7);
 *   - a Multishot `shot n, s, text;` ladder becomes fal's `multi_prompt` list (Q5). fal caps each
 *     shot at 512 characters, so every shot carries a SHORT rules line and the look, and only the
 *     first adds the roles line, the voiceover and the speech timing (see buildShotList);
 *   - on the Omni endpoints, which have no negative-prompt field, the negative prompt becomes an
 *     "Avoid: …" line (Q2), as on Gemini Omni and Veo — on a single prompt only, not in a shot list.
 */

export type KlingFalModel = "kling-3-0" | "kling-3-0-omni" | "kling-o1";

export type KlingFalInput = {
  prompt: string;
  startFrameUrl?: string;
  endFrameUrl?: string;
  referenceUrls: string[];
  params: Record<string, unknown>;
};

export type KlingFalRequest = {
  endpoint: string;
  body: Record<string, unknown>;
  /** What the clip will last. fal's result carries no duration, and settlement charges on this. */
  durationSeconds: number;
};

const TIER_BY_RESOLUTION: Record<string, string> = { "720p": "standard", "1080p": "pro", "4k": "4k" };

export function falTier(resolution: unknown): string {
  return TIER_BY_RESOLUTION[String(resolution ?? "720p")] ?? "standard";
}

/** `@image_3` → `@Image3`. `offset` shifts the numbering when a start frame takes slot 1 (O1). */
export function toFalImageTags(prompt: string, offset = 0): string {
  return prompt.replace(/@image_(\d+)/g, (_, n: string) => `@Image${Number(n) + offset}`);
}

// One D238 triple. Beat text never holds a `;` (renderPlan rewrites them to commas), so the first
// `;` that is followed by the next triple or the end of the prompt closes the shot.
const SHOT_RE = /shot (\d+), (\d+), ([\s\S]*?);(?=\s*(?:shot \d+, \d+, |$))/g;

export type KlingShotSplit = {
  /** The operator's look ("Rules for every shot"): every paragraph ahead of the ladder that is not one of the others. */
  look: string[];
  /** The `Reference roles: …` line, if any. First shot only, and dropped if that shot would not fit. */
  roles?: string;
  /** The sequence voiceover paragraph, if any. First shot only, so it is not spoken once per shot. */
  voiceover?: string;
  shots: Array<{ seconds: number; text: string }>;
};

/** fal's per-shot ceiling on `multi_prompt[].prompt` (its 422: "Prompt must not exceed 512 characters"). */
export const FAL_SHOT_MAX_CHARS = 512;

const ROLES_PREFIX = "Reference roles:";
const SOUND_PREFIX = "Sound design:";

/**
 * A Multishot prompt split into its lead and its shots, or null when the prompt is not a ladder.
 * Returns null rather than a partial split whenever anything after the first triple is not a
 * triple: a prompt we cannot fully account for is sent as one prompt, never with text dropped.
 */
export function splitKlingShots(prompt: string): KlingShotSplit | null {
  const start = prompt.search(/(?:^|\n)shot 1, \d+, /);
  if (start < 0) return null;
  const head = prompt.slice(0, start).trim();
  const tail = prompt.slice(start).trim();

  const matches = [...tail.matchAll(SHOT_RE)];
  if (matches.length === 0) return null;
  if (tail.replace(SHOT_RE, "").trim() !== "") return null;
  if (matches.some((m, i) => Number(m[1]) !== i + 1)) return null;

  const paragraphs = head ? head.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean) : [];
  const voiceover = paragraphs.find(isSequenceVoParagraph);
  const roles = paragraphs.find((p) => p.startsWith(ROLES_PREFIX));
  return {
    // The request lines (withRequestLines) are rebuilt short per shot, so the full ones are dropped here.
    look: paragraphs.filter(
      (p) => p !== voiceover && p !== roles && p !== NO_ON_SCREEN_TEXT_LINE && !p.startsWith(SOUND_PREFIX),
    ),
    roles,
    voiceover,
    shots: matches.map((m) => ({ seconds: Number(m[2]), text: m[3].trim() })),
  };
}

/**
 * fal's shot list, every entry within FAL_SHOT_MAX_CHARS (D484, option 2 after fal's 422).
 *
 * Every shot: one short rules line ("No on-screen text." + `shortSoundLine`), the look, the shot.
 * The first shot also carries the roles line and the sequence voiceover under its short
 * introduction (which carries the timing), or SPEECH_TIMING for on-camera lines alone. The full
 * 300-character sound clause and the Avoid line are not sent in a shot list: together with the
 * no-text line they were 531 characters, over the cap before any shot text.
 *
 * Refused HERE when a shot still does not fit, before anything is submitted, so the operator gets
 * the reason at once instead of fal's 422 after a queue wait. The roles line is the one thing
 * dropped to make room, as the route already drops it for the whole-prompt ceiling.
 */
function buildShotList(prompt: string, split: KlingShotSplit): Array<{ prompt: string; duration: string }> {
  const rules = `${NO_ON_SCREEN_TEXT_LINE} ${shortSoundLine(prompt)}`;
  // A voiceover's short introduction already says when it starts and ends; the timing sentence is
  // only added for on-camera lines with no voiceover, which have no such introduction.
  const voiceover = split.voiceover ? withShortSequenceVoPrefix(split.voiceover) : undefined;
  const timing = !voiceover && hasSpokenLine(prompt) ? SPEECH_TIMING : undefined;
  const shotText = (i: number, withRoles: boolean) =>
    [
      rules,
      ...split.look,
      ...(i === 0 ? [withRoles ? split.roles : undefined, voiceover, timing] : []),
      split.shots[i].text,
    ]
      .filter((p): p is string => Boolean(p))
      .join("\n\n");

  const texts = split.shots.map((_, i) => shotText(i, true));
  if (texts[0].length > FAL_SHOT_MAX_CHARS && split.roles) texts[0] = shotText(0, false);

  const over = texts.findIndex((t) => t.length > FAL_SHOT_MAX_CHARS);
  if (over >= 0) {
    throw new Error(
      `Shot ${over + 1} is ${texts[over].length} characters once the shared rules are added, and Kling on fal ` +
        `allows ${FAL_SHOT_MAX_CHARS} per shot. Shorten the look` +
        (over === 0 && split.voiceover ? ", the voiceover" : "") +
        " or that shot.",
    );
  }
  return texts.map((text, i) => ({ prompt: text, duration: String(split.shots[i].seconds) }));
}

function clampDuration(value: unknown, min: number, max: number): number {
  const n = Number(value ?? 5);
  // A non-finite value falls back to the default rather than clamping to NaN (see kling.ts).
  if (!Number.isFinite(n)) return Math.min(max, Math.max(min, 5));
  return Math.min(max, Math.max(min, Math.round(n)));
}

const OMNI_ASPECT_RATIOS = ["16:9", "9:16", "1:1"];

function aspectRatio(params: Record<string, unknown>): string {
  const ratio = String(params.aspect_ratio ?? "16:9");
  return OMNI_ASPECT_RATIOS.includes(ratio) ? ratio : "16:9";
}

/**
 * The prompt half of a request: `multi_prompt` for a ladder on a model that takes one, otherwise
 * `prompt`. `extra` holds lines appended to a single prompt (the Avoid line); a shot list does not
 * carry them (see buildShotList). Also returns the ladder's total, which then IS the clip's duration.
 */
function promptFields(
  prompt: string,
  opts: { shots: boolean; multiShot: boolean; extra: string[] },
): { fields: Record<string, unknown>; ladderSeconds?: number } {
  const split = opts.shots ? splitKlingShots(prompt) : null;
  if (split) {
    return {
      fields: { multi_prompt: buildShotList(prompt, split), shot_type: "customize" },
      ladderSeconds: split.shots.reduce((n, s) => n + s.seconds, 0),
    };
  }
  return {
    fields: {
      prompt: [prompt, ...opts.extra].filter((p) => p.trim()).join("\n\n"),
      // The hidden multi_shot param (params/kling.ts): a node toggled on before D218 still asks
      // Kling to choose its own cuts. Absent, fal's default `customize` with one prompt is one shot.
      ...(opts.multiShot ? { shot_type: "intelligent" } : {}),
    },
  };
}

function kling30Request(input: KlingFalInput): KlingFalRequest {
  if (!input.startFrameUrl) throw new Error("Kling image-to-video requires a start frame image");
  const { params } = input;
  const { fields, ladderSeconds } = promptFields(toFalImageTags(input.prompt), {
    shots: true,
    multiShot: Boolean(params.multi_shot ?? false),
    extra: [],
  });
  const duration = clampDuration(ladderSeconds ?? params.duration, 3, 15);
  const negativePrompt = String(params.negative_prompt ?? "").trim();
  return {
    endpoint: `fal-ai/kling-video/v3/${falTier(params.resolution)}/image-to-video`,
    body: {
      ...fields,
      start_image_url: input.startFrameUrl,
      ...(input.endFrameUrl ? { end_image_url: input.endFrameUrl } : {}),
      duration: String(duration),
      // Sent explicitly both ways: fal's v3 default is ON, Kling's settings builder treated absent as off.
      generate_audio: isVideoAudioEnabled(params.audio),
      ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
    },
    durationSeconds: duration,
  };
}

function kling30OmniRequest(input: KlingFalInput): KlingFalRequest {
  const { params, referenceUrls } = input;
  const { fields, ladderSeconds } = promptFields(toFalImageTags(input.prompt), {
    shots: true,
    multiShot: Boolean(params.multi_shot ?? false),
    extra: [avoidClause(String(params.negative_prompt ?? ""))].filter(Boolean),
  });
  const duration = clampDuration(ladderSeconds ?? params.duration, 3, 15);
  return {
    endpoint: `fal-ai/kling-video/o3/${falTier(params.resolution)}/reference-to-video`,
    body: {
      ...fields,
      ...(input.startFrameUrl ? { start_image_url: input.startFrameUrl } : {}),
      ...(input.endFrameUrl ? { end_image_url: input.endFrameUrl } : {}),
      ...(referenceUrls.length > 0 ? { image_urls: referenceUrls } : {}),
      duration: String(duration),
      generate_audio: isVideoAudioEnabled(params.audio),
      // OM8, unchanged: with a start frame the ratio comes from that image.
      ...(input.startFrameUrl ? {} : { aspect_ratio: aspectRatio(params) }),
    },
    durationSeconds: duration,
  };
}

/** fal's O1 reference prompt for a start frame passed as the first image, per fal's own example. */
const O1_START_FRAME_LINE = "Take @Image1 as the start frame.";

/**
 * O1 on fal is two endpoints that split our one request (Q1): frames go to image-to-video, which
 * has no references, and references go to reference-to-video, which has no frame fields. A start
 * frame rides reference-to-video as image 1, so every reference handle moves up one. An end frame
 * has no slot there at all, so end frame + references is refused (the client rule blocks it first).
 *
 * Both endpoints are 1080p only, silent, with no negative-prompt field. Duration is 5 or 10 s:
 * the frames-only endpoint rejects anything else despite fal's page listing 3–10 (422 "Duration
 * only support 5 or 10 seconds when no refer image"), and the node offers only 5/10 either way.
 */
const O1_VALID_DURATIONS = [5, 10];

function klingO1Request(input: KlingFalInput): KlingFalRequest {
  const { params, referenceUrls } = input;
  // A node saved while the slider briefly offered 3–10 may still hold another value: send 5, as
  // the native O1 builder (kling.ts) does, rather than a guaranteed 422 after a queue wait.
  const requested = Number(params.duration ?? 5);
  const duration = O1_VALID_DURATIONS.includes(requested) ? requested : 5;
  const avoid = avoidClause(String(params.negative_prompt ?? ""));

  if (referenceUrls.length === 0) {
    if (!input.startFrameUrl) throw new Error("Kling needs a start frame or at least one reference image");
    return {
      endpoint: "fal-ai/kling-video/o1/image-to-video",
      body: {
        prompt: [input.prompt, avoid].filter((p) => p.trim()).join("\n\n"),
        start_image_url: input.startFrameUrl,
        ...(input.endFrameUrl ? { end_image_url: input.endFrameUrl } : {}),
        duration: String(duration),
      },
      durationSeconds: duration,
    };
  }

  if (input.endFrameUrl) {
    throw new Error("Kling O1 can't use an end frame together with reference images");
  }
  const start = input.startFrameUrl;
  return {
    endpoint: "fal-ai/kling-video/o1/reference-to-video",
    body: {
      prompt: [start ? O1_START_FRAME_LINE : "", toFalImageTags(input.prompt, start ? 1 : 0), avoid]
        .filter((p) => p.trim())
        .join("\n\n"),
      image_urls: start ? [start, ...referenceUrls] : referenceUrls,
      duration: String(duration),
      aspect_ratio: aspectRatio(params),
    },
    durationSeconds: duration,
  };
}

export function buildKlingFalRequest(model: KlingFalModel, input: KlingFalInput): KlingFalRequest {
  switch (model) {
    case "kling-3-0": return kling30Request(input);
    case "kling-3-0-omni": return kling30OmniRequest(input);
    case "kling-o1": return klingO1Request(input);
  }
}

// The same polling contract as the native transport (kling.ts): 5 s interval, a run of 10 failed
// checks tolerated, a 30-minute deadline. The job is billed once submitted, so nothing here ever
// resubmits; a lost poll only ever ends in "it may still be running at the vendor".
const POLL_INTERVAL_MS = 5_000;
const MAX_CONSECUTIVE_POLL_FAILURES = 10;
const POLL_DEADLINE_MS = 30 * 60_000;

function isRetryable(e: unknown): boolean {
  if (e instanceof FalHttpError) return e.status === 429 || e.status >= 500;
  // `fetch` throws a bare TypeError on a network-level failure.
  return e instanceof TypeError;
}

async function waitForFalVideo(job: FalJob): Promise<string> {
  const deadline = Date.now() + POLL_DEADLINE_MS;
  let consecutiveFailures = 0;

  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    if (Date.now() > deadline) {
      throw new Error(
        `Kling job ${job.requestId} on fal did not finish within ${POLL_DEADLINE_MS / 60_000} minutes. ` +
          `It may still be running at the vendor.`,
      );
    }
    try {
      const status = await getFalStatus(job.statusUrl);
      consecutiveFailures = 0;
      logger.info("Kling (fal) job status", { requestId: job.requestId, status });
      if (status !== "COMPLETED") continue;
      return (await getFalVideoResult(job.responseUrl, "Kling")).videoUrl;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!isRetryable(e)) throw new Error(`Kling generation failed: ${message}`);
      consecutiveFailures += 1;
      logger.warn("Kling (fal) poll failed, retrying", { requestId: job.requestId, consecutiveFailures, error: message });
      if (consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
        throw new Error(
          `Kling polling on fal failed ${consecutiveFailures} times in a row for job ${job.requestId} ` +
            `(last: ${message}). It may still be running at the vendor.`,
        );
      }
    }
  }
}

export async function generateKlingOnFal(model: KlingFalModel, input: KlingFalInput): Promise<VideoGenResult> {
  const request = buildKlingFalRequest(model, input);
  const job = await submitFalJob(request.endpoint, request.body, "Kling");
  logger.info("Kling job queued on fal", { requestId: job.requestId, endpoint: request.endpoint });
  const videoUrl = await waitForFalVideo(job);
  return { videoUrl, durationSeconds: request.durationSeconds };
}
