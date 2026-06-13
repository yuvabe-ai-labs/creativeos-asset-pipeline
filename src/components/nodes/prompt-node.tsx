"use client";

import { useMemo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { savePromptOutputAction } from "@/lib/actions/nodes";
import { PromptFocusView } from "./prompt-focus-view";
import { DEFAULT_IMAGE_PROMPT_SLICES, type KBSliceKey } from "@/lib/kb/parse-context";
import { NodeContextMenu } from "./node-context-menu";

const TYPE_LABEL: Record<string, string> = { script: "Script", text: "Note", prompt: "Prompt", kb: "Brand KB", file: "File", shot: "Shot" };

// Prompt node. A compact launcher; double-click / Open hands off to the Prompt
// focus view. The Inputs panel's connected-node list is derived from the store graph.
export function PromptNode({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNode = useCanvasStore((s) => s.deleteNode);
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  // Select the raw store slices (stable references) and DERIVE the upstream list
  // with useMemo. Returning a freshly-built array of objects straight from the
  // selector breaks useSyncExternalStore caching (useShallow only stabilizes one
  // level deep, so the inner {id,label} objects never compare equal) → the
  // "getSnapshot should be cached" infinite-loop error once the list is non-empty.
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const upstream = useMemo(() => {
    const sourceIds = edges.filter((e) => e.target === id).map((e) => e.source);
    const directNodes = nodes.filter((n) => sourceIds.includes(n.id));

    // For each Shot upstream, also surface its seeded-from Script as "Full reel script"
    // so the Connected panel shows the full creative brief alongside the specific shot.
    const extraScriptIds = new Set<string>();
    for (const n of directNodes) {
      if (n.type === "shot") {
        const sf = (n.data as Record<string, unknown>).seededFrom as
          | { scriptNodeId?: string }
          | undefined;
        if (sf?.scriptNodeId && !sourceIds.includes(sf.scriptNodeId)) {
          extraScriptIds.add(sf.scriptNodeId);
        }
      }
    }
    const extraScripts = nodes
      .filter((n) => extraScriptIds.has(n.id))
      .map((n) => ({ id: n.id, label: "Full reel script", type: n.type ?? "script" }));

    return [
      ...directNodes.map((n) => {
        const d = n.data as Record<string, unknown>;
        return {
          id: n.id,
          label: TYPE_LABEL[n.type ?? ""] ?? String(n.type),
          type: n.type ?? "",
          fileUrl: n.type === "file" ? (d.fileUrl as string | undefined) : undefined,
          fileKind: n.type === "file" ? (d.fileKind as string | undefined) : undefined,
          useLlm: n.type === "file" ? (d.useLlm as boolean | undefined) : undefined,
        };
      }),
      ...extraScripts,
    ];
  }, [nodes, edges, id]);

  const d = data as { title?: string; instruction?: string; parsed?: unknown; kbSlices?: KBSliceKey[] };
  const title = d.title ?? "";
  const instruction = d.instruction ?? "";
  const output = (d.parsed ?? null) as string | null;
  const slices = d.kbSlices ?? DEFAULT_IMAGE_PROMPT_SLICES;
  const [focusOpen, setFocusOpen] = useState(false);

  return (
    <NodeContextMenu onDuplicate={() => duplicateNode(id)} onDelete={() => deleteNode(id)}>
    <div
      onDoubleClick={(e) => {
        e.stopPropagation();
        setFocusOpen(true);
      }}
      className={cn(
        "w-44 rounded-lg border border-border bg-card shadow-card",
        "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
        selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-primary" />
          <span className="text-eyebrow !text-[0.65rem]">Prompt</span>
        </div>
        <span
          className={cn("size-1.5 rounded-full", output ? "bg-primary" : "bg-muted-foreground/40")}
          title={output ? "Generated" : "Not generated"}
        />
      </div>

      <div className="px-3 py-3">
        <p className="truncate font-display text-sm font-medium">
          {title || <span className="text-muted-foreground">Image prompt</span>}
        </p>
        <button
          onClick={() => setFocusOpen(true)}
          className="nodrag -mx-1.5 mt-3 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        >
          Open ↗
        </button>
      </div>

      <PromptFocusView
        open={focusOpen}
        onOpenChange={setFocusOpen}
        nodeId={id}
        title={title}
        instruction={instruction}
        output={output}
        slices={slices}
        upstream={upstream}
        onPatch={(patch) => updateNodeData(id, patch)}
        onSaveOutput={(o) => savePromptOutputAction(id, o)}
      />

      <Handle
        type="target"
        position={Position.Left}
        className="!size-2 !border-2 !border-card !bg-muted-foreground"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!size-2 !border-2 !border-card !bg-primary"
      />
    </div>
    </NodeContextMenu>
  );
}
