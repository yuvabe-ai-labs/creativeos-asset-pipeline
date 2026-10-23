import { describe, expect, it } from "vitest";
import { canDuplicateNode } from "@/lib/canvas-nodes";
import {
  addNodeRefusal, CONNECT_WHILE_GENERATING, CONNECT_WITHOUT_TAKE, editorConnectRefusal, ONE_EDITOR_PER_CANVAS,
} from "../rules";

const dub = { language: "hi-IN", original: "https://s/o.mp4", dubbed: "https://s/d.mp4", dubbedAudio: "https://s/d.wav", lipSynced: null };

describe("one Editor per canvas", () => {
  it("refuses a second Editor", () => {
    expect(addNodeRefusal("editor", [{ type: "editor" }])).toBe(ONE_EDITOR_PER_CANVAS);
    expect(addNodeRefusal("editor", [{ type: "prompt" }])).toBeNull();
    expect(addNodeRefusal("prompt", [{ type: "editor" }])).toBeNull();
  });

  it("never duplicates an Editor or the KB", () => {
    expect(canDuplicateNode("editor")).toBe(false);
    expect(canDuplicateNode("kb")).toBe(false);
    expect(canDuplicateNode("video-gen")).toBe(true);
  });
});

describe("connecting to the Editor", () => {
  it("refuses a clip that is still generating", () => {
    expect(editorConnectRefusal({ type: "video-gen", data: { parsed: "https://s/a.mp4" } }, "editor", true)).toBe(CONNECT_WHILE_GENERATING);
  });
  it("refuses a Video Gen with no finished take", () => {
    expect(editorConnectRefusal({ type: "video-gen", data: {} }, "editor", false)).toBe(CONNECT_WITHOUT_TAKE);
  });
  it("refuses a Dubbing node with no dub", () => {
    expect(editorConnectRefusal({ type: "dubbing", data: { parsed: { nope: 1 } } }, "editor", false)).toBe(CONNECT_WITHOUT_TAKE);
  });
  it("accepts a finished take", () => {
    expect(editorConnectRefusal({ type: "video-gen", data: { parsed: "https://s/a.mp4" } }, "editor", false)).toBeNull();
    expect(editorConnectRefusal({ type: "dubbing", data: { parsed: dub } }, "editor", false)).toBeNull();
  });
  it("says nothing about other targets", () => {
    expect(editorConnectRefusal({ type: "video-gen", data: {} }, "dubbing", true)).toBeNull();
  });
});
