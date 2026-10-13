// D366 — what the image-generate Trigger.dev task is given. No `server-only`: the route builds it
// and the task (a separate build) reads it.

/** The image types the providers return; the route signs one upload for each. */
export const IMAGE_RESULT_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type ImageResultMime = (typeof IMAGE_RESULT_MIME_TYPES)[number];

/** The one type a painted edit mask may have: the client paints an alpha PNG. */
export const IMAGE_GEN_MASK_MIME = "image/png";
/** What the routes answer when a painted region arrives in any other type. */
export const MASK_NOT_PNG_MESSAGE = "The painted area couldn't be read. Please paint it again.";

/** A signed PUT the task uploads to, and the public URL the object then has. */
export type SignedImageUpload = { putUrl: string; url: string };
export type ImageResultUploads = Record<ImageResultMime, SignedImageUpload>;

export type ImageGenerateTaskPayload = {
  generationId: string;
  modelId: string;
  prompt: string;
  referenceUrls: string[];
  params: Record<string, unknown>;
  /** A painted edit region, already uploaded by the route. */
  maskUrl?: string;
  maskMime?: string;
  uploads: ImageResultUploads;
};
