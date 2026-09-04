import { describe, it, expect } from "vitest";
import { createCanvasStore } from "./canvas-store";
import type { AppNode } from "./canvas-nodes";
import type { Edge } from "@xyflow/react";
import type { ShotComposeIdea } from "./nodes/shot-compose";
import type { GenerationRow } from "./db/types";
import { GEMINI_OMNI_MODEL_ID as OMNI_MODEL_ID } from "./video-gen/client-models";

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
          // (D214), so the old lengths would have made this fixture test the opposite of its
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
      seededFrom?: { scriptNodeId: string; shotIndexes?: number[]; scriptTitle?: string };
    };
    expect(first.script?.title).toBe("Reel A");
    expect(first.script?.strategic_objective).toBe("Sell calm"); // full metadata carried
    expect(first.script?.visual_script?.shots).toHaveLength(1); // narrowed to one shot
    expect(first.script?.visual_script?.shots?.[0].description).toBe("Turmeric root");
    expect(first.order).toBe(1);
    expect(first.seededFrom?.scriptNodeId).toBe("script-1");
    expect(first.seededFrom?.shotIndexes).toEqual([0]);
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
    const created = store.getState().nodes.filter((n) => n.id !== "script-b");

    // 5 shots -> 3 generations, after the trailing rebalance: [0,1] [2] [3,4]. A group of >1 row
    // defaults to a `multishot` node; a lone row stays a `shot` (D228).
    expect(created).toHaveLength(3);
    expect(created.map((n) => n.type)).toEqual(["multishot", "shot", "multishot"]);
    expect(
      created.map((n) => (n.data as { seededFrom?: { shotIndexes?: number[] } })
        .seededFrom?.shotIndexes),
    ).toEqual([[0, 1], [2], [3, 4]]);

    const [first, middle, last] = created;
    expect((first.data as { cuts?: unknown[] }).cuts).toHaveLength(2);
    expect((last.data as { cuts?: unknown[] }).cuts).toHaveLength(2);
    expect(
      (middle.data as { script?: { visual_script?: { shots?: unknown[] } } })
        .script?.visual_script?.shots,
    ).toHaveLength(1);
  });
});

