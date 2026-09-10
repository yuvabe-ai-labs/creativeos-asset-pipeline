import "server-only";
import sharp from "sharp";
import { logger } from "@trigger.dev/sdk/v3";
import type { VideoGenInput } from "../types";
import { describeFetchError } from "./fetch-error";

/**
 * Bring every image a Seedance request carries inside the vendor's input limits.
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
 * The contract is deliberately conservative:
 *  - A compliant image is sent as its URL, untouched. Re-encoding one that was already fine would
 *    only cost quality, and the vendor asks us not to base64 large files.
 *  - Only a non-compliant image is re-encoded, and it is sent inline as a data URL.
 *  - If the check itself cannot run (download or decode fails), the URL is passed through as-is.
 *    This step exists to remove a failure mode; it must never add one. The vendor then fetches the
 *    image itself and, if something really is wrong, says so in its own words.
 */
export const SEEDANCE_IMAGE_LIMITS = {
  minAspect: 0.4,
  maxAspect: 2.5,
  minPx: 300,
  maxPx: 6000,
  // "Single image must be less than 30 MB".
  maxBytes: 30 * 1024 * 1024,
  // heic/heif are listed as "1.5 pro and later", which includes 2.5.
  formats: new Set(["jpeg", "png", "webp", "bmp", "tiff", "gif", "heic", "heif"]),
} as const;

/**
 * Long edge for an image WE re-encode. Well inside maxPx, and it keeps each data URL around a
 * megabyte, so even the full 30 references stay far under the 64 MB request-body cap — the vendor's
 * own "do not use Base64 for large files" is the reason not to send a 6000px original inline.
 * An image that was merely too SMALL is upscaled only as far as minPx, never to this.
 */
const REENCODE_LONG_EDGE = 2048;
const JPEG_QUALITY = 90;

/** How an out-of-range aspect ratio is corrected — depends on what the image is FOR. */
export type SeedanceImageUse = "frame" | "reference";

type Dims = { width: number; height: number };

/**
 * Every way these dimensions/bytes/format break the vendor's limits, as readable reasons.
 * Empty means compliant. Pure, so the decision can be tested without encoding a single pixel.
 */
export function seedanceImageProblems(meta: {
  width: number;
  height: number;
  format: string | undefined;
  bytes: number;
}): string[] {
  const { minAspect, maxAspect, minPx, maxPx, maxBytes, formats } = SEEDANCE_IMAGE_LIMITS;
  const problems: string[] = [];
  const ratio = meta.width / meta.height;

  if (ratio < minAspect || ratio > maxAspect) {
    problems.push(`aspect ratio ${ratio.toFixed(2)} outside [${minAspect}, ${maxAspect}]`);
  }
  if (Math.min(meta.width, meta.height) < minPx) {
    problems.push(`${meta.width}×${meta.height} has a side under ${minPx}px`);
  }
  if (Math.max(meta.width, meta.height) > maxPx) {
    problems.push(`${meta.width}×${meta.height} has a side over ${maxPx}px`);
  }
  if (meta.bytes >= maxBytes) {
    problems.push(`${(meta.bytes / 1024 / 1024).toFixed(1)} MB is not under 30 MB`);
  }
  if (!meta.format || !formats.has(meta.format)) {
    problems.push(`format ${meta.format ?? "unknown"} is not accepted`);
  }
  return problems;
}

/**
 * The geometry of a re-encode: the source region to keep (a centred crop, for frames), the size to
 * scale that content to, and the padding around it (references only). Pure — all rounding lives
 * here so it can be tested against the limits directly.
 *
 * FRAMES are centre-cropped. A frame is the literal first or last picture of the video, so bars
 * would appear IN the video; and centre-crop is what the vendor itself does when a frame disagrees
 * with the output ratio, so this matches its own behaviour, just pulled inside the limit.
 *
 * REFERENCES are padded. A reference that breaks the ratio is typically a wide character sheet or
 * product lineup — the thing that matters is spread across the whole width, and a crop would cut
 * off the outer views. Padding keeps every pixel of it.
 */
export function planSeedanceReencode(
  source: Dims,
  use: SeedanceImageUse,
): { crop: { left: number; top: number; width: number; height: number }; content: Dims; canvas: Dims } {
  const { minAspect, maxAspect, minPx } = SEEDANCE_IMAGE_LIMITS;
  const { width: w, height: h } = source;
  const ratio = w / h;

  // Region of the source that is kept, and the (pre-scale) canvas it sits on.
  let crop = { left: 0, top: 0, width: w, height: h };
  let canvasW = w;
  let canvasH = h;

  if (ratio > maxAspect) {
    if (use === "frame") {
      const keepW = Math.floor(h * maxAspect);
      crop = { left: Math.floor((w - keepW) / 2), top: 0, width: keepW, height: h };
      canvasW = keepW;
    } else {
      canvasH = Math.ceil(w / maxAspect);
    }
  } else if (ratio < minAspect) {
    if (use === "frame") {
      const keepH = Math.floor(w / minAspect);
      crop = { left: 0, top: Math.floor((h - keepH) / 2), width: w, height: keepH };
      canvasH = keepH;
    } else {
      canvasW = Math.ceil(h * minAspect);
    }
  }

  // Scale: down to the re-encode long edge, or UP just enough to clear minPx. The two cannot
  // conflict — a legal ratio caps long/short at 2.5, so a 300px short side means at most 750px long.
  const longSide = Math.max(canvasW, canvasH);
  const shortSide = Math.min(canvasW, canvasH);
  let scale = Math.min(1, REENCODE_LONG_EDGE / longSide);
  if (shortSide * scale < minPx) scale = minPx / shortSide;

  let outW = Math.max(minPx, Math.round(canvasW * scale));
  let outH = Math.max(minPx, Math.round(canvasH * scale));
  // Rounding can nudge a ratio that sat exactly on a bound just past it; pull it back by trimming
  // the long side, which is always the side with room to spare.
  if (outW / outH > maxAspect) outW = Math.floor(outH * maxAspect);
  if (outW / outH < minAspect) outH = Math.floor(outW / minAspect);

  // The kept content, scaled the same way, never larger than the canvas it is centred on.
  const content = {
    width: Math.min(outW, Math.round(crop.width * scale)),
    height: Math.min(outH, Math.round(crop.height * scale)),
  };
  // A frame's content IS the canvas (no padding), so rounding must not leave a 1px sliver.
  if (use === "frame") {
    content.width = outW;
    content.height = outH;
  }

  return { crop, content, canvas: { width: outW, height: outH } };
}

