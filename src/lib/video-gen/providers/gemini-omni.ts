import "server-only";
import { logger } from "@trigger.dev/sdk/v3";
import type { VideoGenInput, VideoGenResult, VideoGenModelSpec } from "../types";
import { geminiOmniParams } from "../params/gemini-omni";
import { GEMINI_OMNI_IMAGE_INPUTS, GEMINI_OMNI_RULES } from "../gemini-omni-shape";
import { planOmniInput } from "../plan-omni-input";
import { composeOmniPrompt } from "../compose-omni-prompt";
import { fetchAsBase64 } from "./fetch-as-base64";
import { fetchOrThrow } from "./fetch-error";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const OMNI_MODEL = "gemini-omni-1.1-flash";

// Omni generates synchronously (background:false), so the whole render happens inside this one
// request. Node's fetch defaults to a 300s headers timeout, which a 10s 1080p/4k generation can
// exceed — and on that throw the task refunds a generation Google has already billed. An explicit
// timeout below the Trigger task's 600s budget makes the failure deliberate rather than incidental.
const OMNI_REQUEST_TIMEOUT_MS = 540_000;

function getApiKey(): string {
  // Deliberately the SAME key Veo uses — Omni is the Gemini API, not a separate product.
  const key = process.env.GOOGLE_GENAI_API_KEY;
  if (!key) throw new Error("Missing GOOGLE_GENAI_API_KEY");
  return key;
}

const VALID_RESOLUTIONS = ["360p", "720p", "1080p", "4k"];
const VALID_ASPECT_RATIOS = ["16:9", "9:16"];
const MIN_DURATION = 3;
const MAX_DURATION = 10;

/**
 * The clamped duration in seconds, as a NUMBER.
 *
 * Two consumers that must never disagree: the request body (which needs it as a string) and the
 * `durationSeconds` reported back for costing. Reading the number back off the built request
 * would yield NaN, since the wire value is "8s" — a zero-cost record for a video that really ran.
 *
 * Clamped rather than trusted: params/gemini-omni.ts is a static spec, and a node saved before a
 * spec change still holds its old value with nothing re-validating it on load.
 */
export function omniDurationSeconds(params: Record<string, unknown>): number {
  const parsed = Number(params.duration);
  if (!Number.isFinite(parsed)) return 8;
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(parsed)));
}

/**
 * D196 — everything dimensional lives HERE, not in video_config.
 *
 * Verified against the live API: `generation_config.video_config` accepts `task` and nothing else.
 * It rejects `duration`, `resolution` and `aspect_ratio` with "Unknown parameter", contradicting
 * Google's published documentation on all three. `duration` is a STRING ("8s") — the integer form
 * returns "Invalid input at 'response_format'".
 *
 * `type` is the constant "video". It is never a param and is never surfaced in the UI.
 *
 * `delivery` is always "uri", not only above 4MB: completeGeneration already downloads a provider
 * URI with x-goog-api-key and re-uploads to GCS, so the URI path needs no new machinery, while
 * inline base64 would carry a whole video through this process's memory for no gain.
 */
export function buildOmniResponseFormat(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const resolution = String(params.resolution ?? "720p");
  const ratio = String(params.aspect_ratio ?? "16:9");
  return {
    type: "video",
    resolution: VALID_RESOLUTIONS.includes(resolution) ? resolution : "720p",
    aspect_ratio: VALID_ASPECT_RATIOS.includes(ratio) ? ratio : "16:9",
    delivery: "uri",
    duration: `${omniDurationSeconds(params)}s`,
  };
}

/**
 * The complete request body, as a pure function so the facts below are testable.
 *
 * Three things here are load-bearing and each was verified against the live API:
 *   - `input` is images in plan order, then the text part LAST. That order IS the contract:
 *     the `@ImageN` numbers in the prompt's generated header count this array from 1.
 *   - `store: true` is REQUIRED by `delivery: "uri"` — without it the API returns 400.
 *   - `video_config` carries `task` and NOTHING else — any other key returns 400
 *     `Unknown parameter`, contradicting Google's published docs.
 */
