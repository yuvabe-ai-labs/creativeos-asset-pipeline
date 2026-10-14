import { describe, it, expect } from "vitest";
import { createCanvasStore } from "./canvas-store";

describe("scriptParsing", () => {
  it("marks a Script node as parsing and clears it, without touching node data", () => {
    const store = createCanvasStore([], []);
    store.getState().setScriptParsing("n1", true);
    expect(store.getState().scriptParsing).toEqual({ n1: true });
    store.getState().setScriptParsing("n1", false);
    expect(store.getState().scriptParsing).toEqual({});
    expect(store.getState().nodes).toEqual([]);
  });
});
