import "server-only";
import sharp from "sharp";
import { uploadAvatarGenerated } from "@/lib/storage";
import { SHEET_ORDER } from "@/prompts/avatar-character";
import { figureCuts, viewCanvas } from "./sheet-layout";
import type { AvatarImage, AvatarViewId } from "./schema";

// The profile is read from a small copy: finding gaps needs columns, not detail.
const PROFILE_WIDTH = 512;
// Rows between these shares of the height: below the hair, above the feet, so a stray floor
// shadow cannot join two figures into one.
const BAND = [0.1, 0.85] as const;
// How far a pixel's colour is from the backdrop before it counts as figure (0–441).
const FIGURE_DISTANCE = 40;

type Rgb = { r: number; g: number; b: number };

/** The backdrop is the median colour of the sheet's top row and its two side columns. */
function backdrop(data: Buffer, width: number, height: number): Rgb {
  const at = (x: number, y: number) => (y * width + x) * 3;
  const samples: number[] = [];
  for (let x = 0; x < width; x++) samples.push(at(x, 0));
  for (let y = 0; y < height; y++) samples.push(at(0, y), at(width - 1, y));
  const median = (channel: number) => {
    const values = samples.map((i) => data[i + channel]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  };
  return { r: median(0), g: median(1), b: median(2) };
}

/** How much of each column, within the band, is figure rather than backdrop (0–1). */
function columnProfile(data: Buffer, width: number, height: number, bg: Rgb): number[] {
  const top = Math.floor(height * BAND[0]);
  const bottom = Math.ceil(height * BAND[1]);
  const profile = new Array<number>(width).fill(0);
  for (let y = top; y < bottom; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const d = Math.hypot(data[i] - bg.r, data[i + 1] - bg.g, data[i + 2] - bg.b);
      if (d > FIGURE_DISTANCE) profile[x] += 1;
    }
  }
  return profile.map((n) => n / Math.max(1, bottom - top));
}

/**
 * D395 — the one generated turnaround sheet cut into its four views: each figure is cut out at
 * the middle of the gaps either side of it and centred on a 3:4 canvas of the sheet's own
 * backdrop, so every view keeps the shape panels, review and readiness have used since D340.
 * The views are derived images (`untouched: false`); the sheet itself is kept as made.
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

  const small = await sharp(body).resize({ width: PROFILE_WIDTH }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const bg = backdrop(small.data, small.info.width, small.info.height);
  const scale = width / small.info.width;
  const cuts = figureCuts(columnProfile(small.data, small.info.width, small.info.height, bg))
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
          background: { ...bg, alpha: 1 },
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
