"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { canConnect } from "@/lib/canvas-nodes";
import { nodeLabel } from "@/lib/nodes/describe-node";

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
          <Button
            variant="ghost"
            size="xs"
            type="button"
            title="Add a connection"
            className="size-5 rounded p-0 text-muted-foreground hover:text-primary"
          >
            <Plus className="size-3.5" />
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
