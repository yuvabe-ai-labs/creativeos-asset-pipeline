"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { canConnect, type AppNode } from "@/lib/canvas-nodes";
import { nodeLabel } from "@/lib/nodes/describe-node";

// The candidate's image, when it has one: an image File's upload, a Draw's sketch,
// an Image Gen's generated still (`parsed` is its URL). Text-bearing nodes → none.
function thumbUrl(node: AppNode): string | undefined {
  const d = node.data as Record<string, unknown>;
  if (node.type === "file")
    return d.fileKind === "image" && typeof d.fileUrl === "string" ? d.fileUrl : undefined;
  if (node.type === "draw") return typeof d.fileUrl === "string" ? d.fileUrl : undefined;
  if (node.type === "image-gen") return typeof d.parsed === "string" ? d.parsed : undefined;
  return undefined;
}

// The "+" on a focus view's Connected header: pick a canvas node that MAY feed this node
// (canConnect(candidate → this)) and isn't already wired, then create the incoming edge.
// Reuses the same connection rule as the copilot and the manual drag path.
export function AddConnection({
  targetId,
  targetType,
  connectedIds,
}: {
  targetId: string;
  targetType: string;
  connectedIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const nodes = useCanvasStore((s) => s.nodes);
  const connectNodes = useCanvasStore((s) => s.connectNodes);

  const candidates = nodes.filter(
    (n) =>
      n.id !== targetId &&
      !connectedIds.includes(n.id) &&
      canConnect(n.type ?? "", targetType),
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          // Design system: "Add" actions are discoverable dashed-border primary chips,
          // never faint icon-only buttons (same scale as GuidedNextButton's chip).
          <Button
            variant="ghost"
            size="xs"
            type="button"
            aria-label="Add a connection"
            className="h-auto gap-1 rounded-md border border-dashed border-primary/40 px-2 py-1 text-[0.65rem] font-medium text-primary hover:bg-primary/5"
          >
            <Plus className="size-3" strokeWidth={1.5} />
            Add
          </Button>
        }
      />
      <PopoverContent align="start" className="w-56 p-0">
        <Command>
          <CommandInput placeholder="Connect a node…" />
          <CommandList>
            <CommandEmpty>No nodes available to connect.</CommandEmpty>
            <CommandGroup>
              {candidates.map((n) => {
                const { name, handle } = nodeLabel(n);
                const thumb = thumbUrl(n);
                return (
                  <CommandItem
                    key={n.id}
                    value={`${handle} ${name}`}
                    onSelect={() => {
                      connectNodes(n.id, targetId);
                      setOpen(false);
                    }}
                    className="flex items-center gap-2"
                  >
                    {thumb && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt=""
                        className="size-8 shrink-0 rounded-md border border-border object-cover"
                      />
                    )}
                    <span className="text-eyebrow text-[9px] text-primary">{handle}</span>
                    <span className="truncate">{name}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
