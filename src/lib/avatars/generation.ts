import { defaultsForModel, imageGenClientModelMap } from "@/lib/image-gen/client-models";
import { estimateImageGenerationCostUsd } from "@/lib/image-gen/estimate";
import { usdToFinalCredits } from "@/lib/credits/units";
import {
  AVATAR_FRAMING_CLAUSE, AVATAR_STYLES, SEEDANCE_FACE_MODEL_ID,
  type AvatarAttributes, type AvatarStyleId,
} from "./constants";

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
