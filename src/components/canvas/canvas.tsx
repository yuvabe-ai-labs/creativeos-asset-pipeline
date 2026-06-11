"use client";

import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type Connection,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import { useShallow } from "zustand/react/shallow";
import { VALID_CONNECTIONS } from "@/lib/canvas-nodes";
import { Plus, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScriptNode } from "@/components/nodes/script-node";
import { KBNode } from "@/components/nodes/kb-node";
import { FileNode } from "@/components/nodes/file-node";
import { useCanvasStore } from "./canvas-store-provider";
import { CanvasAutosave } from "./canvas-autosave";

// Register custom node types once (stable reference — never inline this object).
const nodeTypes: NodeTypes = { script: ScriptNode, kb: KBNode, file: FileNode };

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
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

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
      return (VALID_CONNECTIONS[source.type ?? ""] ?? []).includes(
        target.type ?? "",
      );
    },
    [nodes],
  );

  return (
    <div className="absolute inset-0 bg-[var(--neutral-50)]">
      <CanvasAutosave canvasId={canvasId} />
      <div className="absolute left-4 top-4 z-10 flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            const position = {
              x: 120 + Math.random() * 220,
              y: 80 + Math.random() * 140,
            };
            // Generate the new node ID before adding so we can wire the edge.
            const newNodeId = crypto.randomUUID();
            addNode("script", position, newNodeId);
            // Auto-connect to the KB node if one exists on this canvas.
            const kbNode = nodes.find((n) => n.type === "kb");
            if (kbNode) connectNodes(kbNode.id, newNodeId);
          }}
        >
          <Plus className="size-4" /> Add script node
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const position = {
              x: 120 + Math.random() * 220,
              y: 80 + Math.random() * 140,
            };
            addNode("file", position);
          }}
        >
          <Paperclip className="size-4" /> Add file node
        </Button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        deleteKeyCode={["Backspace", "Delete"]}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        proOptions={{ hideAttribution: true }}
        className="!bg-transparent"
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
