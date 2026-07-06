import { createStore } from "zustand/vanilla";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type EdgeRemoveChange,
  type NodeRemoveChange,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  type XYPosition,
} from "@xyflow/react";
import { toast } from "sonner";
import { wouldCreateCycle } from "@/lib/canvas/graph";
import { planGuidedNext } from "@/lib/guided-flow";
import type { AppNode } from "./canvas-nodes";
import type { ReelScript } from "@/lib/nodes/reel-script";
import type { ShotComposeIdea } from "@/lib/nodes/shot-compose";
import type { GenerationRow } from "@/lib/db/types";

// 1C/1D: the canvas store. Nodes/edges live here; custom node components read
// and write it directly (React Flow only hands a node `{ id, data }`).
// Seeded on creation with nodes loaded from the DB (1D-5).

export type CanvasState = {
  nodes: AppNode[];
  edges: Edge[];
  onNodesChange: OnNodesChange<AppNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  removedNodeIds: string[];
  removedEdgeIds: string[];
  clearRemoved: (nodeIds: string[], edgeIds: string[]) => void;
  addNode: (type: string, position: XYPosition, id?: string) => void;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  connectNodes: (sourceId: string, targetId: string) => void;
  deleteNode: (id: string) => void;
  duplicateNode: (id: string) => Promise<void>;
  fanOutShots: (scriptNodeId: string) => void;
  promoteIdeasToShots: (shotNodeId: string, ideas: ShotComposeIdea[]) => void;
  // Per-node video generation status — shared between VideoGenNode and VideoGenFocusView
  videoGenStatus: Record<string, { isGenerating: boolean; lastError: string | null }>;
  setVideoGenGenerating: (nodeId: string, v: boolean) => void;
  setVideoGenError: (nodeId: string, err: string | null) => void;
  // Generation Tray — live job rows for this canvas (fed by the tray's Realtime hook),
  // keyed by generation id. The tray derives its list from these + the node graph (D9).
  trayJobs: Record<string, GenerationRow>;
  setTrayJobs: (jobs: GenerationRow[]) => void;
  upsertTrayJob: (job: GenerationRow) => void;
  // Programmatic focus-view open signal — set by the tray to open a node's focus view.
  focusedNodeId: string | null;
  setFocusedNodeId: (id: string | null) => void;
  // Guided next-node flow (D36): create/connect/place the next pipeline node, or return
  // an existing next node's id to navigate to. Never runs a model.
  guidedCreateNext: (sourceId: string) => string | null;
  // KB build status — drives toolbar badge and node warnings
  kbStatus: 'none' | 'building' | 'ready';
  setKbStatus: (status: 'none' | 'building' | 'ready') => void;
  kbJustReady: boolean;
  setKbJustReady: (v: boolean) => void;
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
    case "draw":
      return { title: "" };
    case "image-gen":
      return { title: "", modelId: "openai:gpt-image-2" };
    case "video-gen":
      return { title: "", modelId: "veo:veo-3.1-fast" };
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
    removedNodeIds: [],
    removedEdgeIds: [],
    onNodesChange: (changes) => {
      const removedIds = new Set(
        changes.filter((c): c is NodeRemoveChange => c.type === "remove").map((c) => c.id),
      );
      if (removedIds.size === 0) {
        set({ nodes: applyNodeChanges(changes, get().nodes) });
        return;
      }
      const cascadedEdges = get().edges.filter(
        (e) => removedIds.has(e.source) || removedIds.has(e.target),
      );
      set({
        nodes: applyNodeChanges(changes, get().nodes),
        edges: get().edges.filter(
          (e) => !removedIds.has(e.source) && !removedIds.has(e.target),
        ),
        removedNodeIds: [...get().removedNodeIds, ...removedIds],
        removedEdgeIds: [...get().removedEdgeIds, ...cascadedEdges.map((e) => e.id)],
      });
    },
    onEdgesChange: (changes) => {
      const removedEdgeIds = changes
        .filter((c): c is EdgeRemoveChange => c.type === "remove")
        .map((c) => c.id);
      set({
        edges: applyEdgeChanges(changes, get().edges),
        ...(removedEdgeIds.length > 0 && {
          removedEdgeIds: [...get().removedEdgeIds, ...removedEdgeIds],
        }),
      });
    },
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
    deleteNode: (id) => {
      const cascadedEdges = get().edges.filter(
        (e) => e.source === id || e.target === id,
      );
      set({
        nodes: get().nodes.filter((n) => n.id !== id),
        edges: get().edges.filter((e) => e.source !== id && e.target !== id),
        removedNodeIds: [...get().removedNodeIds, id],
        removedEdgeIds: [...get().removedEdgeIds, ...cascadedEdges.map((e) => e.id)],
      });
    },
    duplicateNode: async (id) => {
      const node = get().nodes.find((n) => n.id === id);
      if (!node || node.type === "kb") return;

      try {
        const res = await fetch(`/api/nodes/${id}/duplicate`, { method: "POST" });
        if (!res.ok) {
          console.error("Duplicate node failed:", await res.text());
          return;
        }
        const { node: newNode } = await res.json() as { node: { id: string; position: { x: number; y: number }; type: string; data: Record<string, unknown>; active_version_id: string | null } };

        const data = { ...(node.data as Record<string, unknown>), ...(newNode.data as Record<string, unknown>) };

        set({
          nodes: [
            ...get().nodes,
            {
              ...node,
              id: newNode.id,
              position: newNode.position,
              data,
              selected: false,
            } as AppNode,
          ],
        });
      } catch (err) {
        console.error("Duplicate node error:", err);
      }
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

    // Promote chosen compose ideas (D28) into sibling Shot nodes — the §15 "duplicate to
    // compare" move, one node per idea. Each sibling copies the SOURCE shot's narrowed
    // script with the idea's description swapped in. No edges (human wires each Shot ->
    // Prompt -> Image — D11). Capture of the compose run already happened server-side.
    promoteIdeasToShots: (shotNodeId, ideas) => {
      const src = get().nodes.find((n) => n.id === shotNodeId);
      if (!src || ideas.length === 0) return;
      const d = src.data as {
        script?: ReelScript;
        order?: number;
        seededFrom?: { scriptNodeId?: string; shotIndex?: number; scriptTitle?: string };
      };
      const baseScript = d.script ?? {};
      const vs = baseScript.visual_script ?? {};
      const firstShot = vs.shots?.[0] ?? {};
      const base = src.position;

      const created = ideas.map((idea, i) => ({
        id: crypto.randomUUID(),
        type: "shot",
        position: { x: base.x + 280, y: base.y + (i + 1) * 180 },
        data: {
          script: {
            ...baseScript,
            visual_script: { ...vs, shots: [{ ...firstShot, description: idea.description }] },
          },
          order: d.order,
          seededFrom: d.seededFrom,
        },
      })) as AppNode[];

      set({ nodes: [...get().nodes, ...created] }); // NO edges
    },

    clearRemoved: (nodeIds, edgeIds) => {
      const n = new Set(nodeIds);
      const e = new Set(edgeIds);
      set({
        removedNodeIds: get().removedNodeIds.filter((id) => !n.has(id)),
        removedEdgeIds: get().removedEdgeIds.filter((id) => !e.has(id)),
      });
    },

    videoGenStatus: {},

    setVideoGenGenerating: (nodeId, v) =>
      set((s) => ({
        videoGenStatus: {
          ...s.videoGenStatus,
          [nodeId]: {
            isGenerating: v,
            lastError: s.videoGenStatus[nodeId]?.lastError ?? null,
          },
        },
      })),

    setVideoGenError: (nodeId, err) =>
      set((s) => ({
        videoGenStatus: {
          ...s.videoGenStatus,
          [nodeId]: {
            isGenerating: s.videoGenStatus[nodeId]?.isGenerating ?? false,
            lastError: err,
          },
        },
      })),

    trayJobs: {},
    setTrayJobs: (jobs) =>
      set({ trayJobs: Object.fromEntries(jobs.map((j) => [j.id, j])) }),
    upsertTrayJob: (job) =>
      set((s) => ({ trayJobs: { ...s.trayJobs, [job.id]: job } })),

    focusedNodeId: null,
    setFocusedNodeId: (id) => set({ focusedNodeId: id }),

    guidedCreateNext: (sourceId) => {
      const state = get();
      const source = state.nodes.find((n) => n.id === sourceId);
      if (!source) return null;
      const plan = planGuidedNext(source, state.nodes, state.edges);
      if (!plan || !plan.gate.enabled) return null;
      if (plan.existingId) return plan.existingId; // navigate, no mutation

      const newId = crypto.randomUUID();
      const newNode = {
        id: newId,
        type: plan.nextType,
        position: plan.position,
        data: defaultData(plan.nextType),
      } as AppNode;
      const newEdges = plan.parentIds
        .filter((pid) => !wouldCreateCycle(state.edges, pid, newId))
        .map((pid) => ({ id: crypto.randomUUID(), source: pid, target: newId }));
      set({ nodes: [...state.nodes, newNode], edges: [...state.edges, ...newEdges] });
      return newId;
    },

    kbStatus: 'none',
    setKbStatus: (status) => set({ kbStatus: status }),
    kbJustReady: false,
    setKbJustReady: (v) => set({ kbJustReady: v }),
  }));
}

export type CanvasStore = ReturnType<typeof createCanvasStore>;
