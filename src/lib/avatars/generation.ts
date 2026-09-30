import { defaultsForModel, imageGenClientModelMap } from "@/lib/image-gen/client-models";
import { estimateImageGenerationCostUsd } from "@/lib/image-gen/estimate";
import { usdToFinalCredits } from "@/lib/credits/units";
import {
  AVATAR_FRAMING_CLAUSE, AVATAR_STYLES, SEEDANCE_FACE_MODEL_ID,
  type AvatarAttributes, type AvatarStyleId,
} from "./constants";
import type { Avatar, AvatarCandidate } from "./schema";

// Pure, and deliberately without a "server-only" guard: the Studio calls these to show a cost
// before generating, and the routes call the same functions to reserve — so the number on the
// button is the number reserved.

/** The full prompt sent for a front image: what the operator wrote, then what they must not
 *  be able to write away. */
export function buildAvatarFrontPrompt(input: {
  description: string;
  attributes: AvatarAttributes;
  styleId: AvatarStyleId;
}): string {
  const { gender, age, ethnicity } = input.attributes;
  const who = [ethnicity, gender, age ? `aged ${age}` : undefined].filter(Boolean).join(", ");
  const style = AVATAR_STYLES.find((s) => s.id === input.styleId) ?? AVATAR_STYLES[0];
  return [input.description.trim(), who ? `${who}.` : "", style.phrase, AVATAR_FRAMING_CLAUSE]
    .filter(Boolean)
    .join(" ");
}

/** The profile sheet is made from the front image, so the prompt only describes the layout.
 *  "character reference sheet" is stated because a multi-angle image on a plain backdrop has
 *  been read as a location before (roadmap D281). */
export function buildAvatarSheetPrompt(): string {
  return (
    "A character reference sheet of the same person as the reference image: three views side by " +
    "side in one wide image — front, side profile, and back. Same person, same face, " +
    "same hair, same outfit in every view. Standing, full upper body, neutral expression, even " +
    "soft light, plain light-grey seamless background. No text, no labels, no borders."
  );
}

/** The model's own defaults with the aspect ratio forced. Null for an unknown model. */
export function avatarImageParams(
  modelId: string,
  aspect: string,
): Record<string, unknown> | null {
  const model = imageGenClientModelMap[modelId];
  if (!model) return null;
  return { ...defaultsForModel(model), aspect_ratio: aspect };
}

export function estimateAvatarImageCostUsd(input: {
  modelId: string;
  aspect: string;
  referenceCount: number;
}): number | null {
  const params = avatarImageParams(input.modelId, input.aspect);
  if (!params) return null;
  return estimateImageGenerationCostUsd({
    modelId: input.modelId,
    quality: params.quality as string | undefined,
    aspectRatio: input.aspect,
    imageSize: params.image_size as string | undefined,
    // Only the count is read; the URLs themselves do not change the price.
    referenceUrls: Array.from({ length: input.referenceCount }, () => ""),
  });
}

export function estimateAvatarImageCredits(input: {
  modelId: string;
  aspect: string;
  referenceCount: number;
}): number | null {
  const usd = estimateAvatarImageCostUsd(input);
  return usd === null ? null : usdToFinalCredits(usd);
}

export function isSeedanceFaceModel(modelId: string): boolean {
  return modelId === SEEDANCE_FACE_MODEL_ID;
}

// ── Batches (the Studio's candidate grid) ─────────────────────────────────────

/** A placeholder for an image still generating. */
export type PendingCandidate = { key: string; batchId: string; modelId: string };

export type CandidateBatch = {
  batchId: string;
  modelId: string;
  /** Null while the batch has produced nothing yet. */
  createdAt: string | null;
  candidates: AvatarCandidate[];
  pendingCount: number;
};

/** De-duplicated by generation, newest first — a list load and a just-finished image can both
 *  deliver the same row. */
export function mergeCandidates(
  current: AvatarCandidate[],
  incoming: AvatarCandidate[],
): AvatarCandidate[] {
  const byId = new Map<string, AvatarCandidate>();
  for (const c of [...current, ...incoming]) byId.set(c.generationId, c);
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** One group per Generate click, newest first. A batch still generating sorts first so its
 *  placeholders appear where the operator is looking. */
export function groupCandidatesByBatch(
  candidates: AvatarCandidate[],
  pending: PendingCandidate[],
): CandidateBatch[] {
  const batches = new Map<string, CandidateBatch>();
  const batchFor = (batchId: string, modelId: string) => {
    let batch = batches.get(batchId);
    if (!batch) {
      batch = { batchId, modelId, createdAt: null, candidates: [], pendingCount: 0 };
      batches.set(batchId, batch);
    }
    return batch;
  };
  for (const p of pending) batchFor(p.batchId, p.modelId).pendingCount += 1;
  for (const c of candidates) {
    const batch = batchFor(c.batchId ?? c.generationId, c.modelId);
    batch.candidates.push(c);
    if (!batch.createdAt || c.createdAt > batch.createdAt) batch.createdAt = c.createdAt;
  }
  return [...batches.values()].sort((a, b) => {
    if ((a.pendingCount > 0) !== (b.pendingCount > 0)) return a.pendingCount > 0 ? -1 : 1;
    return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  });
}

/** Which engine this avatar will run on (spec §8, D290). Derived, never stored. */
export function avatarEngineNote(avatar: Pick<Avatar, "front" | "personType">): string | null {
  if (!avatar.front || !avatar.personType) return null;
  if (avatar.personType === "specific") return "Gemini Omni · clips up to 10 s";
  const source = avatar.front.source;
  return source.kind === "generated" && isSeedanceFaceModel(source.modelId)
    ? "Seedance · clips up to 30 s"
    : "Seedance will not accept this face — generate it with Seedream 5.0 Lite";
}