export function buildOmniRequestBody(args: {
  imageParts: Array<Record<string, unknown>>;
  text: string;
  task: string;
  params: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    model: OMNI_MODEL,
    input: [...args.imageParts, { type: "text", text: args.text }],
    generation_config: { video_config: { task: args.task } },
    response_format: buildOmniResponseFormat(args.params),
    store: true,
    background: false,
    stream: false,
  };
}

type OmniContent = { type: string; mime_type?: string; uri?: string; data?: string };
type OmniStep = { type: string; content?: OmniContent[] };
type OmniInteraction = {
  id?: string;
  status?: string;
  steps?: OmniStep[];
  error?: { message?: string };
};

/**
 * The generated video's URI.
 *
 * `output_video` is an SDK-only convenience field — VERIFIED absent from the REST response, as the
 * docs' own note says. The video lives in the `model_output` step's `video`-typed content entry.
 */
export function extractOmniVideoUri(interaction: OmniInteraction): string | undefined {
  for (const step of interaction.steps ?? []) {
    if (step.type !== "model_output") continue;
    for (const content of step.content ?? []) {
      if (content.type === "video" && content.uri) return content.uri;
    }
  }
  return undefined;
}

/** `files/abc-123` from a download URI, for the Files API status check. */
export function fileNameFromUri(uri: string): string | undefined {
  const match = uri.match(/files\/([a-zA-Z0-9_-]+)/);
  return match ? `files/${match[1]}` : undefined;
}

const FILE_POLL_INTERVAL_MS = 5_000;
const FILE_POLL_MAX_ATTEMPTS = 60;

/**
 * Wait for the returned Files object to reach ACTIVE.
 *
 * VERIFIED 2026-08-30: it does NOT start ACTIVE. A real 10s/360p generation returned its URI while
 * the file was still `PROCESSING`, and only reached `ACTIVE` on the next poll ~5s later. An earlier
 * version of this checked the state once, logged it and returned — which handed `completeGeneration`
 * a URI it could try to download before the object was ready.
 *
 * Still FAILS OPEN on anything unexpected — a non-OK metadata response, a throw, or running out of
 * attempts logs and returns rather than throwing. `completeGeneration` downloads the URI itself and
 * surfaces a real failure there, so blocking a generation that already succeeded (and was already
 * billed) on a flaky metadata endpoint would be the worse error. FAILED is the one state worth
 * throwing on: the file will never arrive.
 */
async function waitForFileReady(fileName: string): Promise<void> {
  for (let attempt = 0; attempt < FILE_POLL_MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(`${API_BASE}/${fileName}`, {
        headers: { "x-goog-api-key": getApiKey() },
      });
      if (!res.ok) {
        logger.info("Omni file metadata unavailable — continuing", {
          fileName,
          status: res.status,
        });
        return;
      }
      const file = (await res.json()) as { state?: string };
      if (file.state === "ACTIVE") return;
      if (file.state === "FAILED") {
        throw new Error(`Omni file processing failed for ${fileName}`);
      }
      logger.info("Omni file not ready", { fileName, state: file.state, attempt });
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Omni file processing failed")) throw e;
      logger.info("Omni file check failed — continuing", {
        fileName,
        error: e instanceof Error ? e.message : "unknown",
      });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, FILE_POLL_INTERVAL_MS));
  }
  logger.info("Omni file still not ACTIVE after polling — continuing", { fileName });
}

