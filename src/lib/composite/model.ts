import { SEEDANCE_FACE_MODEL_ID } from "@/lib/avatars/constants";
import { imageModelWorksWith, listSentence } from "@/lib/avatars/generation";

// D312 — which image model a composite is made with. Seedream by default: a composite with an
// avatar in it is a new picture of that face, and Seedance takes a face only from
// SEEDANCE_FACE_MODEL_ID (D290). But the operator may choose another (Nano Banana) when the clip
// is going to Gemini Omni, Kling or Veo — so the picker says where each choice can go, using the
// avatar's own rule (imageModelWorksWith), never a restated list.

export const COMPOSITE_DEFAULT_MODEL_ID = SEEDANCE_FACE_MODEL_ID;

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
