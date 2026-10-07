// One image → one card (D312).
import "server-only";
import sharp from "sharp";
import { ImageCardSchema, type ImageCard } from "./card-schema";
import { IMAGE_CARD_MAX_PX } from "./constants";
import { generateStructured } from "./gemini";
import { imageCardPrompt } from "@/prompts/image-card";

/**
 * The image as a JPEG no larger than IMAGE_CARD_MAX_PX on its longest side. Re-encoding also turns
 * an SVG or GIF (which Gemini does not read) into something it does, and keeps a 4 MB upload from
 * costing more than a small one — the model reads at medium resolution either way.
 */
async function prepare(url: string, fetchImpl: typeof fetch): Promise<string> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`image download failed: HTTP ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  const jpeg = await sharp(body, { animated: false })
    .rotate()
    .resize({ width: IMAGE_CARD_MAX_PX, height: IMAGE_CARD_MAX_PX, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" }) // transparent logos read against white, not black
    .jpeg({ quality: 82 })
    .toBuffer();
  return jpeg.toString("base64");
}

/** Reads one image. Prefers the small preview made at import when there is one. */
export async function readImageCard(
  image: { storage_url: string; thumbnail_url: string | null },
  fetchImpl: typeof fetch = fetch,
): Promise<ImageCard> {
  const data = await prepare(image.thumbnail_url ?? image.storage_url, fetchImpl);
  return generateStructured({
    model: imageCardPrompt.model,
    system: imageCardPrompt.system,
    parts: [{ inlineData: { mimeType: "image/jpeg", data } }, { text: "Describe this brand image as a card." }],
    schema: ImageCardSchema,
  });
}
