import { MODULES } from "./constants";
import type { KBFieldPatch } from "./field-patch";
import type { KBField, TraceableBrandKB } from "./schema";
import { getFieldPath } from "./utils";

// The review screen keeps two copies of the brand KB: the draft the person is editing and the copy
// last saved. These say what a save sends, and how both copies take in a KB that changed on the
// server meanwhile (the copilot filled a field, a teammate saved). Pure.

type Section = Record<string, KBField<unknown> | undefined>;
type Tree = Record<string, unknown>;

/** Where each tab's fields are stored: the six sections the build writes, and Image Analysis. */
const ALL_SECTIONS: string[][] = MODULES.map((m) => getFieldPath(m.key, "").slice(0, -1));
const DOCUMENT_SECTIONS = ALL_SECTIONS.filter((path) => path[0] !== "image_analysis");

function sectionAt(kb: TraceableBrandKB, path: string[]): Section {
  let node: unknown = kb;
  for (const key of path) node = node && typeof node === "object" ? (node as Tree)[key] : undefined;
  return node && typeof node === "object" ? (node as Section) : {};
}

function withSection(kb: TraceableBrandKB, path: string[], section: Section): TraceableBrandKB {
  const tree = kb as unknown as Tree;
  if (path.length === 1) return { ...tree, [path[0]]: section } as unknown as TraceableBrandKB;
  return { ...tree, [path[0]]: { ...(tree[path[0]] as Tree), [path[1]]: section } } as unknown as TraceableBrandKB;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** A short string that changes whenever any field of the six document sections changes. Image
 *  Analysis is left out: a background run rewrites it and the screen follows that on its own. */
export function kbRevision(kb: TraceableBrandKB): string {
  const text = JSON.stringify(DOCUMENT_SECTIONS.map((path) => sectionAt(kb, path)));
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return `${text.length}:${hash >>> 0}`;
}

/** One patch per field the person changed in the draft: every field, Image Analysis included, that
 *  differs from the saved copy. A patch carries the whole field as the draft has it, so a field the
 *  stored KB did not hold yet is written complete. Empty when nothing changed. */
export function changedFields(draft: TraceableBrandKB, saved: TraceableBrandKB): KBFieldPatch[] {
  const patches: KBFieldPatch[] = [];
  for (const path of ALL_SECTIONS) {
    const before = sectionAt(saved, path);
    for (const [key, field] of Object.entries(sectionAt(draft, path))) {
      if (!field || same(field, before[key])) continue;
      patches.push({
        path: [...path, key],
        patch: { value: field.value, status: field.status, confidence: field.confidence, evidence_type: field.evidence_type },
      });
    }
  }
  return patches;
}

/** After the server's copy changed. `saved` takes the server's document sections. `draft` takes
 *  them too, except the fields the person has changed and not yet saved, which stay as the person
 *  has them (and so still show as unsaved). Image Analysis is left alone in both. A dotted path in
 *  `take` is a field the copilot just wrote: its stored value replaces even an unsaved edit, so a
 *  later Save never writes the older draft back over it (D508, spec §3.2). */
export function adoptServerKb(
  draft: TraceableBrandKB, saved: TraceableBrandKB, server: TraceableBrandKB,
  take: ReadonlySet<string> = new Set(),
): { draft: TraceableBrandKB; saved: TraceableBrandKB } {
  let nextDraft = draft;
  let nextSaved = saved;
  for (const path of DOCUMENT_SECTIONS) {
    const mine = sectionAt(draft, path);
    const before = sectionAt(saved, path);
    const theirs = sectionAt(server, path);
    const merged: Section = { ...mine };
    for (const [key, field] of Object.entries(theirs)) {
      if (same(mine[key], before[key]) || take.has([...path, key].join("."))) merged[key] = field;
    }
    nextDraft = withSection(nextDraft, path, merged);
    nextSaved = withSection(nextSaved, path, theirs);
  }
  return { draft: nextDraft, saved: nextSaved };
}
