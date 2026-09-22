import { describe, it, expect } from "vitest";
import { planCanvasLiveSync, type LiveSyncNode } from "./live-sync";

const node = (id: string, type: string, data: Record<string, unknown> = {}): LiveSyncNode => ({
  id,
  type,
  data,
});

describe("planCanvasLiveSync", () => {
  it("updates a stale badge (the D202 behaviour it already had)", () => {
    const patches = planCanvasLiveSync({
      nodes: [node("a", "image-gen", { approvalStatus: "pending" })],
      statuses: { a: "approved" },
      outputs: {},
      openFocusViewIds: [],
    });
    expect(patches).toEqual([{ id: "a", patch: { approvalStatus: "approved" } }]);
  });

  // BUG-002 — a designer's new version reached the badge but never the media, so a reviewer on
  // the same canvas saw the old image until they refreshed.
  it("swaps in another user's new media on a node this viewer is not editing", () => {
    const patches = planCanvasLiveSync({
      nodes: [node("a", "image-gen", { parsed: "old.png", approvalStatus: "pending" })],
      statuses: { a: "pending" },
      outputs: { a: "new.png" },
      openFocusViewIds: [],
    });
    expect(patches).toEqual([{ id: "a", patch: { parsed: "new.png" } }]);
  });

  it("does the same for a video node", () => {
    const patches = planCanvasLiveSync({
      nodes: [node("v", "video-gen", { parsed: "old.mp4" })],
      statuses: {},
      outputs: { v: "new.mp4" },
      openFocusViewIds: [],
    });
    expect(patches).toEqual([{ id: "v", patch: { parsed: "new.mp4" } }]);
  });

  // D19 — media must never change under a viewer mid-edit. Their open focus view refreshes itself
  // (useNodeVersionUpdates); only the canvas card is ours to update.
  it("leaves the media alone while this viewer has the node's focus view open", () => {
    const patches = planCanvasLiveSync({
      nodes: [node("a", "image-gen", { parsed: "old.png", approvalStatus: "pending" })],
      statuses: { a: "approved" },
      outputs: { a: "new.png" },
      openFocusViewIds: ["a"],
    });
    expect(patches).toEqual([{ id: "a", patch: { approvalStatus: "approved" } }]);
  });

  it("writes nothing when nothing changed, so autosave is not churned", () => {
    const patches = planCanvasLiveSync({
      nodes: [node("a", "image-gen", { parsed: "same.png", approvalStatus: "pending" })],
      statuses: { a: "pending" },
      outputs: { a: "same.png" },
      openFocusViewIds: [],
    });
    expect(patches).toEqual([]);
  });

  // A prompt node's `parsed` is text or a plan object the operator edits on the card; replacing
  // it live is a different decision from swapping a rendered asset.
  it("only swaps media on image-gen and video-gen nodes", () => {
    const patches = planCanvasLiveSync({
      nodes: [node("p", "prompt", { parsed: "old prompt" })],
      statuses: {},
      outputs: { p: "new prompt" },
      openFocusViewIds: [],
    });
    expect(patches).toEqual([]);
  });

  it("ignores a node with no output yet", () => {
    const patches = planCanvasLiveSync({
      nodes: [node("a", "image-gen", { parsed: "old.png" })],
      statuses: {},
      outputs: {},
      openFocusViewIds: [],
    });
    expect(patches).toEqual([]);
  });
});
