import type { ScriptDoc } from "../schema";

// Piece 5.1 §3.7 (D515) — which product or location a picture attached in the chat is for, decided
// in the browser before it uploads, by code: the item the person pressed "Attach a picture" on, else
// the one item the message names, else the only item still without a picture; otherwise ask. Targets
// are "product:{id}" and "location:{id}", the board's own ids for them (D508).

export type PictureTarget = { target: string } | { ask: { id: string; name: string }[] } | { none: true };

type Item = { target: string; name: string; hasPicture: boolean };

function items(doc: ScriptDoc): Item[] {
  return [
    ...doc.products.map((p) => ({ target: `product:${p.id}`, name: p.name, hasPicture: p.images.length > 0 })),
    ...doc.locations.map((l) => ({ target: `location:${l.id}`, name: l.name, hasPicture: l.image !== null })),
  ];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The name as a whole word or phrase, its leading "the"/"a" optional. Letters outside ASCII (café)
 *  count as letters, so the match never stops in the middle of a word. */
function names(text: string, name: string): boolean {
  const core = name.trim().replace(/^(the|a|an)\s+/i, "");
  if (!core) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escape(core)}(?=$|[^\\p{L}\\p{N}])`, "iu").test(text);
}

export function pictureTarget(doc: ScriptDoc, text: string, preset: string | null): PictureTarget {
  const all = items(doc);
  if (all.length === 0) return { none: true };
  if (preset && all.some((i) => i.target === preset)) return { target: preset };
  const named = all.filter((i) => names(text, i.name));
  if (named.length === 1) return { target: named[0].target };
  const missing = all.filter((i) => !i.hasPicture);
  if (missing.length === 1) return { target: missing[0].target };
  return { ask: all.map((i) => ({ id: i.target, name: i.name })) };
}

/** The picture an item now has: a location's, or a product's newest. */
export function pictureUrl(doc: ScriptDoc, target: string): string | null {
  const [kind, id] = splitTarget(target);
  if (kind === "location") return doc.locations.find((l) => l.id === id)?.image?.url ?? null;
  if (kind === "product") return doc.products.find((p) => p.id === id)?.images.at(-1)?.url ?? null;
  return null;
}

export function targetName(doc: ScriptDoc, target: string): string | null {
  return items(doc).find((i) => i.target === target)?.name ?? null;
}

export function splitTarget(target: string): ["product" | "location" | null, string] {
  const at = target.indexOf(":");
  const kind = target.slice(0, at);
  return [kind === "product" || kind === "location" ? kind : null, target.slice(at + 1)];
}
