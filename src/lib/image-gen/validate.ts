import type { MediaGenModelSpec } from "./types";

export type RefImageMeta = {
  url: string;
  filename?: string;
  fileSizeBytes?: number;
  imageWidth?: number;
  imageHeight?: number;
};

export type ValidationViolation = {
  url: string;
  filename?: string;
  message: string;
};

export type ValidationResult =
  | { ok: true }
  | { ok: false; violations: ValidationViolation[] };

type ModelLimits = Pick<
  MediaGenModelSpec,
  | "label"
  | "maxReferenceSizeBytes"
  | "maxTotalReferenceSizeBytes"
>;

function mb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function label(img: RefImageMeta): string {
  return img.filename ? `"${img.filename}"` : "A reference image";
}

export function validateReferenceImages(
  images: RefImageMeta[],
  model: ModelLimits,
): ValidationResult {
  const violations: ValidationViolation[] = [];

  // Rule 1: per-image size (OpenAI)
  if (model.maxReferenceSizeBytes > 0) {
    for (const img of images) {
      if (img.fileSizeBytes === undefined) continue;
      if (img.fileSizeBytes > model.maxReferenceSizeBytes) {
        violations.push({
          url: img.url,
          filename: img.filename,
          message: `${label(img)} is ${mb(img.fileSizeBytes)} — ${model.label} allows ${mb(model.maxReferenceSizeBytes)} per image.`,
        });
      }
    }
  }

  // Rule 2: aggregate size (Gemini)
  if (model.maxTotalReferenceSizeBytes !== undefined) {
    const known = images.filter((i) => i.fileSizeBytes !== undefined);
    if (known.length > 0) {
      const total = known.reduce((sum, i) => sum + (i.fileSizeBytes ?? 0), 0);
      if (total > model.maxTotalReferenceSizeBytes) {
        violations.push({
          url: images[0].url,
          message: `${images.length} reference image${images.length > 1 ? "s" : ""} total ${mb(total)} — ${model.label} allows ${mb(model.maxTotalReferenceSizeBytes)} combined. Remove one or use smaller images.`,
        });
      }
    }
  }

  if (violations.length > 0) return { ok: false, violations };
  return { ok: true };
}
