// D384 — every node card shows its media whole, at the media's own shape. One rule at two scales:
// output nodes (generated media) and input tiles (references). See the spec's tier table.

export type MediaTier = "output" | "input";

export const MEDIA_TIERS: Record<
  MediaTier,
  { minCard: number; maxCard: number; cap: number; hardCap: number; inset: number }
> = {
  // Media sits inside the card's px-3 body: 24px padding + 2px of border.
  output: { minCard: 280, maxCard: 480, cap: 500, hardCap: 600, inset: 26 },
  // Media runs edge to edge under the header: only the 2px of border.
  input: { minCard: 176, maxCard: 280, cap: 300, hardCap: 360, inset: 2 },
};

export type MediaBox = { cardWidth: number; mediaWidth: number; mediaHeight: number; letterboxed: boolean };
export type MediaSize = { width: number; height: number };

const DEFAULT_RATIO = 16 / 9;

/** "9:16" → 0.5625. Anything that is not two positive numbers is null ("auto", "", undefined). */
export function parseAspectRatio(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)\s*$/.exec(value);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return w > 0 && h > 0 ? w / h : null;
}

export function ratioOf(width?: number | null, height?: number | null): number | null {
  return width && height && width > 0 && height > 0 ? width / height : null;
}

/** The card and media size for a ratio. Landscape hits the max width; portrait gets narrower. */
export function nodeMediaBox(ratio: number, tier: MediaTier): MediaBox {
  const t = MEDIA_TIERS[tier];
  const mediaWidth = Math.round(Math.min(t.maxCard - t.inset, Math.max(t.minCard - t.inset, t.cap * ratio)));
  const natural = mediaWidth / ratio;
  const letterboxed = natural > t.hardCap;
  return {
    cardWidth: mediaWidth + t.inset,
    mediaWidth,
    mediaHeight: Math.round(letterboxed ? t.hardCap : natural),
    letterboxed,
  };
}

export function resolveMediaRatio(
  measured: MediaSize | null,
  saved: { width?: number; height?: number },
  fallback: number | null,
): number {
  return ratioOf(measured?.width, measured?.height) ?? ratioOf(saved.width, saved.height) ?? fallback ?? DEFAULT_RATIO;
}

/** The node-data patch to save, or null when nothing changed or this viewer may not write (D33). */
export function mediaSizeToSave(
  saved: { width?: number; height?: number },
  measured: MediaSize,
  editable: boolean,
): { mediaWidth: number; mediaHeight: number } | null {
  if (!editable || measured.width <= 0 || measured.height <= 0) return null;
  if (saved.width === measured.width && saved.height === measured.height) return null;
  return { mediaWidth: measured.width, mediaHeight: measured.height };
}
