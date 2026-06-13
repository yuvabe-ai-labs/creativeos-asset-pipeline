"use client";

import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  SelectionMode,
  type Connection,
  type Edge,
  type NodeTypes,
  type XYPosition,
} from "@xyflow/react";
import { useShallow } from "zustand/react/shallow";
import { VALID_CONNECTIONS } from "@/lib/canvas-nodes";
import { ScriptNode } from "@/components/nodes/script-node";
import { KBNode } from "@/components/nodes/kb-node";
import { FileNode } from "@/components/nodes/file-node";
import { TextNode } from "@/components/nodes/text-node";
import { PromptNode } from "@/components/nodes/prompt-node";
import { ShotNode } from "@/components/nodes/shot-node";
import { useCanvasStore } from "./canvas-store-provider";
import { CanvasAutosave } from "./canvas-autosave";
import { CanvasContextMenu } from "./canvas-context-menu";

// Register custom node types once (stable reference — never inline this object).
const nodeTypes: NodeTypes = {
  script: ScriptNode,
  kb: KBNode,
  file: FileNode,
  text: TextNode,
  prompt: PromptNode,
  shot: ShotNode,
};

export function Canvas({ canvasId }: { canvasId: string }) {
  // One subscription, shallow-compared, so the component only re-renders when
  // these slices actually change.
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    connectNodes,
    duplicateNode,
  } = useCanvasStore(
    useShallow((s) => ({
      nodes: s.nodes,
      edges: s.edges,
      onNodesChange: s.onNodesChange,
      onEdgesChange: s.onEdgesChange,
      onConnect: s.onConnect,
      addNode: s.addNode,
      connectNodes: s.connectNodes,
      duplicateNode: s.duplicateNode,
    })),
  );

  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const rfRef = useRef<{
    screenToFlowPosition: (pos: { x: number; y: number }) => XYPosition;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    screenX: number;
    screenY: number;
    flowPos: XYPosition;
  } | null>(null);

  const handleAddNode = useCallback(
    (type: string, position: XYPosition) => {
      const newNodeId = crypto.randomUUID();
      addNode(type, position, newNodeId);
      if (type === "script") {
        const kbNode = nodesRef.current.find((n) => n.type === "kb");
        if (kbNode) connectNodes(kbNode.id, newNodeId);
      }
    },
    [addNode, connectNodes],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        e.preventDefault();
        nodesRef.current
          .filter((n) => n.selected && n.type !== "kb")
          .forEach((n) => duplicateNode(n.id));
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [duplicateNode]);

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const source = nodes.find((n) => n.id === connection.source);
      const target = nodes.find((n) => n.id === connection.target);
      if (!source || !target) return false;
      if (
        !(VALID_CONNECTIONS[source.type ?? ""] ?? []).includes(
          target.type ?? "",
        )
      )
        return false;
      // script → prompt: one script can only wire to a single prompt
      if (source.type === "script" && target.type === "prompt") {
        const alreadyConnected = edges.some(
          (e) =>
            e.source === connection.source &&
            nodes.find((n) => n.id === e.target)?.type === "prompt",
        );
        if (alreadyConnected) return false;
      }
      // shot → prompt: only one shot input per prompt
      if (source.type === "shot" && target.type === "prompt") {
        const alreadyShotConnected = edges.some(
          (e) =>
            e.target === connection.target &&
            nodes.find((n) => n.id === e.source)?.type === "shot",
        );
        if (alreadyShotConnected) return false;
      }
      // file → prompt: max 5 file inputs per prompt node
      if (source.type === "file" && target.type === "prompt") {
        const fileInputCount = edges.filter(
          (e) =>
            e.target === connection.target &&
            nodes.find((n) => n.id === e.source)?.type === "file",
        ).length;
        if (fileInputCount >= 5) return false;
      }
      return true;
    },
    [nodes, edges],
  );

  // Render Script -> Shot edges dashed: they are lineage/provenance (D21), NOT live
  // data flow. Derived from node types so it survives reload without a schema change.
  const nodeTypeById = useMemo(() => {
    const m = new Map<string, string | undefined>();
    for (const n of nodes) m.set(n.id, n.type);
    return m;
  }, [nodes]);
  const displayEdges = useMemo(
    () =>
      edges.map((e) =>
        nodeTypeById.get(e.source) === "script" &&
        nodeTypeById.get(e.target) === "shot"
          ? {
              ...e,
              animated: true,
              style: {
                strokeDasharray: "6 4",
                stroke: "var(--muted-foreground)",
              },
            }
          : e,
      ),
    [edges, nodeTypeById],
  );

  return (
    <div className="absolute inset-0 bg-[var(--neutral-50)]">
      <CanvasAutosave canvasId={canvasId} />

      {contextMenu && (
        <CanvasContextMenu
          screenX={contextMenu.screenX}
          screenY={contextMenu.screenY}
          onSelect={(type) => handleAddNode(type, contextMenu.flowPos)}
          onClose={() => setContextMenu(null)}
        />
      )}

      <ReactFlow
        nodes={nodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        deleteKeyCode={["Backspace", "Delete"]}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        selectionKeyCode={null}
        panOnScroll
        panOnDrag={[1]}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        proOptions={{ hideAttribution: true }}
        className="!bg-transparent"
        onInit={(instance) => {
          rfRef.current = instance;
        }}
        onPaneContextMenu={(e) => {
          e.preventDefault();
          if (!rfRef.current) return;
          const flowPos = rfRef.current.screenToFlowPosition({
            x: e.clientX,
            y: e.clientY,
          });
          setContextMenu({ screenX: e.clientX, screenY: e.clientY, flowPos });
        }}
        onPaneClick={() => setContextMenu(null)}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={48}
          size={2}
          color="rgba(148,163,184,0.45)"
        />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
