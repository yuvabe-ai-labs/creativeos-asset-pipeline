import { createStore } from "zustand/vanilla";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  type XYPosition,
} from "@xyflow/react";
import { toast } from "sonner";
import { wouldCreateCycle } from "@/lib/canvas/graph";
import type { AppNode } from "./canvas-nodes";
import type { ReelScript } from "@/lib/nodes/reel-script";

// 1C/1D: the canvas store. Nodes/edges live here; custom node components read
// and write it directly (React Flow only hands a node `{ id, data }`).
// Seeded on creation with nodes loaded from the DB (1D-5).

export type CanvasState = {
  nodes: AppNode[];
  edges: Edge[];
  onNodesChange: OnNodesChange<AppNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  addNode: (type: string, position: XYPosition, id?: string) => void;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  connectNodes: (sourceId: string, targetId: string) => void;
  deleteNode: (id: string) => void;
  duplicateNode: (id: string) => void;
  fanOutShots: (scriptNodeId: string) => void;
};

function defaultData(type: string): AppNode["data"] {
  switch (type) {
    case "file":
      return { title: "" };
    case "text":
      return {};
    case "shot":
      return {};
    case "prompt":
      return { title: "" };
    case "script":
    default:
      return { title: "" };
  }
}

// Factory — one store per canvas instance (created in the provider).
export function createCanvasStore(
  initialNodes: AppNode[] = [],
  initialEdges: Edge[] = [],
) {
  return createStore<CanvasState>((set, get) => ({
    nodes: initialNodes,
    edges: initialEdges,
    onNodesChange: (changes) => {
      const removedIds = new Set(
        changes.filter((c) => c.type === "remove").map((c) => c.id),
      );
      set({
        nodes: applyNodeChanges(changes, get().nodes),
        ...(removedIds.size > 0 && {
          edges: get().edges.filter(
            (e) => !removedIds.has(e.source) && !removedIds.has(e.target),
          ),
        }),
      });
    },
    onEdgesChange: (changes) =>
      set({ edges: applyEdgeChanges(changes, get().edges) }),
    onConnect: (connection) => {
      const { source, target } = connection;
      if (source && target && wouldCreateCycle(get().edges, source, target)) {
        toast.error("That connection would create a loop.");
        return;
      }
      // Mint a uuid id — React Flow would otherwise assign `xy-edge__<src>-<tgt>`,
      // which the edges.id uuid column rejects (failing the whole save batch).
      set({ edges: addEdge({ ...connection, id: crypto.randomUUID() }, get().edges) });
    },
    addNode: (type, position, id) =>
      set({
        nodes: [
          ...get().nodes,
          {
            id: id ?? crypto.randomUUID(),
            type,
            position,
            data: defaultData(type),
          } as AppNode,
        ],
      }),
    updateNodeData: (id, data) =>
      set({
        nodes: get().nodes.map((n) =>
          n.id === id
            ? ({ ...n, data: { ...n.data, ...data } } as AppNode)
            : n,
        ),
      }),
    connectNodes: (sourceId, targetId) =>
      set({
        edges: addEdge(
          { source: sourceId, target: targetId, id: crypto.randomUUID() },
          get().edges,
        ),
      }),
    deleteNode: (id) =>
      set({
        nodes: get().nodes.filter((n) => n.id !== id),
        edges: get().edges.filter(
          (e) => e.source !== id && e.target !== id,
        ),
      }),
    duplicateNode: (id) => {
      const node = get().nodes.find((n) => n.id === id);
      if (!node || node.type === "kb") return;
      set({
        nodes: [
          ...get().nodes,
          {
            ...node,
            id: crypto.randomUUID(),
            position: { x: node.position.x + 32, y: node.position.y + 32 },
            selected: false,
          } as AppNode,
        ],
      });
    },
    // Materialize each shot of a parsed Script into its own Shot node (seed-and-fork,
    // D21). Each Shot carries the FULL parent script narrowed to its single shot
    // ("a Script node with one shot"), so downstream prompts keep the whole creative
    // context. A dashed Script->Shot lineage edge is added for provenance; it is NOT
    // a live edge (resolution never traverses it). Reads the script's hydrated parsed
    // output (data.parsed = the active version, D19).
    fanOutShots: (scriptNodeId) => {
      const script = get().nodes.find((n) => n.id === scriptNodeId);
      if (!script) return;
      const data = script.data as { title?: string; parsed?: ReelScript };
      const parsed = data.parsed;
      const shots = parsed?.visual_script?.shots ?? [];
      if (shots.length === 0) return;

      const base = script.position;
      const scriptTitle = data.title || parsed?.title || "";
      const created = shots.map((shot, i) => ({
        id: crypto.randomUUID(),
        type: "shot",
        position: { x: base.x + 360, y: base.y + i * 170 },
        data: {
          script: {
            ...parsed,
            visual_script: { ...parsed?.visual_script, shots: [shot] },
          },
          order: i + 1,
          seededFrom: { scriptNodeId, shotIndex: i, scriptTitle },
        },
      })) as AppNode[];

      const createdEdges = created.map((n) => ({
        id: crypto.randomUUID(),
        source: scriptNodeId,
        target: n.id,
      }));

      set({
        nodes: [...get().nodes, ...created],
        edges: [...get().edges, ...createdEdges],
      });
    },
  }));
}

export type CanvasStore = ReturnType<typeof createCanvasStore>;
