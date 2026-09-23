import "server-only";
import type { VideoGenInput } from "../types";
import {
  type ImageLimits,
  type ProviderImageFit,
  type ProviderImageUse,
  fitImageForLimits,
  fitUrlForLimits,
  imageProblems,
  planImageReencode,
} from "./provider-images";

/**
 * Seedance's input-image limits, and the Seedance-shaped view of the shared fitter.
 *
 * Why this exists: a real generation died at task creation with
 *
 *   400 — Error while downloading image, error: expected the aspect ratio to be between 0.40 and
 *   2.50, but received image with aspect ratio: 2.62 instead
 *
 * The image was an ordinary connected still. Nothing upstream constrains image shape, and the
 * operator has no way to know the rule before paying the round trip — so the provider fixes the
 * shape itself rather than bouncing the request back.
 *
 * The limits are the vendor's (ref/byteplus-docs/Create a video generation task.md, content →
 * image_url). `image_url.url` accepts a URL OR a base64 data URL (`data:image/<fmt>;base64,…`,
 * format lowercase), which is what lets a re-encoded image travel without being hosted anywhere.
 *
 * The correction itself — which images are re-encoded, and the crop/pad geometry — lives in
 * provider-images.ts, shared with Kling, whose geometry limits are identical. See that file for
 * the contract.
 */
export const SEEDANCE_IMAGE_LIMITS: ImageLimits = {
  minAspect: 0.4,
  maxAspect: 2.5,
  minPx: 300,
  maxPx: 6000,
  // "Single image must be less than 30 MB".
  maxBytes: 30 * 1024 * 1024,
  // heic/heif are listed as "1.5 pro and later", which includes 2.5.
  formats: new Set(["jpeg", "png", "webp", "bmp", "tiff", "gif", "heic", "heif"]),
};

export type SeedanceImageUse = ProviderImageUse;
export type SeedanceImageFit = ProviderImageFit;

export function seedanceImageProblems(meta: {
  width: number;
  height: number;
  format: string | undefined;
  bytes: number;
}): string[] {
  return imageProblems(meta, SEEDANCE_IMAGE_LIMITS);
}

export function planSeedanceReencode(
  source: { width: number; height: number },
  use: SeedanceImageUse,
) {
  return planImageReencode(source, use, SEEDANCE_IMAGE_LIMITS);
}

export function fitImageForSeedance(
  bytes: Buffer,
  use: SeedanceImageUse,
): Promise<SeedanceImageFit> {
  return fitImageForLimits(bytes, use, SEEDANCE_IMAGE_LIMITS);
}

function fitUrl(url: string, use: SeedanceImageUse, label: string): Promise<string> {
  return fitUrlForLimits(url, use, label, SEEDANCE_IMAGE_LIMITS, "Seedance");
}

/**
 * The input with every image URL replaced by what Seedance will accept. Only images that are
 * actually sent are touched — the same frames-XOR-references split as buildSeedanceContent, and the
 * same reference cap — so no bandwidth is spent checking an image the request will drop.
 */
export async function fitSeedanceImages(
  input: VideoGenInput,
  maxRefs: number,
): Promise<VideoGenInput> {
  if (input.startFrameUrl) {
    const [startFrameUrl, endFrameUrl] = await Promise.all([
      fitUrl(input.startFrameUrl, "frame", "start frame"),
      input.endFrameUrl ? fitUrl(input.endFrameUrl, "frame", "end frame") : undefined,
    ]);
    return { ...input, startFrameUrl, endFrameUrl };
  }

  const referenceUrls = await Promise.all(
    (input.referenceUrls ?? [])
      .slice(0, maxRefs)
      .map((url, i) => fitUrl(url, "reference", `reference #${i + 1}`)),
  );
  return { ...input, referenceUrls };
}
