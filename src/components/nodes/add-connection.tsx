"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandList } from "@/components/ui/command";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useClientId } from "@/components/canvas/client-id-context";
import { useCachedAvatars } from "@/hooks/queries/avatars";
import { canAcceptIncoming, canConnect, type AppNode } from "@/lib/canvas-nodes";
import { nodeLabel } from "@/lib/nodes/describe-node";
import { isGeneratedImageType } from "@/lib/nodes/image-node-types";
import { ADD_NODE_OPTIONS } from "@/lib/canvas-node-options";
import {
  storyboardPanelName,
  storyboardPanelOf,
  type LocationNodeData,
  type ProductNodeData,
  type StoryboardCompositeData,
} from "@/lib/scripts/asset-nodes";
import { AddConnectionItem } from "./add-connection-item";

// The candidate's image, when it has one: an image File's upload, a Draw's sketch,
// an Image Gen's generated still (`parsed` is its URL), an Avatar's front face (read from the
// avatars cache — the node itself holds only the id). Text-bearing nodes → none.
function thumbUrl(node: AppNode, faces: Map<string, { front: { url: string } | null }>): string | undefined {
  const d = node.data as Record<string, unknown>;
  if (node.type === "avatar")
    return typeof d.avatarId === "string" ? faces.get(d.avatarId)?.front?.url : undefined;
  if (node.type === "file")
    return d.fileKind === "image" && typeof d.fileUrl === "string" ? d.fileUrl : undefined;
  if (node.type === "draw") return typeof d.fileUrl === "string" ? d.fileUrl : undefined;
  if (isGeneratedImageType(node.type)) return typeof d.parsed === "string" ? d.parsed : undefined;
  // D450 — a script's product shows its main packshot; a location, its plate.
  if (node.type === "product") return (d as ProductNodeData).images?.[0]?.url;
  if (node.type === "location") return (d as LocationNodeData).image?.url ?? undefined;
  return undefined;
}

// The list is grouped by kind, in the order a person composing a shot reaches for them:
// the script first, then the places, products and people in it, then generated pictures.
// Kinds not named here follow in the order they first appear on the canvas.
const KIND_ORDER = ["script", "location", "product", "avatar", "storyboard", "shot", "multishot", "image-gen", "composite", "file", "draw"];
// Kinds that are never added by hand, so ADD_NODE_OPTIONS doesn't name them.
const EXTRA_KIND_LABEL: Record<string, string> = {
  location: "Location",
  product: "Product",
  avatar: "Avatar",
  storyboard: "Storyboard",
  shot: "Shots",
  multishot: "Multishot",
};

// D454 — a Composite that Fan out made for a shot is that shot's storyboard panel, not a
// hand-made composite: it gets its own group, and goes by its panel ("S3 storyboard").
function isStoryboardPanel(node: AppNode): boolean {
  const panel = (node.data as Partial<StoryboardCompositeData>).storyboardPanel;
  return node.type === "composite" && typeof panel === "string" && panel !== "";
}
function kindOf(node: AppNode): string {
  return isStoryboardPanel(node) ? "storyboard" : (node.type ?? "node");
}
function itemName(node: AppNode): { name: string; handle: string } {
  const label = nodeLabel(node);
  if (!isStoryboardPanel(node)) return label;
  const d = node.data as Partial<StoryboardCompositeData> & { parsed?: unknown };
  const panel = storyboardPanelOf(node, d.parsed);
  // No picture yet → still the sketch-to-be; name it by its panel all the same.
  return { ...label, name: panel ? storyboardPanelName(panel) : `${d.storyboardPanel} storyboard` };
}
function kindLabel(type: string): string {
  return EXTRA_KIND_LABEL[type] ?? ADD_NODE_OPTIONS.find((o) => o.type === type)?.label ?? type;
}
function kindRank(type: string): number {
  const i = KIND_ORDER.indexOf(type);
  return i === -1 ? KIND_ORDER.length : i;
}

