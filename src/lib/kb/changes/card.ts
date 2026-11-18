import type { ChangeCard, ChangeField } from "@/lib/journey/thread/schema";
import { reviewFields } from "@/lib/journey/kb-copilot/review";
import type { KBFieldPatch } from "@/lib/kb/field-patch";
import type { TraceableBrandKB } from "@/lib/kb/schema";

// The rules of a change card (brand KB spec §2.4, D505), apart from where it is stored: which
// proposals make it onto a card, what approving it writes, and what a refusal leaves behind. Pure.

/** One value the copilot would put in one field, and where it came from. */
export type Proposal = { path: string; value: unknown; from: string; docId: string | null };

const normal = (value: unknown): unknown => {
  if (value === null || value === undefined) return [];
  if (typeof value === "string") return value.trim() === "" ? [] : value.trim();
  if (Array.isArray(value)) return value.map((v) => (typeof v === "string" ? v.trim() : v)).filter((v) => v !== "").map(String).sort();
  return value;
};

/** Whether two field values say the same thing: list order, surrounding spaces and empty forms
 *  (null, "", []) do not count as a difference. */
export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(normal(a)) === JSON.stringify(normal(b));
}

const refusalKey = (docId: string, path: string) => `${docId}|${path}`;

/** A pending card from what the copilot would change, or null when nothing is left to propose:
 *  a field that is not one of the reviewed fields, a value equal to what is there, a change refused
 *  before from the same document, and a second proposal for the same field are all left out. */
export function buildChangeCard(input: { versionId: string; current: TraceableBrandKB; proposals: Proposal[]; refused: Set<string> }): ChangeCard | null {
  const known = new Map(reviewFields(input.current).map((f) => [f.path, f]));
  const fields: ChangeField[] = [];
  for (const p of input.proposals) {
    const field = known.get(p.path);
    if (!field || fields.some((f) => f.path === p.path)) continue;
    if (p.docId && input.refused.has(refusalKey(p.docId, p.path))) continue;
    if (sameValue(field.value, p.value)) continue;
    fields.push({ path: p.path, label: field.title, before: field.value, after: p.value, from: p.from, docId: p.docId });
  }
  return fields.length > 0 ? { kind: "change", versionId: input.versionId, status: "pending", fields, decision: null } : null;
}

/** The fields on a card whose stored value is no longer what the card showed as "before": they
 *  were changed by hand (or by another card) after it was made. */
export function outOfDatePaths(card: ChangeCard, currentValues: Record<string, unknown>): string[] {
  return card.fields.filter((f) => !sameValue(currentValues[f.path], f.before)).map((f) => f.path);
}

/** What approving a card writes. Nothing when the KB it was made against is no longer the active
 *  one; never a field changed by hand since; never a path the card does not hold. */
export function decideChange(
  card: ChangeCard,
  input: { keep: string[]; currentValues: Record<string, unknown>; activeVersionId: string | null },
): { kind: "stale" } | { kind: "apply"; patches: KBFieldPatch[]; kept: string[]; outOfDate: string[] } {
  if (input.activeVersionId !== card.versionId) return { kind: "stale" };
  const changed = new Set(outOfDatePaths(card, input.currentValues));
  const chosen = card.fields.filter((f) => input.keep.includes(f.path));
  const kept = chosen.filter((f) => !changed.has(f.path));
  return {
    kind: "apply",
    kept: kept.map((f) => f.path),
    outOfDate: chosen.filter((f) => changed.has(f.path)).map((f) => f.path),
    patches: kept.map((f) => ({
      path: f.path.split("."),
      patch: { value: f.after as KBFieldPatch["patch"]["value"], status: "approved", evidence_type: "explicit", confidence: "high" },
    })),
  };
}

/** What a person has turned down from a document, as `${docId}|${path}`: every field of a discarded
 *  card, and each field dropped from an approved one. A change asked for in the chat is never
 *  remembered: asking again means it. A field left because it was changed by hand was not refused. */
export function refusedKeys(cards: ChangeCard[]): Set<string> {
  const out = new Set<string>();
  for (const card of cards) {
    if (card.status !== "discarded" && card.status !== "applied") continue;
    const kept = new Set(card.decision?.kept ?? []);
    const outOfDate = new Set(card.decision?.outOfDate ?? []);
    for (const f of card.fields) {
      if (!f.docId || kept.has(f.path) || outOfDate.has(f.path)) continue;
      out.add(refusalKey(f.docId, f.path));
    }
  }
  return out;
}
