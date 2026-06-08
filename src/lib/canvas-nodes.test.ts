import { describe, it, expect } from "vitest";
import { nodeRowToFlow, flowToPersisted, type NodeWithActive } from "./canvas-nodes";

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
});
