"use client";

import "@xyflow/react/dist/style.css";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type NodeTypes,
} from "@xyflow/react";
import { useShallow } from "zustand/react/shallow";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BriefNode } from "@/components/nodes/brief-node";
import { KBNode } from "@/components/nodes/kb-node";
import { useCanvasStore } from "./canvas-store-provider";
import { CanvasAutosave } from "./canvas-autosave";

// Register custom node types once (stable reference — never inline this object).
const nodeTypes: NodeTypes = { brief: BriefNode, kb: KBNode };

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
  } = useCanvasStore(
    useShallow((s) => ({
      nodes: s.nodes,
      edges: s.edges,
      onNodesChange: s.onNodesChange,
      onEdgesChange: s.onEdgesChange,
      onConnect: s.onConnect,
      addNode: s.addNode,
      connectNodes: s.connectNodes,
    })),
  );

  return (
    <div className="absolute inset-0 bg-[var(--neutral-50)]">
      <CanvasAutosave canvasId={canvasId} />
      <div className="absolute left-4 top-4 z-10">
        <Button
          size="sm"
          onClick={() => {
            const position = {
              x: 120 + Math.random() * 220,
              y: 80 + Math.random() * 140,
            };
            // Generate the new node ID before adding so we can wire the edge.
            const newNodeId = crypto.randomUUID();
            addNode("brief", position, newNodeId);
            // Auto-connect to the KB node if one exists on this canvas.
            const kbNode = nodes.find((n) => n.type === "kb");
            if (kbNode) connectNodes(kbNode.id, newNodeId);
          }}
        >
          <Plus className="size-4" /> Add brief node
        </Button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
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
