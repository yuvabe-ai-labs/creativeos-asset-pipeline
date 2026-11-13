// The size and preview of an imported image (D483). sharp decodes every pixel, which can take far
// more memory than the file itself. On an import's small machine it therefore keeps no cache, uses
// one thread, refuses huge images and handles one image at a time.
import "server-only";
import sharp from "sharp";
import { IMPORT_PREVIEW_MAX_PIXELS, IMPORT_PREVIEW_PX } from "./constants";

// Process-wide: this module runs only inside the asset-import task's own process.
sharp.cache(false);
sharp.concurrency(1);

let queue: Promise<unknown> = Promise.resolve();

/** Runs sharp work one image at a time, so decoded images never pile up in memory. */
function oneAtATime<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work);
  queue = run.catch(() => undefined);
  return run;
}

const open = (body: Buffer) => sharp(body, { limitInputPixels: IMPORT_PREVIEW_MAX_PIXELS });

/** Displayed pixel size, or null when the bytes cannot be decoded. EXIF orientations 5–8 are
 *  rotated a quarter turn, so their stored width and height are swapped on screen. */
export function measureImage(body: Buffer): Promise<{ width: number; height: number } | null> {
  return oneAtATime(async () => {
    try {
      const { width, height, orientation } = await open(body).metadata();
      if (!width || !height) return null;
      return orientation && orientation >= 5 ? { width: height, height: width } : { width, height };
    } catch {
      return null;
    }
  });
}

/** A WebP no wider or taller than IMPORT_PREVIEW_PX, or null when the bytes cannot be decoded or
 *  the image is over IMPORT_PREVIEW_MAX_PIXELS. */
export function makeImagePreview(body: Buffer): Promise<Buffer | null> {
  return oneAtATime(async () => {
    try {
      return await open(body)
        .rotate() // honour EXIF orientation before the metadata is dropped
        .resize({ width: IMPORT_PREVIEW_PX, height: IMPORT_PREVIEW_PX, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();
    } catch {
      return null;
    }
  });
}
