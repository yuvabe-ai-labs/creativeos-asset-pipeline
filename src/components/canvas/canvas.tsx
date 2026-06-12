"use client";

import "@xyflow/react/dist/style.css";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type NodeTypes,
} from "@xyflow/react";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScriptNode } from "@/components/nodes/script-node";
import { KBNode } from "@/components/nodes/kb-node";
import { TextNode } from "@/components/nodes/text-node";
import { PromptNode } from "@/components/nodes/prompt-node";
import { ShotNode } from "@/components/nodes/shot-node";
import { useCanvasStore } from "./canvas-store-provider";
import { CanvasAutosave } from "./canvas-autosave";

// Register custom node types once (stable reference — never inline this object).
const nodeTypes: NodeTypes = { script: ScriptNode, kb: KBNode, text: TextNode, prompt: PromptNode, shot: ShotNode };

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
        nodeTypeById.get(e.source) === "script" && nodeTypeById.get(e.target) === "shot"
          ? { ...e, animated: true, style: { strokeDasharray: "6 4", stroke: "var(--muted-foreground)" } }
          : e,
      ),
    [edges, nodeTypeById],
  );

  return (
    <div className="absolute inset-0 bg-[var(--neutral-50)]">
      <CanvasAutosave canvasId={canvasId} />
      <div className="absolute left-4 top-4 z-10">
        <Popover>
          <PopoverTrigger
            render={
              <Button size="sm">
                <Plus className="size-4" /> Add node
              </Button>
            }
          />
          <PopoverContent align="start" className="w-44 gap-1 p-1">
            {([
              { type: "script", label: "Script" },
              { type: "text", label: "Note" },
              { type: "prompt", label: "Prompt" },
            ] as const).map((opt) => (
              <button
                key={opt.type}
                type="button"
                onClick={() => {
                  const position = {
                    x: 120 + Math.random() * 220,
                    y: 80 + Math.random() * 140,
                  };
                  const newNodeId = crypto.randomUUID();
                  addNode(opt.type, position, newNodeId);
                  // Script nodes auto-wire to the KB node if one exists (Stage 1 behavior).
                  if (opt.type === "script") {
                    const kbNode = nodes.find((n) => n.type === "kb");
                    if (kbNode) connectNodes(kbNode.id, newNodeId);
                  }
                }}
                className="w-full rounded-md px-2.5 py-1.5 text-left text-sm font-medium transition-colors hover:bg-muted"
              >
                {opt.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={displayEdges}
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