describe("fanOutShots is incremental", () => {
  const parsed = {
    visual_script: {
      shots: [
        { description: "a", duration_seconds: 3 },
        { description: "b", duration_seconds: 5 },
        { description: "c", duration_seconds: 6 },
      ],
    },
  };
  const scriptNode = (data: object = {}): AppNode =>
    ({ id: "sc", type: "script", position: { x: 0, y: 0 }, data: { parsed, ...data } }) as AppNode;

  it("creates one node per generation, typed by its mode", () => {
    const store = createCanvasStore([scriptNode()], []);
    store.getState().fanOutShots("sc");

    const created = store.getState().nodes.filter((n) => n.id !== "sc");
    expect(created.map((n) => n.type)).toEqual(["multishot", "shot"]);
  });

  it("gives the multishot node cuts summing to its budget", () => {
    const store = createCanvasStore([scriptNode()], []);
    store.getState().fanOutShots("sc");

    const ms = store.getState().nodes.find((n) => n.type === "multishot")!;
    const data = ms.data as { cuts?: { seconds: number }[]; totalSeconds?: number };
    expect(data.totalSeconds).toBe(8);
    expect(data.cuts?.reduce((s, c) => s + c.seconds, 0)).toBe(8);
    // The envelope keeps the script context but NOT a second copy of the shot list.
    expect((ms.data as { script?: { visual_script?: { shots?: unknown } } }).script?.visual_script?.shots)
      .toBeUndefined();
  });

  // The bug this task fixes: a second press used to duplicate the whole row of nodes.
  it("creates nothing on a second call with no changes", () => {
    const store = createCanvasStore([scriptNode()], []);
    store.getState().fanOutShots("sc");
    const after = store.getState().nodes.length;
    store.getState().fanOutShots("sc");
    expect(store.getState().nodes.length).toBe(after);
  });

  it("creates only the generation that is missing", () => {
    const store = createCanvasStore([scriptNode()], []);
    store.getState().fanOutShots("sc");
    const doomed = store.getState().nodes.find((n) => n.type === "shot")!;
    store.getState().deleteNode(doomed.id);

    store.getState().fanOutShots("sc");
    const shotNodes = store.getState().nodes.filter((n) => n.type === "shot");
    const multishotNodes = store.getState().nodes.filter((n) => n.type === "multishot");
    expect(shotNodes).toHaveLength(1);
    expect(multishotNodes).toHaveLength(1);
  });

  it("honours an override when choosing the node type", () => {
    const store = createCanvasStore([scriptNode({ groupModes: { "0-1": false, "2": true } })], []);
    store.getState().fanOutShots("sc");

    const created = store.getState().nodes.filter((n) => n.id !== "sc");
    expect(created.map((n) => n.type)).toEqual(["shot", "multishot"]);
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

describe("setGenerationMode", () => {
  const scriptNode = (parsed: unknown): AppNode =>
    ({ id: "sc", type: "script", position: { x: 0, y: 0 }, data: { parsed } }) as AppNode;

  const parsed = {
    visual_script: {
      shots: [
        { description: "a", duration_seconds: 3 },
        { description: "b", duration_seconds: 5 },
        { description: "c", duration_seconds: 6 },
      ],
    },
  };

  it("records an override on the script node", () => {
    const store = createCanvasStore([scriptNode(parsed)], []);
    store.getState().setGenerationMode("sc", "0-1", false);

    const data = store.getState().nodes[0].data as { groupModes?: Record<string, boolean> };
    expect(data.groupModes).toEqual({ "0-1": false });
  });

  // Only deviations are stored. Writing the default back removes the key rather than pinning
  // a value that would then survive a re-parse it no longer describes.
  it("drops the key when the mode returns to the default", () => {
    const store = createCanvasStore([scriptNode(parsed)], []);
    store.getState().setGenerationMode("sc", "0-1", false);
    store.getState().setGenerationMode("sc", "0-1", true);

    const data = store.getState().nodes[0].data as { groupModes?: Record<string, boolean> };
    expect(data.groupModes).toEqual({});
  });

  it("is a no-op on a node that is not a script", () => {
    const store = createCanvasStore([{ id: "t", type: "text", position: { x: 0, y: 0 }, data: {} } as AppNode], []);
    store.getState().setGenerationMode("t", "0", false);
    expect(store.getState().nodes[0].data).toEqual({});
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

describe("setGenerationMode swaps an existing node's type", () => {
  const parsed = {
    visual_script: {
      shots: [
        { description: "a", duration_seconds: 3 },
        { description: "b", duration_seconds: 5 },
      ],
    },
  };

  const seeded = () => {
    const store = createCanvasStore(
      [{ id: "sc", type: "script", position: { x: 0, y: 0 }, data: { parsed } } as AppNode],
      [],
    );
    store.getState().fanOutShots("sc");
    return store;
  };

  it("converts the node in place, keeping its id and position", () => {
    const store = seeded();
    const before = store.getState().nodes.find((n) => n.type === "multishot")!;

    store.getState().setGenerationMode("sc", "0-1", false);

    const after = store.getState().nodes.find((n) => n.id === before.id)!;
    expect(after.type).toBe("shot");
    expect(after.position).toEqual(before.position);
  });

  it("keeps incoming edges and drops outgoing ones", () => {
    const store = seeded();
    const ms = store.getState().nodes.find((n) => n.type === "multishot")!;
    store.setState({
      nodes: [
        ...store.getState().nodes,
        { id: "mp", type: "multishot-prompt", position: { x: 0, y: 0 }, data: {} } as AppNode,
      ],
      edges: [...store.getState().edges, { id: "out", source: ms.id, target: "mp" }],
    });

    store.getState().setGenerationMode("sc", "0-1", false);

    const edges = store.getState().edges;
    // The Script lineage edge survives; the prompt edge does not — a motion prompt written for
    // a cut ladder does not describe a continuous take.
    expect(edges.some((e) => e.source === "sc" && e.target === ms.id)).toBe(true);
    expect(edges.some((e) => e.id === "out")).toBe(false);
    // ...and it must be RECORDED as removed, or autosave resurrects it on reload.
    expect(store.getState().removedEdgeIds).toContain("out");
  });

  it("round-trips the node's content through a flip and a flip-back", () => {
    const store = seeded();
    store.getState().setGenerationMode("sc", "0-1", false);
    store.getState().setGenerationMode("sc", "0-1", true);

    const node = store.getState().nodes.find((n) => n.type === "multishot")!;
    const data = node.data as { cuts?: { text: string; seconds: number }[] };
    expect(data.cuts?.map((c) => [c.text, c.seconds])).toEqual([
      ["a", 3],
      ["b", 5],
    ]);
  });

  it("still just records the override when no node exists yet", () => {
    const store = createCanvasStore(
      [{ id: "sc", type: "script", position: { x: 0, y: 0 }, data: { parsed } } as AppNode],
      [],
    );
    store.getState().setGenerationMode("sc", "0-1", false);
    expect(store.getState().nodes).toHaveLength(1);
  });
});

describe("Omni coercion on connect", () => {
  // The followups doc's recorded lesson: "Filtering a picker is not enforcing a constraint."
  // D216 hid every other chip but never changed the stored modelId, so a Veo run could still be
  // billed against a ladder Veo ignores. Assert the STORED value, not which chips render.
  it("coerces a video-gen node's modelId when a multishot-prompt feeds it", () => {
    const store = createCanvasStore(
      [
        { id: "mp", type: "multishot-prompt", position: { x: 0, y: 0 }, data: {} } as AppNode,
        { id: "vg", type: "video-gen", position: { x: 0, y: 0 }, data: { modelId: "google:veo-3" } } as AppNode,
      ],
      [],
    );
    store.getState().onConnect({ source: "mp", target: "vg", sourceHandle: null, targetHandle: null });

    expect((store.getState().nodes.find((n) => n.id === "vg")!.data as { modelId?: string }).modelId)
      .toBe(OMNI_MODEL_ID);
  });

  it("leaves a video-gen fed by an ordinary video-prompt alone", () => {
    const store = createCanvasStore(
      [
        { id: "vp", type: "video-prompt", position: { x: 0, y: 0 }, data: {} } as AppNode,
        { id: "vg", type: "video-gen", position: { x: 0, y: 0 }, data: { modelId: "google:veo-3" } } as AppNode,
      ],
      [],
    );
    store.getState().onConnect({ source: "vp", target: "vg", sourceHandle: null, targetHandle: null });

    expect((store.getState().nodes.find((n) => n.id === "vg")!.data as { modelId?: string }).modelId)
      .toBe("google:veo-3");
  });

  // The multishot lane's sensible defaults: 9:16 (reels are vertical) and 720p (Omni's only
  // natively rendered tier). Merged into `params`, never a wholesale replace — see the modelId
  // coercion above for why blind replacement is the exact bug this feature avoids repeating.
  it("defaults aspect_ratio and resolution for a fresh video-gen node, merged into existing params", () => {
    const store = createCanvasStore(
      [
        { id: "mp", type: "multishot-prompt", position: { x: 0, y: 0 }, data: {} } as AppNode,
        {
          id: "vg",
          type: "video-gen",
          position: { x: 0, y: 0 },
          data: { modelId: "google:veo-3", params: { duration: 8 } },
        } as AppNode,
      ],
      [],
    );
    store.getState().onConnect({ source: "mp", target: "vg", sourceHandle: null, targetHandle: null });

    const params = (store.getState().nodes.find((n) => n.id === "vg")!.data as { params?: Record<string, unknown> }).params;
    expect(params).toEqual({ duration: 8, aspect_ratio: "9:16", resolution: "720p" });
  });

  it("does not clobber an operator's already-chosen aspect_ratio or resolution", () => {
    const store = createCanvasStore(
      [
        { id: "mp", type: "multishot-prompt", position: { x: 0, y: 0 }, data: {} } as AppNode,
        {
          id: "vg",
          type: "video-gen",
          position: { x: 0, y: 0 },
          data: { modelId: "google:veo-3", params: { aspect_ratio: "16:9", resolution: "1080p" } },
        } as AppNode,
      ],
      [],
    );
    store.getState().onConnect({ source: "mp", target: "vg", sourceHandle: null, targetHandle: null });

    const params = (store.getState().nodes.find((n) => n.id === "vg")!.data as { params?: Record<string, unknown> }).params;
    expect(params).toEqual({ aspect_ratio: "16:9", resolution: "1080p" });
  });

  it("sets both defaults on a video-gen node with no params at all", () => {
    const store = createCanvasStore(
      [
        { id: "mp", type: "multishot-prompt", position: { x: 0, y: 0 }, data: {} } as AppNode,
        { id: "vg", type: "video-gen", position: { x: 0, y: 0 }, data: { modelId: "google:veo-3" } } as AppNode,
      ],
      [],
    );
    store.getState().onConnect({ source: "mp", target: "vg", sourceHandle: null, targetHandle: null });

    const params = (store.getState().nodes.find((n) => n.id === "vg")!.data as { params?: Record<string, unknown> }).params;
    expect(params).toEqual({ aspect_ratio: "9:16", resolution: "720p" });
  });
});
