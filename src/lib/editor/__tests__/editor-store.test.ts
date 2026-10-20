import { describe, expect, it } from "vitest";
import { createEditorStore } from "../editor-store";
import type { EditDoc } from "../types";

const doc: EditDoc = {
  v: 1, shape: "9:16", sources: [],
  pieces: [{ id: "p1", sourceNodeId: "a", in: 0, out: 2, picture: "original", sound: "original" }],
  captions: [],
};

describe("editor store", () => {
  it("applies an edit", () => {
    const store = createEditorStore({ doc, sources: [] });
    store.getState().apply((d) => ({ ...d, shape: "16:9" }));
    expect(store.getState().doc.shape).toBe("16:9");
  });

  it("apply with a no-op keeps the same doc", () => {
    const store = createEditorStore({ doc, sources: [] });
    let notified = 0;
    store.subscribe(() => notified++);
    store.getState().apply((d) => d);
    expect(store.getState().doc).toBe(doc);
    expect(notified).toBe(0);
  });

  it("read-only ignores apply", () => {
    const store = createEditorStore({ doc, sources: [] });
    store.getState().setEditable(false);
    store.getState().apply((d) => ({ ...d, shape: "16:9" }));
    expect(store.getState().doc).toBe(doc);
  });

  it("select replaces the selection, and clears it when its item is gone", () => {
    const store = createEditorStore({ doc, sources: [] });
    store.getState().select({ kind: "piece", id: "p1" });
    expect(store.getState().selection).toEqual({ kind: "piece", id: "p1" });
    store.getState().select({ kind: "caption", id: "c9" });
    expect(store.getState().selection).toEqual({ kind: "caption", id: "c9" });
    store.getState().apply((d) => ({ ...d, captions: [] , pieces: [] }));
    expect(store.getState().selection).toBeNull();
  });
});
