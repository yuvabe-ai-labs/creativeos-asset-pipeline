import type { TraceableBrandKB } from "@/lib/kb/schema";
import { buildParseContext, KB_PARSE_SLICES } from "@/lib/kb/parse-context";
import type { Script } from "../schema";
import { printScript } from "../print";
import { groupByBeat, timeShots } from "../timeline";
import { reelLabel } from "../utils";
import type { CopilotAvatar } from "./schema";

// Spec 2 §4 — what the copilot knows without asking, as text for the system message (D333).

/** The brand KB, every slice, plus its free-text consistency notes read whole: for the demo the
 *  client's house spec is pasted there (spec 2 §4.1, answer 2c.1). Spec 3's plan replaces its own
 *  KB reader with this one at merge. */
export function renderKbText(kb: TraceableBrandKB | null): string {
  if (!kb) return "This client has no brand KB yet. Write from the person's description and the example scripts only, and say so.";
  const body = buildParseContext(kb, KB_PARSE_SLICES.map((s) => s.key));
  const house = kb.image_analysis?.brand_consistency_notes?.value?.trim();
  return [body, house ? `House rules (the brand KB's consistency notes, read whole):\n${house}` : ""].filter(Boolean).join("\n\n");
}

export type LibraryFormat = { format: string; beats: string[]; reels: string[] };

/** Only finished scripts teach the copilot: a script still at Generate (an unfinished draft, or the
 *  one being edited) is never used as a format or an example. */
const finished = (scripts: Script[]) => scripts.filter((s) => s.stage !== "generate");

/** The formats seen in the client's scripts (spec 2 §4.3), each with the beat sequence of its first
 *  script. Formats are the client's own words (D325). */
export function libraryFormats(scripts: Script[]): LibraryFormat[] {
  const byFormat = new Map<string, LibraryFormat>();
  for (const s of finished(scripts)) {
    const format = s.doc.header.format.trim();
    if (!format) continue;
    const label = reelLabel(s.doc.header.reelNumber) ?? s.doc.header.title;
    const found = byFormat.get(format.toLowerCase());
    if (found) found.reels.push(label);
    else byFormat.set(format.toLowerCase(), { format, beats: groupByBeat(timeShots(s.doc.shots)).map((g) => g.beat), reels: [label] });
  }
  return [...byFormat.values()];
}

/** Up to two scripts of the same format; with no match, one script of each format (up to three). */
export function pickExamples(scripts: Script[], format: string): Script[] {
  const f = format.trim().toLowerCase();
  const pool = finished(scripts);
  const same = f ? pool.filter((s) => s.doc.header.format.trim().toLowerCase() === f) : [];
  if (same.length > 0) return same.slice(0, 2);
  const seen = new Set<string>();
  return pool.filter((s) => {
    const k = s.doc.header.format.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 3);
}

export function renderLibrary(scripts: Script[], format: string): string {
  if (finished(scripts).length === 0) return "This client has no scripts yet. Take the format from the person's description and the house rules.";
  const formats = libraryFormats(scripts).map((f) => `- ${f.format}: ${f.beats.join(" › ")} (${f.reels.join(", ")})`).join("\n");
  const examples = pickExamples(scripts, format).map((s) => printScript(s.doc)).join("\n\n---\n\n");
  return `Formats seen in this client's scripts, with their beats:\n${formats}\n\nExample scripts in this client's layout (one table row per shot):\n\n${examples}`;
}

export function renderAvatars(avatars: CopilotAvatar[]): string {
  if (avatars.length === 0) return "The client has no saved avatars yet; describe every person in words.";
  return avatars.map((a) => `- ${a.name} (avatar id ${a.id}): ${a.story.trim() || "no description"}`).join("\n");
}

/** "The reel number is the slot the person named, else the next free one" (spec 2 §5). */
export function nextReelNumber(scripts: Script[]): number {
  return Math.max(0, ...scripts.map((s) => s.doc.header.reelNumber ?? 0)) + 1;
}
