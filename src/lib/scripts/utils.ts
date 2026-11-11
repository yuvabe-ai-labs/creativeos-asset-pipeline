import type { ScriptDoc, ScriptHeader } from "./schema";
import { formatSeconds, totalSeconds } from "./timeline";

// Shared by the library card, the script view and the gallery's Scripts tab.

export function reelLabel(reelNumber: number | null): string | null {
  return reelNumber === null ? null : `Reel ${String(reelNumber).padStart(2, "0")}`;
}

export function headerLine(header: ScriptHeader): string {
  return [header.format, header.region, header.postDate].filter((p) => p.trim()).join(" · ");
}

/** D465 — the shots a location or product is in, in reel order ("S3, S4"); "" when none. */
export function shotsUsing(doc: ScriptDoc, ref: { productId: string } | { locationId: string }): string {
  return doc.shots
    .map((s, i) => ("productId" in ref ? s.products.includes(ref.productId) : s.location === ref.locationId) ? `S${i + 1}` : null)
    .filter(Boolean)
    .join(", ");
}

export function shotSummary(doc: ScriptDoc): string {
  const n = doc.shots.length;
  return `${n} shot${n === 1 ? "" : "s"} · ${formatSeconds(totalSeconds(doc.shots))}s`;
}

/** A shot's spoken line in curly quotes. The copilot sometimes writes the quotes into the line
 *  itself, so any already there are taken off first rather than doubled. */
export function spokenLine(vo: string): string {
  return `“${vo.trim().replace(/^["“”']+|["“”']+$/g, "").trim()}”`;
}
