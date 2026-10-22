import "server-only";
import sharp from "sharp";
import { uploadAvatarGenerated } from "@/lib/storage";
import { SHEET_ORDER } from "@/prompts/avatar-character";
import { gapCuts, viewCanvas } from "./sheet-layout";
import type { AvatarImage, AvatarViewId } from "./schema";

// The profile is read from a small copy: finding gaps needs columns, not detail.
const PROFILE_WIDTH = 512;
// Rows between these shares of the height: below the hair, above the feet, so a stray floor
// shadow cannot join two figures into one.
const BAND = [0.1, 0.85] as const;

/** How much fine detail each column has within the band: the mean step in grey to the next
 *  pixel down and across. A smooth backdrop is near zero whatever its shade. */
function textureProfile(grey: Buffer, width: number, height: number): number[] {
  const top = Math.max(1, Math.floor(height * BAND[0]));
  const bottom = Math.ceil(height * BAND[1]);
  const at = (x: number, y: number) => grey[y * width + x];
  const profile: number[] = [];
  for (let x = 0; x < width; x++) {
    const next = Math.min(width - 1, x + 1);
    let sum = 0;
    for (let y = top; y < bottom; y++) {
      sum += Math.abs(at(x, y) - at(x, y - 1)) + Math.abs(at(next, y) - at(x, y));
    }
    profile.push(sum / Math.max(1, bottom - top));
  }
  return profile;
}

/**
 * D395 — the one generated turnaround sheet cut into its four views: each cut sits in the
 * smoothest stretch of backdrop between two figures, and each view is centred on a 3:4 canvas
 * padded by repeating its own edge (so a gradient backdrop shows no seam). Every view keeps the
 * shape panels, review and readiness have used since D340. The views are derived images
 * (`untouched: false`); the sheet itself is kept as made.
 */
export async function cutSheetIntoViews(args: {
  clientId: string;
  avatarId: string;
  sheet: AvatarImage;
}): Promise<Record<AvatarViewId, AvatarImage>> {
  const res = await fetch(args.sheet.url);
  if (!res.ok) throw new Error(`Could not read the sheet (${res.status}).`);
  const body = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(body).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error("The sheet has no size.");

  const small = await sharp(body).resize({ width: PROFILE_WIDTH }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const scale = width / small.info.width;
  const cuts = gapCuts(textureProfile(small.data, small.info.width, small.info.height))
    .map(([a, b]) => [Math.round(a * scale), Math.min(width, Math.round(b * scale))] as const);

  const source = args.sheet.source;
  const views = await Promise.all(
    SHEET_ORDER.map(async (view, i) => {
      const [left, right] = cuts[i];
      const canvas = viewCanvas(right - left, height);
      const png = await sharp(body)
        .extract({ left, top: 0, width: right - left, height })
        .extend({
          left: canvas.left,
          right: canvas.width - (right - left) - canvas.left,
          top: canvas.top,
          bottom: canvas.height - height - canvas.top,
          extendWith: "copy",
        })
        .png()
        .toBuffer();
      const { url } = await uploadAvatarGenerated({
        clientId: args.clientId, avatarId: args.avatarId, slot: "sheet", name: `view-${view}`,
        ext: "png", body: png, contentType: "image/png",
      });
      const image: AvatarImage = {
        url,
        width: canvas.width,
        height: canvas.height,
        sizeBytes: png.length,
        source: source.kind === "generated"
          ? { ...source, prompt: `The ${view} view, cut from the turnaround sheet.`, untouched: false }
          : source,
      };
      return [view, image] as const;
    }),
  );
  return Object.fromEntries(views) as Record<AvatarViewId, AvatarImage>;
}
