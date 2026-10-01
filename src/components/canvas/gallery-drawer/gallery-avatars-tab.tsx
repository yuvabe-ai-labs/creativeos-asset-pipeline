"use client";

import Link from "next/link";
import type { XYPosition } from "@xyflow/react";
import { ArrowUpRight, Plus, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientSlug } from "@/components/canvas/client-id-context";
import { useLibraryAvatars } from "@/hooks/queries/avatars";
import { useAddAvatarNode } from "@/hooks/use-add-avatar-node";
import { AVATAR_DRAG_MIME, avatarVoiceLine } from "@/lib/avatars/canvas";

type Props = {
  clientId: string;
  /** Set when the drawer was opened from a Script's "+ Presenter" or "Change": choosing an
   *  avatar connects it to that script. */
  connectToNodeId?: string;
  /** Where a tile's add button places the node when nothing is being connected. */
  defaultPosition: () => XYPosition;
  onDone: () => void;
};

// D298 — the gallery's Avatars tab: the client's saved avatars. Drag a tile onto the canvas, or
// onto a Script to make it the presenter; or use a tile's button.
export function GalleryAvatarsTab({ clientId, connectToNodeId, defaultPosition, onDone }: Props) {
  const clientSlug = useClientSlug();
  const avatars = useLibraryAvatars(clientId);
  const addAvatarNode = useAddAvatarNode();
  const libraryHref = `/clients/${clientSlug}/avatars`;

  if (avatars.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="aspect-[3/4] w-full rounded-lg" />)}
      </div>
    );
  }

  if (avatars.isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-sm text-muted-foreground">Could not load the avatars.</p>
        <Button variant="outline" size="sm" onClick={() => void avatars.refetch()}>Try again</Button>
      </div>
    );
  }

  const list = avatars.data ?? [];
  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <UserRound className="size-10 text-muted-foreground/40" strokeWidth={1.5} />
        <p className="text-sm text-muted-foreground">No avatars yet. Create one in Brand settings → Avatars</p>
        <Button size="sm" nativeButton={false} render={<Link href={libraryHref} target="_blank" rel="noopener" />}>
          Create an avatar
          <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        {connectToNodeId
          ? "Choose who presents this script."
          : "Drag an avatar onto the canvas, or onto a script to make it the presenter."}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {list.map((avatar) => (
          <div
            key={avatar.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(AVATAR_DRAG_MIME, JSON.stringify({ avatarId: avatar.id }));
              e.dataTransfer.effectAllowed = "copy";
            }}
            className="flex cursor-grab flex-col gap-1.5 rounded-lg border bg-card p-1.5 active:cursor-grabbing"
          >
            <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-muted">
              {avatar.front ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar.front.url} alt="" draggable={false} className="size-full object-cover" />
              ) : (
                <UserRound className="absolute inset-0 m-auto size-8 text-muted-foreground/40" strokeWidth={1.5} />
              )}
            </div>
            <div className="flex items-center gap-1.5 px-0.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{avatar.name || "Untitled avatar"}</p>
                <p className="truncate text-xs text-muted-foreground">{avatarVoiceLine(avatar.voice)}</p>
              </div>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={connectToNodeId ? `Make ${avatar.name} the presenter` : `Add ${avatar.name} to the canvas`}
                title={connectToNodeId ? "Make the presenter" : "Add to canvas"}
                onClick={() => {
                  addAvatarNode(avatar.id, { position: defaultPosition(), presenterOf: connectToNodeId });
                  if (connectToNodeId) onDone();
                }}
              >
                <Plus className="size-3.5" strokeWidth={1.5} />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <Button
        variant="link"
        size="sm"
        className="self-start px-0"
        nativeButton={false}
        render={<Link href={libraryHref} target="_blank" rel="noopener" />}
      >
        Manage avatars
        <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
      </Button>
    </div>
  );
}