async function generateWithOmni(input: VideoGenInput): Promise<VideoGenResult> {
  // D186 mirrored server-side. The client evaluates the same rule, so this is the backstop for a
  // caller that bypasses the UI — a named error now rather than a 400 minutes later.
  if (input.endFrameUrl && !input.startFrameUrl) {
    throw new Error("<LAST_FRAME> requires <FIRST_FRAME> — Omni cannot use an end frame alone");
  }

  const plan = planOmniInput({
    startFrameUrl: input.startFrameUrl,
    endFrameUrl: input.endFrameUrl,
    referenceUrls: input.referenceUrls ?? [],
  });

  // Logged BEFORE the downloads, not only before the POST. These are the first network calls the
  // task makes, and a failure in one used to be indistinguishable from a failure in the Omni call
  // itself — both surfaced as the same bare "TypeError: fetch failed" with nothing logged yet.
  logger.info("Omni inputs", {
    task: plan.task,
    images: plan.uploads.length,
    roles: plan.uploads.map((u) => u.role),
  });

  // Images first, in planOmniInput's order, then the text part last. The order IS the contract:
  // @ImageN in the generated header counts this array from 1.
  const imageParts = await Promise.all(
    plan.uploads.map(async (upload) => {
      const { imageBytes, mimeType } = await fetchAsBase64(upload.url);
      return { type: "image", data: imageBytes, mime_type: mimeType };
    }),
  );

  const text = composeOmniPrompt({ prompt: input.prompt, params: input.params, plan });
  const body = JSON.stringify(
    buildOmniRequestBody({ imageParts, text, task: plan.task, params: input.params }),
  );

  // Logged before the await: on a timeout there is no response to log, and store:true means the
  // interaction exists on Google's side — this line is the only trail back to a billed render.
  // bodyKB is here because the images travel INLINE as base64: a few large references push this
  // into tens of MB, and a server that drops an oversized body reports only "fetch failed".
  logger.info("Omni request", {
    task: plan.task,
    images: plan.uploads.length,
    resolution: String(input.params.resolution ?? "720p"),
    durationSeconds: omniDurationSeconds(input.params),
    bodyKB: Math.round(Buffer.byteLength(body) / 1024),
  });

  const res = await fetchOrThrow("Omni create", `${API_BASE}/interactions`, {
    method: "POST",
    headers: { "x-goog-api-key": getApiKey(), "Content-Type": "application/json" },
    // task and NOTHING else — video_config rejects every other key (D196).
    // store:true is REQUIRED by delivery:"uri" — the API returns 400 "store=true is required when
    // response format has video delivery set to URI" without it. Not a preference. A useful side
    // effect: the interaction is stored, so previous_interaction_id editing is available if the
    // edit chain is ever built, with no request-shape change.
    // background:false returns the finished interaction synchronously, so there is no
    // task-polling loop — verified.
    body,
    signal: AbortSignal.timeout(OMNI_REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Omni create failed (${res.status}): ${body}`);
  }

  const interaction = (await res.json()) as OmniInteraction;
  logger.info("Omni interaction", { id: interaction.id, status: interaction.status });

  if (interaction.status === "failed") {
    throw new Error(`Omni generation failed: ${interaction.error?.message ?? "unknown error"}`);
  }

  const videoUrl = extractOmniVideoUri(interaction);
  if (!videoUrl) throw new Error("Omni completed but returned no video URI");

  const fileName = fileNameFromUri(videoUrl);
  if (fileName) await waitForFileReady(fileName);

  // The REQUESTED duration — Omni returns none in its response. Read from the same helper the
  // request used, never parsed back off the "8s" wire value.
  return { videoUrl, durationSeconds: omniDurationSeconds(input.params) };
}

export const geminiOmni: VideoGenModelSpec = {
  id: "gemini:gemini-omni-1.1-flash",
  provider: "gemini",
  label: "Gemini Omni 1.1 Flash",
  pickerLabel: "Omni 1.1",
  providerLabel: "Google",
  maxDurationSeconds: 10,
  imageInputs: GEMINI_OMNI_IMAGE_INPUTS,
  params: geminiOmniParams,
  rules: GEMINI_OMNI_RULES,
  generate: generateWithOmni,
};