// The "+" on a focus view's Connected header: pick a canvas node that MAY feed this node
// (canConnect(candidate → this)) and isn't already wired, then create the incoming edge.
// Reuses the same connection rule as the copilot and the manual drag path.
//
// `onConnected` is for views whose Connected list is server-derived rather than read
// straight off the store (video-gen fetches /api/nodes/[id]/upstream-images): the new
// edge only lands in the client store here, so those views must flush + refetch.
export function AddConnection({
  targetId,
  targetType,
  connectedIds,
  onConnected,
}: {
  targetId: string;
  targetType: string;
  connectedIds: string[];
  onConnected?: (sourceId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const nodes = useCanvasStore((s) => s.nodes);
  const connectNodes = useCanvasStore((s) => s.connectNodes);
  const canEdit = useCanvasEditable();
  const clientId = useClientId();
  // Avatar faces from the cache the canvas's Avatar nodes already filled — no request per row
  // (performance rule 1).
  const avatarIds = nodes.flatMap((n) => {
    const id = n.type === "avatar" ? (n.data as { avatarId?: unknown }).avatarId : undefined;
    return typeof id === "string" && id ? [id] : [];
  });
  const faces = useCachedAvatars(clientId, avatarIds);

  // D374 — a one-input target that already has its input offers no more (and renders nothing).
  if (!canEdit || !canAcceptIncoming(targetType, connectedIds.length)) return null;

  const candidates = nodes.filter(
    (n) =>
      n.id !== targetId &&
      !connectedIds.includes(n.id) &&
      canConnect(n.type ?? "", targetType),
  );
  const groups = new Map<string, AppNode[]>();
  for (const n of candidates) {
    const type = kindOf(n);
    const group = groups.get(type);
    if (group) group.push(n);
    else groups.set(type, [n]);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => kindRank(a) - kindRank(b));

  const pick = (sourceId: string) => {
    connectNodes(sourceId, targetId);
    setOpen(false);
    onConnected?.(sourceId);
  };

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
      <PopoverContent align="start" className="w-90 p-2.5">
        <Command>
          <CommandInput placeholder="Connect a node…" />
          {/* Headings stick while their group scrolls under them; a group must not clip
              (overflow-hidden) or the sticky heading has nothing to stick to. */}
          <CommandList className="mt-2 max-h-[min(520px,60vh)]">
            <CommandEmpty>No nodes available to connect.</CommandEmpty>
            {ordered.map(([type, items]) => {
              const label = kindLabel(type);
              const thumbs = new Map(items.map((n) => [n.id, thumbUrl(n, faces)]));
              // A kind with any picture is shown as cards; a text-only kind stays as rows.
              const asCards = [...thumbs.values()].some(Boolean);
              return (
                <CommandGroup
                  key={type}
                  heading={
                    <span className="flex items-center gap-1.5">
                      {/* .text-eyebrow is unlayered CSS, so its own color and size beat plain
                          utilities: the purple heading of the design needs them marked important. */}
                      <span className="text-eyebrow text-[11px]! font-semibold! tracking-[0.14em]! text-primary!">{label}</span>
                      <span className="ml-auto text-xs font-medium text-muted-foreground">{items.length}</span>
                    </span>
                  }
                  className={
                    "overflow-visible p-0 **:[[cmdk-group-heading]]:sticky **:[[cmdk-group-heading]]:top-0 **:[[cmdk-group-heading]]:z-10 **:[[cmdk-group-heading]]:bg-popover **:[[cmdk-group-heading]]:pt-2 **:[[cmdk-group-heading]]:pb-1 " +
                    (asCards
                      ? "**:[[cmdk-group-items]]:grid **:[[cmdk-group-items]]:grid-cols-2 **:[[cmdk-group-items]]:gap-x-3 **:[[cmdk-group-items]]:gap-y-3 **:[[cmdk-group-items]]:px-1 **:[[cmdk-group-items]]:pt-1.5 **:[[cmdk-group-items]]:pb-3"
                      : "**:[[cmdk-group-items]]:pb-2")
                  }
                >
                  {items.map((n) => {
                    const { name, handle } = itemName(n);
                    return (
                      <AddConnectionItem
                        key={n.id}
                        value={`${handle} ${name} ${label}`}
                        handle={handle}
                        name={name}
                        thumb={thumbs.get(n.id)}
                        fit={n.type === "product" ? "contain" : n.type === "avatar" ? "top" : "cover"}
                        layout={asCards ? "card" : "row"}
                        onSelect={() => pick(n.id)}
                      />
                    );
                  })}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
