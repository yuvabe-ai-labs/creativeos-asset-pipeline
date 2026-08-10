import { describe, it, expect } from "vitest";
import { edgeRowToFlow, flowEdgeToRow, type EdgeRow } from "./edge-rows";

describe("flowEdgeToRow", () => {
  it("writes the DB's column names, not React Flow's field names", () => {
    // The columns are source_node_id / target_node_id, and both are NOT NULL. Emitting
    // `source` / `target` — React Flow's names — makes the insert fail outright, which is
    // what broke batch duplicate for any selection containing an edge.
    const row = flowEdgeToRow("canvas-1", { id: "e1", source: "a", target: "b" });
    expect(row.source_node_id).toBe("a");
    expect(row.target_node_id).toBe("b");
    expect(row).not.toHaveProperty("source");
    expect(row).not.toHaveProperty("target");
  });

  it("carries the id and canvas", () => {
    const row = flowEdgeToRow("canvas-1", { id: "e1", source: "a", target: "b" });
    expect(row.id).toBe("e1");
    expect(row.canvas_id).toBe("canvas-1");
  });

  it("normalises absent handles to null, which is what the column stores", () => {
    const row = flowEdgeToRow("canvas-1", { id: "e1", source: "a", target: "b" });
    expect(row.source_handle).toBeNull();
    expect(row.target_handle).toBeNull();
  });

  it("keeps handles when the edge has them", () => {
    const row = flowEdgeToRow("canvas-1", {
      id: "e1", source: "a", target: "b", sourceHandle: "out", targetHandle: "in",
    });
    expect(row.source_handle).toBe("out");
    expect(row.target_handle).toBe("in");
  });
});

describe("edgeRowToFlow", () => {
  const row: EdgeRow = {
    id: "e1",
    canvas_id: "canvas-1",
    source_node_id: "a",
    target_node_id: "b",
    source_handle: null,
    target_handle: null,
  };

  it("reads the DB's column names back into React Flow's field names", () => {
    const edge = edgeRowToFlow(row);
    expect(edge).toMatchObject({ id: "e1", source: "a", target: "b" });
  });

  it("turns null handles into undefined, since React Flow treats null as a real handle id", () => {
    const edge = edgeRowToFlow(row);
    expect(edge.sourceHandle).toBeUndefined();
    expect(edge.targetHandle).toBeUndefined();
  });

  it("round-trips an edge unchanged", () => {
    const original = { id: "e1", source: "a", target: "b", sourceHandle: "out", targetHandle: "in" };
    expect(edgeRowToFlow(flowEdgeToRow("canvas-1", original))).toEqual(original);
  });
});
