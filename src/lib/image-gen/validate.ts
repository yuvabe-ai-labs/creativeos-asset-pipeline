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
  | "maxImageEdgePx"
  | "maxAspectRatio"
  | "minDimensionMultiple"
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

  // Rules 3–5: per-image dimension checks — at most one violation per image
  for (const img of images) {
    if (img.imageWidth === undefined || img.imageHeight === undefined) continue;

    // Rule 3: max edge
    if (model.maxImageEdgePx !== undefined) {
      const maxEdge = Math.max(img.imageWidth, img.imageHeight);
      if (maxEdge > model.maxImageEdgePx) {
        violations.push({
          url: img.url,
          filename: img.filename,
          message: `${label(img)} is ${img.imageWidth} × ${img.imageHeight} px — max edge is ${model.maxImageEdgePx} px for ${model.label}.`,
        });
        continue;
      }
    }

    // Rule 4: aspect ratio
    if (model.maxAspectRatio !== undefined) {
      const long = Math.max(img.imageWidth, img.imageHeight);
      const short = Math.min(img.imageWidth, img.imageHeight);
      if (short > 0) {
        const ratio = long / short;
        if (ratio > model.maxAspectRatio) {
          violations.push({
            url: img.url,
            filename: img.filename,
            message: `${label(img)} is ${ratio.toFixed(2)}:1 — ${model.label} requires a max ${model.maxAspectRatio}:1 ratio between sides.`,
          });
          continue;
        }
      }
    }

    // Rule 5: dimension multiple
    if (model.minDimensionMultiple !== undefined) {
      const m = model.minDimensionMultiple;
      if (img.imageWidth % m !== 0) {
        violations.push({
          url: img.url,
          filename: img.filename,
          message: `${label(img)} width ${img.imageWidth} px is not a multiple of ${m} — resize to ${Math.round(img.imageWidth / m) * m} px.`,
        });
      } else if (img.imageHeight % m !== 0) {
        violations.push({
          url: img.url,
          filename: img.filename,
          message: `${label(img)} height ${img.imageHeight} px is not a multiple of ${m} — resize to ${Math.round(img.imageHeight / m) * m} px.`,
        });
      }
    }
  }

  if (violations.length > 0) return { ok: false, violations };
  return { ok: true };
}
