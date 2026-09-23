import "server-only";
import { type ImageLimits, fitUrlForLimits } from "./provider-images";

/**
 * Kling's input-image limits, and the Kling-shaped view of the shared fitter.
 *
 * Why this exists: a real staging run (run_06gc6cum56gtdfhlvjfs5a3j01) burned 35 seconds and two
 * retries to die at the vendor with
 *
 *   Kling generation failed: Image aspect ratio is invalid
 *
 * on an ordinary connected still — a 414×2048 pack shot, ratio 0.202, under the 0.4 floor. The
 * message names no image, so the operator cannot even tell WHICH of five references to fix. Nothing
 * upstream constrains image shape (the uploader accepts any image), so the provider corrects the
 * shape itself, exactly as Seedance has since its own 2.62 incident.
 *
 * The limits are the vendor's (ref/multishot-refs/kling-omni-docs.md, contents[].type.first_frame /
 * last_frame / refer_image). The geometry pair is IDENTICAL to Seedance's, which is why the
 * correction lives in provider-images.ts rather than being written twice.
 *
 * `contents[].url` takes "URL or base64". Verified against the live endpoint before this shipped:
 * a base64 payload is decoded and measured with OR without the `data:image/...;base64,` prefix
 * (both forms returned this same aspect-ratio error for a deliberately out-of-range image, which
 * they could only do by decoding it). The prefixed form is what we send, matching Seedance.
 */
export const KLING_IMAGE_LIMITS: ImageLimits = {
  // "the aspect ratio of the image should be between 1:2.5 and 2.5:1".
  minAspect: 0.4,
  maxAspect: 2.5,
  // "The width and height dimensions of the image should not be less than 300px".
  minPx: 300,
  // Kling publishes no upper bound on dimensions — only the file-size cap below. Infinity rather
  // than a guessed number, so this never re-encodes an image the vendor would have accepted.
  maxPx: Number.POSITIVE_INFINITY,
  // "The size of the image file cannot exceed 50MB".
  maxBytes: 50 * 1024 * 1024,
  // The docs list .jpg/.jpeg/.png only, but the live endpoint decodes webp too — it answered the
  // aspect-ratio error (not a format error) for an out-of-range webp, and the pipeline's own
  // uploader accepts webp (IMG_EXTENSIONS in lib/kb/constants.ts), so most references arrive as
  // one. Listing it here keeps a merely-webp image on its URL instead of base64-inlining every
  // reference in a normal request. Same precedence rule as O1_VALID_DURATIONS in kling.ts: observed
  // runtime behaviour wins over the doc table. Anything we DO re-encode still comes out jpeg.
  formats: new Set(["jpeg", "png", "webp"]),
};

function fitUrl(url: string, use: "frame" | "reference", label: string): Promise<string> {
  return fitUrlForLimits(url, use, label, KLING_IMAGE_LIMITS, "Kling");
}

/** Exactly the images a Kling request carries, as buildKlingContents will emit them. */
type KlingImageSet = {
  startFrameUrl?: string;
  endFrameUrl?: string;
  referenceUrls: string[];
};

/**
 * The same image set, with every URL replaced by what Kling will accept.
 *
 * Takes the RESOLVED set rather than the raw VideoGenInput: by the time generateWithKling calls
 * this it has already dropped references the endpoint cannot carry (3.0 has no `refer_image`), and
 * fitting an image the request will not send would spend a download on nothing. Unlike Seedance's
 * frames-XOR-references split, the omni endpoints carry frames AND references together, so all
 * three are fitted in one pass.
 */
export async function fitKlingImages(images: KlingImageSet): Promise<KlingImageSet> {
  const [startFrameUrl, endFrameUrl, referenceUrls] = await Promise.all([
    images.startFrameUrl ? fitUrl(images.startFrameUrl, "frame", "start frame") : undefined,
    images.endFrameUrl ? fitUrl(images.endFrameUrl, "frame", "end frame") : undefined,
    Promise.all(
      images.referenceUrls.map((url, i) => fitUrl(url, "reference", `reference #${i + 1}`)),
    ),
  ]);
  return { startFrameUrl, endFrameUrl, referenceUrls };
}
