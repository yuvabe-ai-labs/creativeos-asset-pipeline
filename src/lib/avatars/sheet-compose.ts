import "server-only";
import sharp from "sharp";
import { uploadAvatarGenerated } from "@/lib/storage";
import { AVATAR_VIEWS } from "./constants";
import { stripLayout } from "./sheet-layout";
import type { AvatarImage, AvatarViewId } from "./schema";

const STRIP_HEIGHT = 1024;
const GAP = 24;
// The views' own light-grey backdrop, so the gaps read as part of one sheet.
const BACKGROUND = { r: 238, g: 238, b: 238, alpha: 1 };

/**
 * D339 — the four views side by side as one image, stored as the avatar's `sheet`. Everything
 * that already sends the sheet as one reference (D308: video, Composite, mentions) keeps
 * working, now with four views in it. The views themselves stay untouched; this strip is a
 * derived image, so its source says `untouched: false`.
 */
export async function composeSheetStrip(args: {
  clientId: string;
  avatarId: string;
  views: Record<AvatarViewId, AvatarImage>;
}): Promise<AvatarImage> {
  const buffers = await Promise.all(
    AVATAR_VIEWS.map(async (view) => {
      const res = await fetch(args.views[view].url);
      if (!res.ok) throw new Error(`Could not read the ${view} view (${res.status}).`);
      return Buffer.from(await res.arrayBuffer());
    }),
  );
  const sizes = await Promise.all(
    buffers.map(async (b) => {
      const meta = await sharp(b).metadata();
      return { width: meta.width ?? 768, height: meta.height ?? 1024 };
    }),
  );
  const layout = stripLayout(sizes, STRIP_HEIGHT, GAP);
  const tiles = await Promise.all(
    buffers.map((b, i) =>
      sharp(b).resize({ width: layout.widths[i], height: STRIP_HEIGHT, fit: "fill" }).png().toBuffer(),
    ),
  );
  const body = await sharp({
    create: { width: layout.width, height: layout.height, channels: 4, background: BACKGROUND },
  })
    .composite(tiles.map((input, i) => ({ input, left: layout.lefts[i], top: 0 })))
    .png()
    .toBuffer();

  const { url } = await uploadAvatarGenerated({
    clientId: args.clientId, avatarId: args.avatarId, slot: "sheet", name: "strip",
    ext: "png", body, contentType: "image/png",
  });
  const front = args.views.front.source;
  return {
    url,
    width: layout.width,
    height: layout.height,
    sizeBytes: body.length,
    source: {
      kind: "generated",
      modelId: front.kind === "generated" ? front.modelId : "",
      mode: "edit",
      prompt: "The four views (front, left, right, back) side by side.",
      generatedAt: new Date().toISOString(),
      generationId: front.kind === "generated" ? front.generationId : "",
      untouched: false,
    },
  };
}
