import { describe, it, expect } from "vitest";
import {
  canConnect,
  nodeRowToFlow,
  flowToPersisted,
  VALID_CONNECTIONS,
  type NodeWithActive,
  type AppNode,
  type ImageGenNodeData,
} from "./canvas-nodes";

function row(overrides: Partial<NodeWithActive> = {}): NodeWithActive {
  return {
    id: "n1",
    canvas_id: "c1",
    type: "script",
    position: { x: 0, y: 0 },
    data: { title: "Reel" },
    active_version_id: null,
    created_at: "",
    updated_at: "",
    active: null,
    ...overrides,
  };
}

describe("nodeRowToFlow", () => {
  it("hydrates data.parsed from the active version output", () => {
    const node = nodeRowToFlow(
      row({ active: { output: { title: "Parsed reel" } } }),
    );
    expect((node.data as { parsed?: unknown }).parsed).toEqual({ title: "Parsed reel" });
    expect((node.data as { title?: string }).title).toBe("Reel"); // own content kept
  });

  it("drops any stale persisted data.parsed when there is no active output", () => {
    const node = nodeRowToFlow(
      row({ data: { title: "Reel", parsed: { title: "STALE" } }, active: null }),
    );
    expect((node.data as { parsed?: unknown }).parsed).toBeUndefined();
    expect((node.data as { title?: string }).title).toBe("Reel");
  });

  it("migrates legacy 'brief' type to 'script'", () => {
    const node = nodeRowToFlow(row({ type: "brief" }));
    expect(node.type).toBe("script");
  });

  it("surfaces the active version's approval_status onto data (D29)", () => {
    const node = nodeRowToFlow(
      row({ active: { output: "http://img", approval_status: "approved" } }),
    );
    expect((node.data as { approvalStatus?: string }).approvalStatus).toBe("approved");
  });
});

describe("flowToPersisted", () => {
  it("never persists the derived parsed field", () => {
    const persisted = flowToPersisted({
      id: "n1",
      type: "script",
      position: { x: 1, y: 2 },
      data: { title: "Reel", source: "raw", parsed: { title: "x" } },
    } as never);
    expect(persisted.data).toEqual({ title: "Reel", source: "raw" });
    expect("parsed" in persisted.data).toBe(false);
  });

  it("never persists the derived approvalStatus field (D29)", () => {
    // approvalStatus is hydrated from the active version for the on-canvas badge
    // (like `parsed`); once the focus view writes it into the store to refresh the
    // badge, autosave must NOT leak that display-only copy back into the row.
    const persisted = flowToPersisted({
      id: "n1",
      type: "prompt",
      position: { x: 1, y: 2 },
      data: { title: "Shot", approvalStatus: "approved" },
    } as never);
    expect("approvalStatus" in persisted.data).toBe(false);
    expect(persisted.data).toEqual({ title: "Shot" });
  });
});

describe("VALID_CONNECTIONS — draw node", () => {
  it("allows draw → prompt and draw → image-gen", () => {
    expect(VALID_CONNECTIONS.draw).toContain("prompt");
    expect(VALID_CONNECTIONS.draw).toContain("image-gen");
  });

  it("does not allow draw → script", () => {
    expect(VALID_CONNECTIONS.draw ?? []).not.toContain("script");
  });
});

describe("flowToPersisted (image-gen edit fields)", () => {
  it("persists editInstruction and editIntent, drops parsed", () => {
    // Typed as ImageGenNodeData (no cast) so `tsc --noEmit` gates the new fields.
    const data: ImageGenNodeData = {
      title: "Hero",
      editInstruction: "remove the cup",
      editIntent: "remove",
      parsed: "https://example.com/x.png",
    };
    const node = {
      id: "img1",
      type: "image-gen",
      position: { x: 0, y: 0 },
      data,
    } as AppNode;

    const persisted = flowToPersisted(node);
    expect((persisted.data as { editInstruction?: string }).editInstruction).toBe("remove the cup");
    expect((persisted.data as { editIntent?: string }).editIntent).toBe("remove");
    expect((persisted.data as { parsed?: unknown }).parsed).toBeUndefined();
  });

  it("persists editReferenceNodeIds and the modify intent, drops parsed", () => {
    const data: ImageGenNodeData = {
      title: "Hero",
      editIntent: "modify",
      editReferenceNodeIds: ["file-1", "file-2"],
      parsed: "https://example.com/x.png",
    };
    const node = {
      id: "img1",
      type: "image-gen",
      position: { x: 0, y: 0 },
      data,
    } as AppNode;

    const persisted = flowToPersisted(node);
    const d = persisted.data as {
      editReferenceNodeIds?: string[];
      editIntent?: string;
      parsed?: unknown;
    };
    expect(d.editReferenceNodeIds).toEqual(["file-1", "file-2"]);
    expect(d.editIntent).toBe("modify");
    expect(d.parsed).toBeUndefined();
  });
});

describe("canConnect", () => {
  it("allows a documented pair (draw → prompt)", () => {
    expect(canConnect("draw", "prompt")).toBe(true);
  });
  it("rejects an undocumented pair (draw → script)", () => {
    expect(canConnect("draw", "script")).toBe(false);
  });
  it("rejects an unknown source type", () => {
    expect(canConnect("nonsense", "prompt")).toBe(false);
  });
  it("is directional (video-prompt → video-gen only, not reverse)", () => {
    expect(canConnect("video-prompt", "video-gen")).toBe(true);
    expect(canConnect("video-gen", "video-prompt")).toBe(false);
  });
  it("accepts image-producing sources into a post", () => {
    expect(canConnect("image-gen", "post")).toBe(true);
    expect(canConnect("file", "post")).toBe(true);
    expect(canConnect("draw", "post")).toBe(true);
  });
  it("a post has no valid downstream targets", () => {
    expect(canConnect("post", "prompt")).toBe(false);
    expect(canConnect("post", "image-gen")).toBe(false);
  });
});
