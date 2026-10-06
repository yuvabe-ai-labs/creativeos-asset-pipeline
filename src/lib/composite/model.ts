import { SEEDANCE_FACE_MODEL_ID } from "@/lib/avatars/constants";

// D312 — which image model a composite is made with. A composite with an avatar in it is a new
// picture of that avatar's face, and Seedance accepts a face only from SEEDANCE_FACE_MODEL_ID
// (D290) — so while an avatar is wired the model is locked to it. Imported, never restated: if
// the avatar's face model changes, the composite follows.

export const COMPOSITE_DEFAULT_MODEL_ID = SEEDANCE_FACE_MODEL_ID;

export const COMPOSITE_MODEL_LOCK_REASON =
  "Made with Seedream so Seedance and Gemini Omni accept it.";

/** The model a composite must use, or null when the operator may choose. */
export function compositeModelLock(hasAvatar: boolean): string | null {
  return hasAvatar ? SEEDANCE_FACE_MODEL_ID : null;
}

/** The model a composite generates with: the lock, else the stored choice, else the default. */
export function resolveCompositeModelId(requested: string | undefined, hasAvatar: boolean): string {
  return compositeModelLock(hasAvatar) ?? requested ?? COMPOSITE_DEFAULT_MODEL_ID;
}