/**
 * The mean colour of the edges a reference is about to be padded against, so the bars read as
 * more of the image's own background (typically the white of a character sheet) rather than as a
 * black letterbox the model might take for part of the look.
 */
async function edgeColour(
  upright: () => sharp.Sharp,
  source: Dims,
  axis: "top-bottom" | "left-right",
): Promise<{ r: number; g: number; b: number }> {
  const { width: w, height: h } = source;
  const t = Math.max(1, Math.round((axis === "top-bottom" ? h : w) * 0.02));
  const strips =
    axis === "top-bottom"
      ? [
          { left: 0, top: 0, width: w, height: t },
          { left: 0, top: h - t, width: w, height: t },
        ]
      : [
          { left: 0, top: 0, width: t, height: h },
          { left: w - t, top: 0, width: t, height: h },
        ];

  const sum = [0, 0, 0];
  let pixels = 0;
  for (const region of strips) {
    const { data, info } = await upright().extract(region).raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += info.channels) {
      sum[0] += data[i];
      sum[1] += data[i + 1];
      sum[2] += data[i + 2];
    }
    pixels += data.length / info.channels;
  }
  const [r, g, b] = sum.map((s) => Math.round(s / pixels));
  return { r, g, b };
}

export type SeedanceImageFit =
  | { kind: "keep" }
  | { kind: "reencoded"; dataUrl: string; problems: string[]; from: Dims; to: Dims; bytes: number };

/**
 * Check one image's bytes and, only if they break a limit, re-encode them into range.
 *
 * EXIF orientation 5–8 swaps the displayed axes, but it cannot change the VERDICT: the vendor's
 * bounds are symmetric (0.4 is exactly 1/2.5, and the px range applies to both sides), so whether
 * the vendor's decoder honours the tag or not, the answer is the same. It only matters for the
 * re-encode geometry, which works in displayed coordinates.
 */
export async function fitImageForSeedance(
  bytes: Buffer,
  use: SeedanceImageUse,
): Promise<SeedanceImageFit> {
  const meta = await sharp(bytes).metadata();
  if (!meta.width || !meta.height) return { kind: "keep" };

  const swaps = meta.orientation !== undefined && meta.orientation >= 5;
  const shown = swaps
    ? { width: meta.height, height: meta.width }
    : { width: meta.width, height: meta.height };

  const problems = seedanceImageProblems({ ...shown, format: meta.format, bytes: bytes.length });
  if (problems.length === 0) return { kind: "keep" };

  // Every pipeline starts from the ORIGINAL bytes rather than a materialised intermediate: an
  // intermediate `.toBuffer()` re-encodes in the source format, which would compress a JPEG twice.
  // `.rotate()` first bakes in the EXIF orientation, so the crop below is in displayed
  // coordinates; flattened onto white because JPEG has no alpha, and a transparent cut-out's
  // hidden RGB is often black — white is what it looked like on screen.
  const upright = () => sharp(bytes).rotate().flatten({ background: "#ffffff" });
  const plan = planSeedanceReencode(shown, use);

  let pipeline = upright()
    .extract(plan.crop)
    .resize({ width: plan.content.width, height: plan.content.height, fit: "fill" });

  const padX = plan.canvas.width - plan.content.width;
  const padY = plan.canvas.height - plan.content.height;
  if (padX > 0 || padY > 0) {
    const background = await edgeColour(upright, shown, padY > 0 ? "top-bottom" : "left-right");
    pipeline = pipeline.extend({
      top: Math.floor(padY / 2),
      bottom: Math.ceil(padY / 2),
      left: Math.floor(padX / 2),
      right: Math.ceil(padX / 2),
      background,
    });
  }

  const out = await pipeline.jpeg({ quality: JPEG_QUALITY }).toBuffer();
  return {
    kind: "reencoded",
    dataUrl: `data:image/jpeg;base64,${out.toString("base64")}`,
    problems,
    from: shown,
    to: plan.canvas,
    bytes: out.length,
  };
}

/** Resolve one URL to what should be sent for it: itself, or a re-encoded data URL. */
async function fitUrl(url: string, use: SeedanceImageUse, label: string): Promise<string> {
  let bytes: Buffer;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    bytes = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    logger.warn("Seedance image check skipped — could not download; sending the URL as-is", {
      image: label,
      url,
      error: describeFetchError(e),
    });
    return url;
  }

  try {
    const fit = await fitImageForSeedance(bytes, use);
    if (fit.kind === "keep") return url;
    logger.info("Seedance image re-encoded to fit vendor limits", {
      image: label,
      url,
      problems: fit.problems,
      from: fit.from,
      to: fit.to,
      how: use === "frame" ? "centre-cropped" : "padded",
      bytes: fit.bytes,
    });
    return fit.dataUrl;
  } catch (e) {
    logger.warn("Seedance image check skipped — could not decode; sending the URL as-is", {
      image: label,
      url,
      error: e instanceof Error ? e.message : String(e),
    });
    return url;
  }
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
