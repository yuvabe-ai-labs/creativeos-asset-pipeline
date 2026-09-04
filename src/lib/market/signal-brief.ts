import { DEFAULT_SIGNAL_MODE, SIGNAL_MODES, type SignalMode } from "./constants";
import type { SignalWithItems } from "@/lib/db/signals";

// Validate a mode from a request body; anything unrecognised is the safe default.
export function normalizeSignalMode(input: unknown): SignalMode {
  return (SIGNAL_MODES as readonly string[]).includes(input as string)
    ? (input as SignalMode)
    : DEFAULT_SIGNAL_MODE;
}

// Validate an id list from a request body: strings only, deduped, order kept.
export function normalizeSignalIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const v of input) {
    if (typeof v === "string" && v && !out.includes(v)) out.push(v);
  }
  return out;
}

// Keep only signals the client actually owns, in the designer's order. Unknown
// ids drop silently — a signal deleted after being attached must not break parse.
export function selectSignalsByIds(
  signals: SignalWithItems[],
  ids: string[],
): SignalWithItems[] {
  const byId = new Map(signals.map((s) => [s.id, s]));
  return ids
    .map((id) => byId.get(id))
    .filter((s): s is SignalWithItems => s != null);
}

// One brief per signal: name + tags, the description (the interpretation written
// at grouping), and the non-empty per-reference notes (D186's "MR's voice").
export function buildSignalBrief(signals: SignalWithItems[]): string {
  return signals
    .map((s) => {
      const tags = s.tags.length ? `  [tags: ${s.tags.join(", ")}]` : "";
      const lines = [`Market signal: ${s.name}${tags}`];
      if (s.description.trim()) lines.push(s.description.trim());
      const notes = s.items
        .map((it) => it.note?.trim())
        .filter((n): n is string => !!n);
      if (notes.length) {
        lines.push("Evidence notes:", ...notes.map((n) => `- ${n}`));
      }
      return lines.join("\n");
    })
    .join("\n\n");
}
