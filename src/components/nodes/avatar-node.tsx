"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Pencil, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useClientId } from "@/components/canvas/client-id-context";
import { useSavedAvatars } from "@/hooks/use-saved-avatars";
import { useDeleteNode } from "@/hooks/use-delete-node";
import type { AvatarNodeData } from "@/lib/canvas-nodes";
import type { SavedAvatar } from "@/lib/avatars/local-store";
import { AvatarSilhouette } from "@/components/avatar/avatar-silhouette";
import { NodeContextMenu } from "./node-context-menu";
import { NodeCardHeader } from "./node-card-header";

// Avatar node — places one of the client's saved avatars (Settings → Avatar) on the canvas.
// Picking one snapshots its name, portrait and voice into node.data; the output handle wires
// it to Video Gen ahead of avatar-driven generation (nothing reads it yet).
export function AvatarNode({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const deleteNode = useDeleteNode();
  const avatars = useSavedAvatars(useClientId()) ?? [];
  // The canvas route is /clients/[id]/canvases/[cid], where [id] is the client slug.
  const { id: clientSlug } = useParams<{ id: string }>();
  const avatarsHref = `/clients/${clientSlug}/avatar`;
  const d = data as AvatarNodeData;
  const picked = Boolean(d.avatarId);

  function pick(avatarId: string) {
    const a = avatars.find((x: SavedAvatar) => x.id === avatarId);
    if (!a) return;
    updateNodeData(id, {
      avatarId: a.id,
      name: a.name,
      imageDataUrl: a.imageDataUrl,
      voiceName: a.voice?.name ?? null,
    });
  }

  const picker = (
    <Select
      items={Object.fromEntries(avatars.map((a) => [a.id, a.name]))}
      value={d.avatarId ?? null}
      onValueChange={(v) => v && pick(String(v))}
    >
      <SelectTrigger size="sm" className="nodrag w-full text-xs" aria-label="Choose an avatar">
        <SelectValue placeholder={avatars.length ? "Choose an avatar" : "No saved avatars"} />
      </SelectTrigger>
      <SelectContent>
        {avatars.map((a) => (
          <SelectItem key={a.id} value={a.id} className="text-xs">
            {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <NodeContextMenu onDuplicate={() => duplicateNode(id)} onDelete={() => deleteNode(id)}>
      <div
        className={cn(
          "w-60 rounded-lg border border-border bg-card shadow-card",
          selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        )}
      >
        <NodeCardHeader icon={UserRound} nodeId={id} nodeType="avatar" title="Avatar" />

        <div className="flex flex-col gap-2.5 p-2.5">
          {picked ? (
            <>
              <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-border bg-muted/40">
                {d.imageDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local data URL snapshot
                  <img src={d.imageDataUrl} alt="" className="size-full object-cover" />
                ) : (
                  <AvatarSilhouette className="size-full px-6 pt-8" />
                )}
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  className="nodrag absolute right-2 top-2 h-7 gap-1 rounded-full bg-card/90 px-2.5 text-xs backdrop-blur"
                  render={<Link href={`${avatarsHref}/${d.avatarId}`} />}
                >
                  <Pencil className="size-3" strokeWidth={1.5} />
                  Edit
                </Button>
              </div>
              <div className="flex flex-col gap-0.5 px-0.5">
                <span className="truncate text-sm font-medium">{d.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {d.voiceName ? `Voice: ${d.voiceName}` : "No voice set"}
                </span>
              </div>
              {picker}
            </>
          ) : (
            <>
              <div className="flex aspect-[3/4] items-end justify-center overflow-hidden rounded-md border border-dashed border-border bg-muted/30">
                <AvatarSilhouette className="size-full px-6 pt-8" />
              </div>
              {picker}
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                className="nodrag border-dashed border-primary/40 text-xs hover:bg-primary/5"
                render={<Link href={avatarsHref} />}
              >
                Manage avatars
              </Button>
            </>
          )}
        </div>

        <Handle type="source" position={Position.Right} className="!size-4 !border-2 !border-card !bg-primary" />
      </div>
    </NodeContextMenu>
  );
}
