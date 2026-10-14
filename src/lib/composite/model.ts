import { SEEDANCE_FACE_MODEL_ID } from "@/lib/avatars/constants";
import { imageModelWorksWith, listSentence } from "@/lib/avatars/generation";
import { imageGenClientModelMap } from "@/lib/image-gen/client-models";

// D312 — which image model a composite is made with. Seedream by default: a composite with an
// avatar in it is a new picture of that face, and Seedance takes a face only from
// SEEDANCE_FACE_MODEL_ID (D290). But the operator may choose another (Nano Banana) when the clip
// is going to Gemini Omni, Kling or Veo — so the picker says where each choice can go, using the
// avatar's own rule (imageModelWorksWith), never a restated list.

export const COMPOSITE_DEFAULT_MODEL_ID = SEEDANCE_FACE_MODEL_ID;

/** The (i) on a model chip, on hover. Seedream's composites are the ones Seedance accepts (D290). */
export const COMPOSITE_MODEL_HINTS: Readonly<Record<string, string>> = {
  [SEEDANCE_FACE_MODEL_ID]: "Use this for generic UGC — its composite can go into Seedance.",
};

/** A composite is a UGC reference: vertical or wide, nothing else. */
export const COMPOSITE_ASPECT_RATIOS: readonly string[] = ["16:9", "9:16"];

/** The model a composite generates with: the operator's choice, else the default. */
export function resolveCompositeModelId(requested: string | undefined): string {
  return requested ?? COMPOSITE_DEFAULT_MODEL_ID;
}

/** With an avatar wired, which video models the composite's face will work with. Null without
 *  an avatar — nothing restricts a picture with no face in it. */
export function compositeModelNote(modelId: string, hasAvatar: boolean): string | null {
  if (!hasAvatar) return null;
  const worksWith = imageModelWorksWith(modelId);
  const line = `Works with ${listSentence([...worksWith])}`;
  return worksWith.includes("Seedance") ? `${line}.` : `${line} — not Seedance.`;
}

/** What the picker shows as selected: the stored model while Image Gen still lists it, else the
 *  default. The composite offers every image model Image Gen does. */
export function compositePickerModelId(stored: string | undefined): string {
  return stored && stored in imageGenClientModelMap ? stored : COMPOSITE_DEFAULT_MODEL_ID;
}

/** Params with the aspect ratio held to the composite's two; any other stored value becomes 9:16. */
export function clampCompositeParams(values: Record<string, unknown>): Record<string, unknown> {
  const ratio = values.aspect_ratio;
  return {
    ...values,
    aspect_ratio: typeof ratio === "string" && COMPOSITE_ASPECT_RATIOS.includes(ratio) ? ratio : "9:16",
  };
}
