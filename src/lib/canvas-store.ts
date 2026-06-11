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
import type { AppNode, ScriptNodeData, FileNodeData } from "./canvas-nodes";

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
  updateNodeData: (id: string, data: Partial<ScriptNodeData> | Partial<FileNodeData>) => void;
  connectNodes: (sourceId: string, targetId: string) => void;
  deleteNode: (id: string) => void;
  duplicateNode: (id: string) => void;
};

function defaultData(type: string): AppNode["data"] {
  switch (type) {
    case "file":
      return { title: "" } satisfies FileNodeData;
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
    onConnect: (connection) => set({ edges: addEdge(connection, get().edges) }),
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
  }));
}

export type CanvasStore = ReturnType<typeof createCanvasStore>;
