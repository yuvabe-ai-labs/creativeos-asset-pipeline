import { describe, expect, it } from "vitest";
import { createEditorStore } from "../editor-store";
import type { EditDoc } from "../types";
import { DEFAULT_CAPTION_STYLE } from "../caption-style";

const doc: EditDoc = {
  v: 2, captionStyle: DEFAULT_CAPTION_STYLE, shape: "9:16", sources: [],
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

describe("history (D400)", () => {
  const make = () => createEditorStore({ doc, sources: [] });
  const shape = (s: ReturnType<typeof make>, v: "9:16" | "16:9") => s.getState().apply((d) => (d.shape === v ? d : { ...d, shape: v }));

  it("undoes and redoes one apply at a time", () => {
    const s = make();
    shape(s, "16:9");
    s.getState().undo();
    expect(s.getState().doc.shape).toBe("9:16");
    expect(s.getState().doc).toBe(doc);
    s.getState().redo();
    expect(s.getState().doc.shape).toBe("16:9");
  });

  it("records nothing for a no-op and clears redo on a new edit", () => {
    const s = make();
    shape(s, "9:16");
    expect(s.getState().past).toHaveLength(0);
    shape(s, "16:9");
    s.getState().undo();
    shape(s, "16:9");
    expect(s.getState().future).toHaveLength(0);
  });

  it("records a whole drag as one step", () => {
    const s = make();
    s.getState().begin();
    shape(s, "16:9");
    shape(s, "9:16");
    shape(s, "16:9");
    s.getState().commit();
    expect(s.getState().past).toHaveLength(1);
    s.getState().undo();
    expect(s.getState().doc.shape).toBe("9:16");
  });

  it("a drag that ends where it started records nothing", () => {
    const s = make();
    s.getState().begin();
    s.getState().commit();
    expect(s.getState().past).toHaveLength(0);
  });

  it("keeps at most 100 steps and does nothing while read-only", () => {
    const s = make();
    for (let i = 0; i < 120; i++) shape(s, i % 2 ? "9:16" : "16:9");
    expect(s.getState().past).toHaveLength(100);
    s.getState().setEditable(false);
    s.getState().undo();
    expect(s.getState().past).toHaveLength(100);
  });
});

describe("adopting a server edit (D406)", () => {
  it("replaces the doc and sources and clears history", () => {
    const s = createEditorStore({ doc, sources: [] });
    s.getState().apply((d) => ({ ...d, shape: "16:9" }));
    const next = { ...doc, pieces: [] };
    s.getState().replaceAll(next, []);
    expect(s.getState().doc).toBe(next);
    expect(s.getState().past).toHaveLength(0);
    s.getState().undo();
    expect(s.getState().doc).toBe(next);
  });
});
