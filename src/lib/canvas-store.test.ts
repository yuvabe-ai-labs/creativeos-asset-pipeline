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

describe("disconnectNodes", () => {
  const edge = (id: string, source: string, target: string): Edge => ({ id, source, target });

  it("drops the edge AND records it in removedEdgeIds so autosave deletes the row", () => {
    const store = createCanvasStore(nodes, [edge("e1", "a", "b")]);
    store.getState().disconnectNodes("a", "b");

    expect(store.getState().edges).toHaveLength(0);
    // Without this the edge is only gone in memory and comes back on reload.
    expect(store.getState().removedEdgeIds).toEqual(["e1"]);
  });

  it("leaves both nodes on the canvas — it unwires, it does not delete", () => {
    const store = createCanvasStore(nodes, [edge("e1", "a", "b")]);
    store.getState().disconnectNodes("a", "b");

    expect(store.getState().nodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(store.getState().removedNodeIds).toEqual([]);
  });

  it("only removes the matching direction, leaving other wires intact", () => {
    const store = createCanvasStore(nodes, [
      edge("e1", "a", "b"),
      edge("e2", "b", "a"),
    ]);
    store.getState().disconnectNodes("a", "b");

    expect(store.getState().edges.map((e) => e.id)).toEqual(["e2"]);
  });

  it("is a no-op when the pair is not wired", () => {
    const store = createCanvasStore(nodes, [edge("e1", "a", "b")]);
    store.getState().disconnectNodes("b", "a");

    expect(store.getState().edges).toHaveLength(1);
    expect(store.getState().removedEdgeIds).toEqual([]);
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
          // 6+6 exceeds the 10s cap, so these two stay one node each — which is what the
          // assertions below are about. Two 4s shots would now legitimately group into ONE node
          // (D193), so the old lengths would have made this fixture test the opposite of its
          // own name. The display string and the length agree so the data is not misleading.
          shots: [
            { description: "Turmeric root", duration: "6s", duration_seconds: 6 },
            { description: "Rose petal", duration: "6s", duration_seconds: 6 },
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

  it("groups consecutive shots into multishot nodes capped at 10s", () => {
    const reelB: AppNode = {
      id: "script-b",
      type: "script",
      position: { x: 0, y: 0 },
      data: {
        title: "Reel B",
        parsed: {
          title: "Reel B",
          visual_script: {
            shots: [
              { description: "one", duration_seconds: 3 },
              { description: "two", duration_seconds: 5 },
              { description: "three", duration_seconds: 6 },
              { description: "four", duration_seconds: 4 },
              { description: "five", duration_seconds: 2 },
            ],
          },
        },
      },
    } as AppNode;

    const store = createCanvasStore([reelB], []);
    store.getState().fanOutShots("script-b");
    const shotNodes = store.getState().nodes.filter((n) => n.type === "shot");

    // 5 shots -> 3 nodes, after the trailing rebalance: [0,1] [2] [3,4]
    expect(shotNodes).toHaveLength(3);
    expect(
      shotNodes.map((n) => (n.data as { script?: { visual_script?: { shots?: unknown[] } } })
        .script?.visual_script?.shots?.length),
    ).toEqual([2, 1, 2]);
    expect(shotNodes.map((n) => (n.data as { multishot?: boolean }).multishot))
      .toEqual([true, false, true]);
    expect(
      shotNodes.map((n) => (n.data as { seededFrom?: { shotIndexes?: number[] } })
        .seededFrom?.shotIndexes),
    ).toEqual([[0, 1], [2], [3, 4]]);
  });
});

describe("splitMultishotNode", () => {
  const groupedShot: AppNode = {
    id: "grouped",
    type: "shot",
    position: { x: 100, y: 100 },
    data: {
      multishot: true,
      script: {
        title: "Reel",
        visual_script: {
          shots: [
            { description: "hands lift the jar", duration_seconds: 4 },
            { description: "macro on the lid", duration_seconds: 5 },
          ],
        },
      },
      seededFrom: { scriptNodeId: "script-1", shotIndex: 0, shotIndexes: [0, 1], scriptTitle: "Reel" },
    },
  } as AppNode;

  it("replaces the grouped node with one node per beat", () => {
    const store = createCanvasStore([groupedShot], []);
    store.getState().splitMultishotNode("grouped");

    const { nodes } = store.getState();
    expect(nodes.some((n) => n.id === "grouped")).toBe(false);
    const pieces = nodes.filter((n) => n.type === "shot");
    expect(pieces).toHaveLength(2);
    expect(
      pieces.map((n) => (n.data as { script?: { visual_script?: { shots?: { description?: string }[] } } })
        .script?.visual_script?.shots?.[0]?.description),
    ).toEqual(["hands lift the jar", "macro on the lid"]);
  });

  // The bug Fix 1 addresses: without this, the grouped node and its dropped outgoing edge
  // resurrect on the next load, because autosave's delete set is built ONLY from these lists.
  it("records the old node id in removedNodeIds and every touching edge in removedEdgeIds", () => {
    const upstream: AppNode = { id: "script-1", type: "script", position: { x: 0, y: 0 }, data: {} } as AppNode;
    const downstream: AppNode = { id: "prompt-1", type: "prompt", position: { x: 0, y: 0 }, data: {} } as AppNode;
    const store = createCanvasStore(
      [upstream, groupedShot, downstream],
      [
        { id: "e-in", source: "script-1", target: "grouped" },
        { id: "e-out", source: "grouped", target: "prompt-1" },
      ],
    );
    store.getState().splitMultishotNode("grouped");

    expect(store.getState().removedNodeIds).toEqual(["grouped"]);
    expect(store.getState().removedEdgeIds.sort()).toEqual(["e-in", "e-out"]);
  });

  it("carries an incoming edge to every piece", () => {
    const upstream: AppNode = { id: "script-1", type: "script", position: { x: 0, y: 0 }, data: {} } as AppNode;
    const store = createCanvasStore(
      [upstream, groupedShot],
      [{ id: "e-in", source: "script-1", target: "grouped" }],
    );
    store.getState().splitMultishotNode("grouped");

    const pieces = store.getState().nodes.filter((n) => n.type === "shot");
    const incomingEdges = store.getState().edges.filter((e) => e.source === "script-1");
    expect(incomingEdges).toHaveLength(pieces.length);
    expect(incomingEdges.map((e) => e.target).sort()).toEqual(pieces.map((p) => p.id).sort());
  });

  it("does not carry an outgoing edge to any piece", () => {
    const downstream: AppNode = { id: "prompt-1", type: "prompt", position: { x: 0, y: 0 }, data: {} } as AppNode;
    const store = createCanvasStore(
      [groupedShot, downstream],
      [{ id: "e-out", source: "grouped", target: "prompt-1" }],
    );
    store.getState().splitMultishotNode("grouped");

    expect(store.getState().edges).toHaveLength(0);
  });
});

describe("mergeShotNodes", () => {
  const piece = (id: string, index: number, description: string, x: number): AppNode =>
    ({
      id,
      type: "shot",
      position: { x, y: 50 },
      data: {
        multishot: false,
        script: {
          title: "Reel",
          visual_script: { shots: [{ description, duration_seconds: 4 }] },
        },
        seededFrom: { scriptNodeId: "script-1", shotIndex: index, shotIndexes: [index], scriptTitle: "Reel" },
      },
    }) as AppNode;

  const shotsOf = (n: AppNode) =>
    (n.data as { script?: { visual_script?: { shots?: { description?: string }[] } } })
      .script?.visual_script?.shots?.map((s) => s.description);

  it("replaces the selected nodes with one multishot node", () => {
    const store = createCanvasStore([piece("a", 0, "first", 0), piece("b", 1, "second", 300)], []);
    store.getState().mergeShotNodes(["a", "b"]);

    const { nodes } = store.getState();
    expect(nodes).toHaveLength(1);
    expect(shotsOf(nodes[0])).toEqual(["first", "second"]);
    expect((nodes[0].data as { multishot?: boolean }).multishot).toBe(true);
  });

  // Selection order is an artifact of the drag box; the ladder's timings are cumulative, so
  // merging in click order would silently reorder the film.
  it("orders beats by script position regardless of the id order passed in", () => {
    const store = createCanvasStore([piece("a", 0, "first", 0), piece("b", 1, "second", 300)], []);
    store.getState().mergeShotNodes(["b", "a"]);
    expect(shotsOf(store.getState().nodes[0])).toEqual(["first", "second"]);
  });

  it("lands on the first shot's position", () => {
    const store = createCanvasStore([piece("a", 0, "first", 40), piece("b", 1, "second", 900)], []);
    store.getState().mergeShotNodes(["a", "b"]);
    expect(store.getState().nodes[0].position).toEqual({ x: 40, y: 50 });
  });

  // Same defect class as splitMultishotNode's: autosave's delete set is built ONLY from these
  // lists, so nodes and edges dropped from state alone resurrect on the next load.
  it("records every replaced node and every touching edge as removed", () => {
    const script: AppNode = { id: "script-1", type: "script", position: { x: 0, y: 0 }, data: {} } as AppNode;
    const prompt: AppNode = { id: "vp-1", type: "video-prompt", position: { x: 0, y: 0 }, data: {} } as AppNode;
    const store = createCanvasStore(
      [script, piece("a", 0, "first", 0), piece("b", 1, "second", 300), prompt],
      [
        { id: "e-a-in", source: "script-1", target: "a" },
        { id: "e-b-in", source: "script-1", target: "b" },
        { id: "e-a-out", source: "a", target: "vp-1" },
      ],
    );
    store.getState().mergeShotNodes(["a", "b"]);

    expect(store.getState().removedNodeIds.sort()).toEqual(["a", "b"]);
    expect(store.getState().removedEdgeIds.sort()).toEqual(["e-a-in", "e-a-out", "e-b-in"]);
  });

  // The pieces of an earlier split each hold a COPY of the same lineage edge. Carrying them
  // naively would give the merged node N identical inputs.
  it("dedupes identical incoming edges into one", () => {
    const script: AppNode = { id: "script-1", type: "script", position: { x: 0, y: 0 }, data: {} } as AppNode;
    const store = createCanvasStore(
      [script, piece("a", 0, "first", 0), piece("b", 1, "second", 300)],
      [
        { id: "e-a-in", source: "script-1", target: "a" },
        { id: "e-b-in", source: "script-1", target: "b" },
      ],
    );
    store.getState().mergeShotNodes(["a", "b"]);

    const edges = store.getState().edges;
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe("script-1");
    expect(edges[0].target).toBe(store.getState().nodes.find((n) => n.type === "shot")!.id);
  });

  it("drops outgoing edges — a prompt for one beat does not describe the sequence", () => {
    const prompt: AppNode = { id: "vp-1", type: "video-prompt", position: { x: 0, y: 0 }, data: {} } as AppNode;
    const store = createCanvasStore(
      [piece("a", 0, "first", 0), piece("b", 1, "second", 300), prompt],
      [{ id: "e-out", source: "a", target: "vp-1" }],
    );
    store.getState().mergeShotNodes(["a", "b"]);
    expect(store.getState().edges).toHaveLength(0);
  });

  it("is a no-op for fewer than two shots", () => {
    const store = createCanvasStore([piece("a", 0, "first", 0)], []);
    store.getState().mergeShotNodes(["a"]);
    expect(store.getState().nodes.map((n) => n.id)).toEqual(["a"]);
    expect(store.getState().removedNodeIds).toEqual([]);
  });

  it("ignores non-shot ids in the selection", () => {
    const text: AppNode = { id: "t", type: "text", position: { x: 0, y: 0 }, data: {} } as AppNode;
    const store = createCanvasStore([piece("a", 0, "first", 0), text], []);
    store.getState().mergeShotNodes(["a", "t"]);
    // Only one real shot, so nothing to merge — and the text node is untouched.
    expect(store.getState().nodes.map((n) => n.id).sort()).toEqual(["a", "t"]);
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
    id: "j", node_id: "g", org_id: "org-1", client_id: null, type: "image", status: "running",
    provider_job_id: null, model_used: null, params_snapshot: null,
    inputs_snapshot: null, output_snapshot: null, tokens_used: null, cost_usd: null, credits_charged: null,
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

describe("canvas store — openFocusViewIds", () => {
  it("starts empty", () => {
    expect(createCanvasStore().getState().openFocusViewIds).toEqual([]);
  });

  it("registers and unregisters a node's focus view", () => {
    const store = createCanvasStore();
    store.getState().setFocusViewOpen("node-1", true);
    expect(store.getState().openFocusViewIds).toEqual(["node-1"]);
    store.getState().setFocusViewOpen("node-1", false);
    expect(store.getState().openFocusViewIds).toEqual([]);
  });

  it("is idempotent — re-registering the same id does not duplicate it", () => {
    const store = createCanvasStore();
    store.getState().setFocusViewOpen("node-1", true);
    store.getState().setFocusViewOpen("node-1", true);
    expect(store.getState().openFocusViewIds).toEqual(["node-1"]);
  });

  it("keeps the gate closed while another view is still open", () => {
    // The async path: the copilot points focusedNodeId at node-2 while node-1 is
    // already open locally, then node-1 closes. A boolean flag would clear here and
    // let the canvas go live under node-2's still-open sheet.
    const store = createCanvasStore();
    store.getState().setFocusViewOpen("node-1", true);
    store.getState().setFocusViewOpen("node-2", true);
    store.getState().setFocusViewOpen("node-1", false);
    expect(store.getState().openFocusViewIds).toEqual(["node-2"]);
  });

  it("ignores a close for an id that was never open", () => {
    const store = createCanvasStore();
    store.getState().setFocusViewOpen("ghost", false);
    expect(store.getState().openFocusViewIds).toEqual([]);
  });
});

describe("guidedCreateNext", () => {
  it("creates the next node wired from the source and returns its id", () => {
    const shot: AppNode = { id: "s", type: "shot", position: { x: 0, y: 0 }, data: {} } as AppNode;
    const store = createCanvasStore([shot], []);
    const newId = store.getState().guidedCreateNext("s");
    expect(newId).not.toBeNull();
    const created = store.getState().nodes.find((n) => n.id === newId);
    expect(created?.type).toBe("prompt");
    expect(store.getState().edges.some((e) => e.source === "s" && e.target === newId)).toBe(true);
  });

  it("returns the existing next id without creating a duplicate", () => {
    const shot: AppNode = { id: "s", type: "shot", position: { x: 0, y: 0 }, data: {} } as AppNode;
    const prompt: AppNode = { id: "p", type: "prompt", position: { x: 360, y: 0 }, data: {} } as AppNode;
    const store = createCanvasStore([shot, prompt], [{ id: "s-p", source: "s", target: "p" }]);
    const before = store.getState().nodes.length;
    expect(store.getState().guidedCreateNext("s")).toBe("p");
    expect(store.getState().nodes.length).toBe(before); // no new node
  });

  it("returns null for a gated source (image-gen with no image)", () => {
    const ig: AppNode = { id: "g", type: "image-gen", position: { x: 0, y: 0 }, data: {} } as AppNode;
    const store = createCanvasStore([ig], []);
    expect(store.getState().guidedCreateNext("g")).toBeNull();
  });
});

import type { PlaybookRun } from "./copilot/runner";

describe("playbookRun slice", () => {
  const run: PlaybookRun = {
    playbook: "image-for-shot",
    title: "Image for SHOT-1A2B",
    slots: { shot: "SHOT-1A2B", refs: [] },
    created: {},
    stepIndex: 0,
    status: "running",
    log: [],
  };

  it("starts null; set/patch/clear round-trips", () => {
    const store = createCanvasStore([], []);
    expect(store.getState().playbookRun).toBeNull();
    store.getState().setPlaybookRun(run);
    store.getState().patchPlaybookRun({ status: "waiting-human", stepIndex: 3 });
    expect(store.getState().playbookRun).toMatchObject({ status: "waiting-human", stepIndex: 3 });
    store.getState().setPlaybookRun(null);
    expect(store.getState().playbookRun).toBeNull();
  });

  it("patch is a no-op when there is no run", () => {
    const store = createCanvasStore([], []);
    store.getState().patchPlaybookRun({ status: "cancelled" });
    expect(store.getState().playbookRun).toBeNull();
  });
});
