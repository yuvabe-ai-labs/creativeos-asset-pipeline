// The export dialog's words (Export artboard), from what the export task reports.
import { formatBytes } from "@/lib/kb/utils";
import type { ExportSummary } from "./export-run";
import { PACKAGE_ZIP_NAME } from "./package";
import { formatTime } from "./timeline";

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "a, b and c" */
function listOf(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function exportChecklist(summary: ExportSummary, bytes: number): string[] {
  const collected = [
    count(summary.clips, "clip"),
    ...(summary.lipSynced ? [count(summary.lipSynced, "lip-synced video")] : []),
    ...(summary.dubs ? [count(summary.dubs, "dub")] : []),
  ];
  const wrote = [
    "the sequence",
    ...(summary.captions ? [count(summary.captions, "caption")] : []),
    ...(summary.fonts ? [summary.fonts === 1 ? "the font file" : "the font files"] : []),
  ];
  return [`Collected ${listOf(collected)}`, `Wrote ${listOf(wrote)}`, `Packaged ${PACKAGE_ZIP_NAME} · ${formatBytes(bytes)}`];
}

export function exportSubtitle(title: string, summary: ExportSummary, pieces: number): string {
  return `${title} · ${count(pieces, "piece")} · ${formatTime(summary.durationSeconds)} · ${summary.shape} · ${Math.round(summary.fps * 100) / 100} fps`;
}
