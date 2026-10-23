// The editor page's working copy of the edit (D391). Every change goes through apply() with a pure
// function from captions.ts / timeline.ts / pieces.ts; a function that returns the same doc changes
// nothing (performance rule 4), and a read-only session can't change it at all. The playhead lives
// in the playback hook, not here, so a playing reel doesn't re-render the panels every frame.
// D400 — undo/redo: each apply is one step; a drag (begin…commit) is one step for the whole drag.
import { createStore, type StoreApi } from "zustand/vanilla";
import type { EditDoc, SourceView } from "./types";

export type Selection = { kind: "piece"; id: string } | { kind: "caption"; id: string } | null;

const HISTORY_LIMIT = 100;

export type EditorStoreState = {
  doc: EditDoc;
  sources: SourceView[];
  editable: boolean;
  selection: Selection;
  /** Earlier docs, oldest first. */
  past: EditDoc[];
  future: EditDoc[];
  apply(fn: (doc: EditDoc) => EditDoc): void;
  undo(): void;
  redo(): void;
  /** A drag starts: its applies become one step at commit(). */
  begin(): void;
  commit(): void;
  select(selection: Selection): void;
  setEditable(editable: boolean): void;
  /** Fresh sources from the server (a dub landed, D406). */
  setSources(sources: SourceView[]): void;
  /** Adopt an edit the server rewrote after a canvas change (D406). Undo can't cross it. */
  replaceAll(doc: EditDoc, sources: SourceView[]): void;
};

const stillThere = (doc: EditDoc, s: Selection): Selection => {
  if (!s) return null;
  const found = s.kind === "piece" ? doc.pieces.some((p) => p.id === s.id) : doc.captions.some((c) => c.id === s.id);
  return found ? s : null;
};

const push = (past: EditDoc[], doc: EditDoc) => [...past, doc].slice(-HISTORY_LIMIT);

export function createEditorStore(init: { doc: EditDoc; sources: SourceView[] }): StoreApi<EditorStoreState> {
  let dragFrom: EditDoc | null = null;
  return createStore<EditorStoreState>((set, get) => ({
    doc: init.doc,
    sources: init.sources,
    editable: true,
    selection: null,
    past: [],
    future: [],
    apply: (fn) => {
      const { doc, editable, selection, past } = get();
      if (!editable) return;
      const next = fn(doc);
      if (next === doc) return;
      if (dragFrom) set({ doc: next, selection: stillThere(next, selection) });
      else set({ doc: next, selection: stillThere(next, selection), past: push(past, doc), future: [] });
    },
    undo: () => {
      const { past, future, doc, editable, selection } = get();
      if (!editable || past.length === 0) return;
      const prev = past[past.length - 1];
      set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], selection: stillThere(prev, selection) });
    },
    redo: () => {
      const { past, future, doc, editable, selection } = get();
      if (!editable || future.length === 0) return;
      const next = future[0];
      set({ doc: next, past: push(past, doc), future: future.slice(1), selection: stillThere(next, selection) });
    },
    begin: () => {
      if (!dragFrom) dragFrom = get().doc;
    },
    commit: () => {
      const from = dragFrom;
      dragFrom = null;
      if (from && from !== get().doc) set({ past: push(get().past, from), future: [] });
    },
    select: (selection) => {
      if (get().selection === selection) return;
      set({ selection });
    },
    setEditable: (editable) => {
      if (get().editable !== editable) set({ editable });
    },
    setSources: (sources) => set({ sources }),
    replaceAll: (doc, sources) => {
      dragFrom = null;
      set({ doc, sources, past: [], future: [], selection: stillThere(doc, get().selection) });
    },
  }));
}
