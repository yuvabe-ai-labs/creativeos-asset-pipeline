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
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScriptNode } from "@/components/nodes/script-node";
import { KBNode } from "@/components/nodes/kb-node";
import { FileNode } from "@/components/nodes/file-node";
import { TextNode } from "@/components/nodes/text-node";
import { PromptNode } from "@/components/nodes/prompt-node";
import { useCanvasStore } from "./canvas-store-provider";
import { CanvasAutosave } from "./canvas-autosave";

// Register custom node types once (stable reference — never inline this object).
const nodeTypes: NodeTypes = { script: ScriptNode, kb: KBNode, file: FileNode, text: TextNode, prompt: PromptNode };

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
              { type: "file", label: "File" },
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
