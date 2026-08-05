import type { IconSource, ShapeKind, TextLayer } from "./types";

/**
 * The single `dataTransfer` key every draggable tile in the left panels writes and the stage's
 * drop handler reads. One key rather than one per panel: the stage then has a single
 * `dragOver`/`drop` pair to maintain, and adding a new kind of draggable element is a new
 * variant of the union below rather than another branch in the stage.
 */
export const ELEMENT_DRAG_TYPE = "application/x-post-element";

/** What was picked up. Deliberately describes the ELEMENT, not its geometry — where it lands
 *  and how big it is are the drop site's business (post-focus-view.tsx's `addElement`), so a
 *  dropped star is identical to a clicked one. */
export type ElementDragPayload =
  | { kind: "shape"; shape: ShapeKind }
  | { kind: "icon"; src: IconSource }
  | { kind: "text"; preset: Partial<TextLayer> }
  | { kind: "image"; url: string }
  | { kind: "connected"; nodeId: string };

const KINDS = ["shape", "icon", "text", "image", "connected"] as const;

export function serializeElementDrag(payload: ElementDragPayload): string {
  return JSON.stringify(payload);
}

/**
 * Parses a drag payload, returning null for anything unrecognisable.
 *
 * Never throws: `dataTransfer` is an OS-level channel that any application — or an older tab
 * of this one — can write to, so a drop carrying junk must be ignored rather than take the
 * editor down with a parse error.
 */
export function parseElementDrag(raw: string): ElementDragPayload | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const kind = (parsed as { kind?: unknown }).kind;
  if (typeof kind !== "string" || !KINDS.includes(kind as (typeof KINDS)[number])) return null;
  return parsed as ElementDragPayload;
}
