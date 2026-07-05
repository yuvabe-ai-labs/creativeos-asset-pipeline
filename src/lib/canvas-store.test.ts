import { describe, it, expect } from "vitest";
import { createCanvasStore } from "./canvas-store";
import type { AppNode } from "./canvas-nodes";
import type { Edge } from "@xyflow/react";
import type { ShotComposeIdea } from "./nodes/shot-compose";
import type { GenerationRow } from "./db/types";

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

describe("promoteIdeasToShots", () => {
  it("creates one sibling Shot per idea (descriptions set, no edges) and leaves the source intact", () => {
    const sourceShot = {
      id: "shot-1",
      type: "shot",
      position: { x: 100, y: 100 },
      data: {
        script: { title: "Reel", visual_script: { shots: [{ description: "seed", duration: "6s" }] } },
        order: 2,
        seededFrom: { scriptTitle: "Reel" },
      },
    } as AppNode;
    const store = createCanvasStore([sourceShot], []);

    const ideas: ShotComposeIdea[] = [
      { title: "A", description: "Forearm glide variant" },
      { title: "B", description: "Post-shower variant" },
    ];
    store.getState().promoteIdeasToShots("shot-1", ideas);

    const shots = store.getState().nodes.filter((n) => n.type === "shot");
    expect(shots).toHaveLength(3); // source + 2 siblings
    const siblings = shots.filter((n) => n.id !== "shot-1");
    const descs = siblings.map(
      (n) =>
        (n.data as { script?: { visual_script?: { shots?: { description?: string }[] } } }).script
          ?.visual_script?.shots?.[0]?.description,
    );
    expect(descs.sort()).toEqual(["Forearm glide variant", "Post-shower variant"]);
    expect(store.getState().edges).toHaveLength(0); // NO edges
  });

  it("is a no-op when the source node is missing or ideas is empty", () => {
    const store = createCanvasStore([], []);
    store.getState().promoteIdeasToShots("nope", [{ title: "A", description: "x" }]);
    expect(store.getState().nodes).toHaveLength(0);
  });
});

describe("canvas store — tombstones", () => {
  const mkNode = (id: string): AppNode =>
    ({ id, type: "text", position: { x: 0, y: 0 }, data: {} }) as AppNode;
  const mkEdge = (id: string, source: string, target: string): Edge => ({
    id,
    source,
    target,
  });

  it("records a removed node and its cascaded edges", () => {
    const store = createCanvasStore(
      [mkNode("a"), mkNode("b")],
      [mkEdge("e1", "a", "b")],
    );
    store.getState().deleteNode("a");
    expect(store.getState().removedNodeIds).toEqual(["a"]);
    expect(store.getState().removedEdgeIds).toEqual(["e1"]);
    expect(store.getState().nodes.map((n) => n.id)).toEqual(["b"]);
  });

  it("records a node removed via onNodesChange", () => {
    const store = createCanvasStore([mkNode("a"), mkNode("b")], []);
    store.getState().onNodesChange([{ type: "remove", id: "b" }]);
    expect(store.getState().removedNodeIds).toEqual(["b"]);
  });

  it("records an edge removed via onEdgesChange", () => {
    const store = createCanvasStore([], [mkEdge("e9", "a", "b")]);
    store.getState().onEdgesChange([{ type: "remove", id: "e9" }]);
    expect(store.getState().removedEdgeIds).toEqual(["e9"]);
  });

  it("clearRemoved drops only the flushed ids, keeping ones added mid-flight", () => {
    const store = createCanvasStore([mkNode("a"), mkNode("b")], []);
    store.getState().deleteNode("a");
    store.getState().deleteNode("b");
    // flush only "a" — "b" was removed during the in-flight save
    store.getState().clearRemoved(["a"], []);
    expect(store.getState().removedNodeIds).toEqual(["b"]);
  });

});

const genRow = (over: Partial<GenerationRow>): GenerationRow =>
  ({
    id: "j", node_id: "g", type: "image", status: "running",
    provider_job_id: null, model_used: null, params_snapshot: null,
    inputs_snapshot: null, tokens_used: null, credits_consumed: null,
    version_id: null, user_id: null, error: null, meta: null,
    created_at: "2026-07-05T00:00:00.000Z", updated_at: "2026-07-05T00:00:00.000Z",
    ...over,
  });

describe("canvas store — tray slice", () => {
  it("starts empty and seeds via setTrayJobs", () => {
    const store = createCanvasStore();
    expect(store.getState().trayJobs).toEqual({});
    store.getState().setTrayJobs([genRow({ id: "a" }), genRow({ id: "b" })]);
    expect(Object.keys(store.getState().trayJobs).sort()).toEqual(["a", "b"]);
  });

  it("upsertTrayJob replaces a row by id", () => {
    const store = createCanvasStore();
    store.getState().upsertTrayJob(genRow({ id: "a", status: "running" }));
    store.getState().upsertTrayJob(genRow({ id: "a", status: "succeeded" }));
    expect(Object.keys(store.getState().trayJobs)).toEqual(["a"]);
    expect(store.getState().trayJobs.a.status).toBe("succeeded");
  });
});

describe("canvas store — focusedNodeId", () => {
  it("starts null and can be set/cleared", () => {
    const store = createCanvasStore();
    expect(store.getState().focusedNodeId).toBeNull();
    store.getState().setFocusedNodeId("node-1");
    expect(store.getState().focusedNodeId).toBe("node-1");
    store.getState().setFocusedNodeId(null);
    expect(store.getState().focusedNodeId).toBeNull();
  });
});
