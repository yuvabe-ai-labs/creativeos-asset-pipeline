// The editor page's working copy of the edit (D390). Every change goes through apply() with a pure
// function from captions.ts / timeline.ts / pieces.ts; a function that returns the same doc changes
// nothing (performance rule 4), and a read-only session can't change it at all. The playhead lives
// in the playback hook, not here, so a playing reel doesn't re-render the panels every frame.
import { createStore, type StoreApi } from "zustand/vanilla";
import type { EditDoc, SourceView } from "./types";

export type Selection = { kind: "piece"; id: string } | { kind: "caption"; id: string } | null;

export type EditorStoreState = {
  doc: EditDoc;
  sources: SourceView[];
  editable: boolean;
  selection: Selection;
  apply(fn: (doc: EditDoc) => EditDoc): void;
  select(selection: Selection): void;
  setEditable(editable: boolean): void;
};

const stillThere = (doc: EditDoc, s: Selection): Selection => {
  if (!s) return null;
  const found = s.kind === "piece" ? doc.pieces.some((p) => p.id === s.id) : doc.captions.some((c) => c.id === s.id);
  return found ? s : null;
};

export function createEditorStore(init: { doc: EditDoc; sources: SourceView[] }): StoreApi<EditorStoreState> {
  return createStore<EditorStoreState>((set, get) => ({
    doc: init.doc,
    sources: init.sources,
    editable: true,
    selection: null,
    apply: (fn) => {
      const { doc, editable, selection } = get();
      if (!editable) return;
      const next = fn(doc);
      if (next === doc) return;
      set({ doc: next, selection: stillThere(next, selection) });
    },
    select: (selection) => {
      if (get().selection === selection) return;
      set({ selection });
    },
    setEditable: (editable) => {
      if (get().editable !== editable) set({ editable });
    },
  }));
}
