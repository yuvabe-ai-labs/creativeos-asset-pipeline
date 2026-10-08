import type { ScriptDoc, ScriptHeader } from "./schema";
import { formatSeconds, totalSeconds } from "./timeline";

// Shared by the library card, the script view and the gallery's Scripts tab.

export function reelLabel(reelNumber: number | null): string | null {
  return reelNumber === null ? null : `Reel ${String(reelNumber).padStart(2, "0")}`;
}

export function headerLine(header: ScriptHeader): string {
  return [header.format, header.region, header.postDate].filter((p) => p.trim()).join(" · ");
}

export function shotSummary(doc: ScriptDoc): string {
  const n = doc.shots.length;
  return `${n} shot${n === 1 ? "" : "s"} · ${formatSeconds(totalSeconds(doc.shots))}s`;
}
