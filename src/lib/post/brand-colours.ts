/**
 * Hex codes are matched with a word boundary on BOTH sides so `#12345` yields nothing
 * rather than silently truncating to `#1234` → `#123`. A wrong colour presented
 * confidently is worse than no swatch.
 */
const HEX = /#([0-9a-f]{6}|[0-9a-f]{3})\b/i;

function expand(hex: string): string {
  const body = hex.slice(1).toLowerCase();
  if (body.length === 3) {
    return `#${body[0]}${body[0]}${body[1]}${body[1]}${body[2]}${body[2]}`;
  }
  return `#${body}`;
}

/**
 * Pull the usable hex codes out of the KB's prose colour strings (D132).
 *
 * The KB's `colour_palette_primary` / `_secondary` are model-extracted descriptions —
 * "turmeric gold #C8A000", "off-white" — so a palette entry may carry a code, or may not.
 * Order is preserved because the KB's own ordering is meaningful (primary first). Output
 * is lowercase 6-digit, matching how layer colours are stored, so the panel can tell which
 * swatch is currently applied.
 */
export function extractHexes(entries: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of entries) {
    // One colour per entry: a second code in the same string is commentary, not a
    // separate palette member.
    const match = HEX.exec(entry);
    if (!match) continue;
    const hex = expand(match[0]);
    if (seen.has(hex)) continue;
    seen.add(hex);
    out.push(hex);
  }
  return out;
}
