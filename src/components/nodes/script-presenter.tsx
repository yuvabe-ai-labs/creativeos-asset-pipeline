"use client";

import { Plus, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useClientId } from "@/components/canvas/client-id-context";
import { useGalleryDrawer } from "@/components/canvas/gallery-drawer-context";
import { useAvatar } from "@/hooks/queries/avatars";
import { avatarVoiceLine, presenterEdge } from "@/lib/avatars/canvas";
import type { Avatar } from "@/lib/avatars/schema";

const ADD_CHIP =
  "nodrag h-auto gap-1 border border-dashed border-primary/40 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/5 hover:text-primary";

/** The script's presenter, read from the edge every time (D298) — nothing is stored on the
 *  Script. A gone avatar (deleted, or not this client's) is no presenter. */
function usePresenter(scriptId: string): { avatarNodeId: string; avatar: Avatar } | null {
  const clientId = useClientId();
  const edge = useCanvasStore((s) => presenterEdge(scriptId, s.nodes, s.edges));
  const avatarId = useCanvasStore((s) => {
    const node = edge ? s.nodes.find((n) => n.id === edge.source) : undefined;
    return (node?.data as { avatarId?: string } | undefined)?.avatarId ?? "";
  });
  const lookup = useAvatar(clientId, avatarId);
  return edge && lookup.avatar ? { avatarNodeId: edge.source, avatar: lookup.avatar } : null;
}

function Face({ avatar, size }: { avatar: Avatar; size: "sm" | "md" }) {
  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden rounded-full bg-muted", size === "sm" ? "size-5" : "size-10")}>
      {avatar.front ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar.front.url} alt="" className="size-full object-cover" />
      ) : (
        <UserRound className="size-3/5 text-muted-foreground/50" strokeWidth={1.5} />
      )}
    </span>
  );
}

// D298 — the presenter row on the Script card. With a presenter: its face and name, opening its
// focus view. Without one, once the script is parsed: the "+ Presenter" chip — casting comes
// after the script, so the chip waits for the parse.
export function ScriptPresenterRow({ scriptId, parsed }: { scriptId: string; parsed: boolean }) {
  const presenter = usePresenter(scriptId);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);
  const { openDrawer } = useGalleryDrawer();

  if (presenter) {
    return (
      <Button
        variant="ghost"
        onClick={() => setFocusedNodeId(presenter.avatarNodeId)}
        className="nodrag -mx-1.5 h-auto w-[calc(100%+0.75rem)] justify-start gap-2 px-1.5 py-1"
      >
        <Face avatar={presenter.avatar} size="sm" />
        <span className="min-w-0 truncate text-xs font-medium">{presenter.avatar.name}</span>
        <span className="ml-auto text-[0.65rem] text-muted-foreground">Avatar</span>
      </Button>
    );
  }
  if (!parsed) return null;
  return (
    <Button
      variant="ghost"
      onClick={() => openDrawer({ tab: "avatars", connectToNodeId: scriptId })}
      className={cn(ADD_CHIP, "self-start")}
    >
      <Plus className="size-3" strokeWidth={1.5} />
      Avatar
    </Button>
  );
}

// D298 — the Presenter block in the Script's focus view. `onOpenGallery` is the focus view's own
// close path followed by opening the gallery: the gallery cannot sit over a modal sheet, and
// closing first keeps the focus view's guard against unsaved edits.
export function ScriptPresenterBlock({ scriptId, onOpenGallery }: { scriptId: string; onOpenGallery: () => void }) {
  const presenter = usePresenter(scriptId);
  const disconnectNodes = useCanvasStore((s) => s.disconnectNodes);

  if (!presenter) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" onClick={onOpenGallery} className={ADD_CHIP}>
          <Plus className="size-3" strokeWidth={1.5} />
          Add an avatar
        </Button>
        <span className="text-xs text-muted-foreground">
          Optional. The avatar whose face and voice this script&apos;s stills and videos use.
        </span>
      </div>
    );
  }

  const { avatar } = presenter;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Face avatar={avatar} size="md" />
      <div className="flex min-w-0 flex-col">
        <span className="text-eyebrow text-muted-foreground">Avatar</span>
        <span className="text-sm font-medium">
          {avatar.name}
          <span className="font-normal text-muted-foreground"> · {avatarVoiceLine(avatar.voice)}</span>
        </span>
        <span className="max-w-prose text-xs text-muted-foreground">
          On-camera shots from this script use {avatar.name}&apos;s face and voice when they&apos;re made into stills and videos.
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={onOpenGallery}>Change</Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => disconnectNodes(presenter.avatarNodeId, scriptId)}
        >
          Remove
        </Button>
      </div>
    </div>
  );
}
