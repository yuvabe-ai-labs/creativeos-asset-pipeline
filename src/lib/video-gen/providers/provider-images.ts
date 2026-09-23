import "server-only";
import sharp from "sharp";
import { logger } from "@trigger.dev/sdk/v3";
import { describeFetchError } from "./fetch-error";

/**
 * Bring an image inside a video vendor's input limits, for any vendor that publishes them.
 *
 * Extracted from seedance-images.ts when Kling hit the SAME failure from the other direction: a
 * real staging run died at the vendor with
 *
 *   Kling generation failed: Image aspect ratio is invalid
 *
 * on a 414×2048 reference (ratio 0.202, below the 0.4 floor) — the mirror image of the 2.62 that
 * made this exist for Seedance. The two vendors' geometry limits are IDENTICAL (aspect 0.4–2.5,
 * both sides ≥300px), so the correction is one body parameterised by limits rather than two copies
 * that would drift; only the byte cap, the accepted formats and the max dimension differ.
 *
 * The contract is deliberately conservative, unchanged from the Seedance original:
 *  - A compliant image is sent as its URL, untouched. Re-encoding one that was already fine would
 *    only cost quality, and the vendors ask us not to base64 large files.
 *  - Only a non-compliant image is re-encoded, and it is sent inline as a data URL.
 *  - If the check itself cannot run (download or decode fails), the URL is passed through as-is.
 *    This step exists to remove a failure mode; it must never add one. The vendor then fetches the
 *    image itself and, if something really is wrong, says so in its own words.
 */
export type ImageLimits = {
  minAspect: number;
  maxAspect: number;
  minPx: number;
  /** Vendors that publish no upper bound on dimensions pass Infinity — the check then never fires. */
  maxPx: number;
  maxBytes: number;
  formats: ReadonlySet<string>;
};

/**
 * Long edge for an image WE re-encode. Well inside every vendor's max, and it keeps each data URL
 * around a megabyte, so even a full reference set stays far under any request-body cap — the
 * vendors' own "do not use Base64 for large files" is the reason not to send a 6000px original
 * inline. An image that was merely too SMALL is upscaled only as far as minPx, never to this.
 */
const REENCODE_LONG_EDGE = 2048;
const JPEG_QUALITY = 90;

/** How an out-of-range aspect ratio is corrected — depends on what the image is FOR. */
export type ProviderImageUse = "frame" | "reference";

type Dims = { width: number; height: number };

/**
 * Every way these dimensions/bytes/format break the vendor's limits, as readable reasons.
 * Empty means compliant. Pure, so the decision can be tested without encoding a single pixel.
 */
export function imageProblems(
  meta: { width: number; height: number; format: string | undefined; bytes: number },
  limits: ImageLimits,
): string[] {
  const { minAspect, maxAspect, minPx, maxPx, maxBytes, formats } = limits;
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
    problems.push(
      `${(meta.bytes / 1024 / 1024).toFixed(1)} MB is not under ${maxBytes / 1024 / 1024} MB`,
    );
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
 * would appear IN the video; and centre-crop is what the vendors themselves do when a frame
 * disagrees with the output ratio, so this matches their own behaviour, just pulled inside the
 * limit.
 *
 * REFERENCES are padded. A reference that breaks the ratio is typically a wide character sheet, a
 * product lineup or a tall pack shot — the thing that matters is spread across the whole frame, and
 * a crop would cut off the outer views. Padding keeps every pixel of it.
 */
export function planImageReencode(
  source: Dims,
  use: ProviderImageUse,
  limits: ImageLimits,
): { crop: { left: number; top: number; width: number; height: number }; content: Dims; canvas: Dims } {
  const { minAspect, maxAspect, minPx } = limits;
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

export type ProviderImageFit =
  | { kind: "keep" }
  | { kind: "reencoded"; dataUrl: string; problems: string[]; from: Dims; to: Dims; bytes: number };

/**
 * Check one image's bytes and, only if they break a limit, re-encode them into range.
 *
 * EXIF orientation 5–8 swaps the displayed axes, but it cannot change the VERDICT: the vendors'
 * bounds are symmetric (0.4 is exactly 1/2.5, and the px range applies to both sides), so whether
 * the vendor's decoder honours the tag or not, the answer is the same. It only matters for the
 * re-encode geometry, which works in displayed coordinates.
 */
export async function fitImageForLimits(
  bytes: Buffer,
  use: ProviderImageUse,
  limits: ImageLimits,
): Promise<ProviderImageFit> {
  const meta = await sharp(bytes).metadata();
  if (!meta.width || !meta.height) return { kind: "keep" };

  const swaps = meta.orientation !== undefined && meta.orientation >= 5;
  const shown = swaps
    ? { width: meta.height, height: meta.width }
    : { width: meta.width, height: meta.height };

  const problems = imageProblems(
    { ...shown, format: meta.format, bytes: bytes.length },
    limits,
  );
  if (problems.length === 0) return { kind: "keep" };

  // Every pipeline starts from the ORIGINAL bytes rather than a materialised intermediate: an
  // intermediate `.toBuffer()` re-encodes in the source format, which would compress a JPEG twice.
  // `.rotate()` first bakes in the EXIF orientation, so the crop below is in displayed
  // coordinates; flattened onto white because JPEG has no alpha, and a transparent cut-out's
  // hidden RGB is often black — white is what it looked like on screen.
  const upright = () => sharp(bytes).rotate().flatten({ background: "#ffffff" });
  const plan = planImageReencode(shown, use, limits);

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

/**
 * Resolve one URL to what should be sent for it: itself, or a re-encoded data URL.
 *
 * `vendor` only names the vendor in the log line. Each provider assembles its OWN set of calls to
 * this, because which images a request actually carries is a vendor rule (Seedance sends frames XOR
 * references; Kling's omni endpoint sends both together) and a shared assembler would have to take
 * a flag for it.
 */
export async function fitUrlForLimits(
  url: string,
  use: ProviderImageUse,
  label: string,
  limits: ImageLimits,
  vendor: string,
): Promise<string> {
  let bytes: Buffer;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    bytes = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    logger.warn(`${vendor} image check skipped — could not download; sending the URL as-is`, {
      image: label,
      url,
      error: describeFetchError(e),
    });
    return url;
  }

  try {
    const fit = await fitImageForLimits(bytes, use, limits);
    if (fit.kind === "keep") return url;
    logger.info(`${vendor} image re-encoded to fit vendor limits`, {
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
    logger.warn(`${vendor} image check skipped — could not decode; sending the URL as-is`, {
      image: label,
      url,
      error: e instanceof Error ? e.message : String(e),
    });
    return url;
  }
}
