import { describe, it, expect } from "vitest";
import { createCanvasStore } from "./canvas-store";
import type { AppNode } from "./canvas-nodes";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const nodes: AppNode[] = [
  { id: "a", type: "text", position: { x: 0, y: 0 }, data: {} },
  { id: "b", type: "prompt", position: { x: 0, y: 0 }, data: { title: "" } },
] as AppNode[];

describe("onConnect", () => {
  it("assigns a UUID id to the new edge (the DB edges.id column is uuid)", () => {
    const store = createCanvasStore(nodes, []);
    store.getState().onConnect({
      source: "a",
      target: "b",
      sourceHandle: null,
      targetHandle: null,
    });

    const edges = store.getState().edges;
    expect(edges).toHaveLength(1);
    // React Flow's default id would be `xy-edge__a-b` — not a uuid, which the
    // edges.id column rejects. onConnect must mint a real uuid.
    expect(UUID_RE.test(edges[0].id)).toBe(true);
  });

  it("still rejects a loop-creating edge", () => {
    const store = createCanvasStore(nodes, []);
    store.getState().onConnect({ source: "a", target: "b", sourceHandle: null, targetHandle: null });
    store.getState().onConnect({ source: "b", target: "a", sourceHandle: null, targetHandle: null });
    expect(store.getState().edges).toHaveLength(1);
  });
});

describe("fanOutShots", () => {
  const scriptNode: AppNode = {
    id: "script-1",
    type: "script",
    position: { x: 100, y: 50 },
    data: {
      title: "Reel A",
      parsed: {
        title: "Reel A",
        strategic_objective: "Sell calm",
        visual_script: {
          shots: [
            { description: "Turmeric root", duration: "3s" },
            { description: "Rose petal", duration: "4s" },
          ],
        },
      },
    },
  } as AppNode;

  it("creates one Shot per shot carrying the full script (one shot) + a lineage edge", () => {
    const store = createCanvasStore([scriptNode], []);
    store.getState().fanOutShots("script-1");

    const { nodes, edges } = store.getState();
    const shots = nodes.filter((n) => n.type === "shot");
    expect(shots).toHaveLength(2);

    // dashed lineage edges Script -> each Shot (D21, amended)
    expect(edges).toHaveLength(2);
    expect(edges.every((e) => e.source === "script-1")).toBe(true);
    expect(edges.map((e) => e.target).sort()).toEqual(shots.map((s) => s.id).sort());

    const first = shots[0].data as {
      script?: {
        title?: string;
        strategic_objective?: string;
        visual_script?: { shots?: { description?: string; duration?: string }[] };
      };
      order?: number;
      seededFrom?: { scriptNodeId: string; shotIndex: number; scriptTitle?: string };
    };
    expect(first.script?.title).toBe("Reel A");
    expect(first.script?.strategic_objective).toBe("Sell calm"); // full metadata carried
    expect(first.script?.visual_script?.shots).toHaveLength(1); // narrowed to one shot
    expect(first.script?.visual_script?.shots?.[0].description).toBe("Turmeric root");
    expect(first.order).toBe(1);
    expect(first.seededFrom?.scriptNodeId).toBe("script-1");
    expect(first.seededFrom?.shotIndex).toBe(0);
    expect(first.seededFrom?.scriptTitle).toBe("Reel A");
  });

  it("does nothing for a script with no parsed shots", () => {
    const bare = { id: "s2", type: "script", position: { x: 0, y: 0 }, data: { title: "" } } as AppNode;
    const store = createCanvasStore([bare], []);
    store.getState().fanOutShots("s2");
    expect(store.getState().nodes.filter((n) => n.type === "shot")).toHaveLength(0);
  });
});
