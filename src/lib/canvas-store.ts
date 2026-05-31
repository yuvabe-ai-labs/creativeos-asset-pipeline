import { createStore } from "zustand/vanilla";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type Node,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  type XYPosition,
} from "@xyflow/react";

// 1C: a minimal canvas store. Nodes/edges live here (client-only, in-memory,
// resets on refresh). Custom node components read/write this store directly —
// which is the whole reason we reach for Zustand: React Flow only hands a
// custom node `{ id, data }`, so it can't receive callback props. The store is
// how a node dispatches an update without prop-drilling.

export type BriefNodeData = { title?: string };
export type AppNode = Node<BriefNodeData>;

export type CanvasState = {
  nodes: AppNode[];
  edges: Edge[];
  onNodesChange: OnNodesChange<AppNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  addNode: (type: string, position: XYPosition) => void;
  updateNodeData: (id: string, data: Partial<BriefNodeData>) => void;
};

function defaultData(type: string): BriefNodeData {
  switch (type) {
    case "brief":
    default:
      return { title: "" };
  }
}

// Factory — one store per canvas instance (created in the provider).
export function createCanvasStore() {
  return createStore<CanvasState>((set, get) => ({
    nodes: [],
    edges: [],
    onNodesChange: (changes) =>
      set({ nodes: applyNodeChanges(changes, get().nodes) }),
    onEdgesChange: (changes) =>
      set({ edges: applyEdgeChanges(changes, get().edges) }),
    onConnect: (connection) => set({ edges: addEdge(connection, get().edges) }),
    addNode: (type, position) =>
      set({
        nodes: [
          ...get().nodes,
          {
            id: crypto.randomUUID(),
            type,
            position,
            data: defaultData(type),
          },
        ],
      }),
    updateNodeData: (id, data) =>
      set({
        nodes: get().nodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...data } } : n,
        ),
      }),
  }));
}

export type CanvasStore = ReturnType<typeof createCanvasStore>;
