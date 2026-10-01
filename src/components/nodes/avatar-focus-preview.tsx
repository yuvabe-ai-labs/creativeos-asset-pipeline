"use client";

import Link from "next/link";
import { Clapperboard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useClientId } from "@/components/canvas/client-id-context";
import { useVoicePreviewQuery } from "@/hooks/queries/avatars";
import { isVoicePreviewStale, voiceDeclarationKey } from "@/lib/avatars/voice-preview";
import type { Avatar } from "@/lib/avatars/schema";
import { AvatarGeneratingTile } from "@/components/avatars/avatar-generating-tile";

// D298 — the focus view's preview column: the avatar's latest voice-preview clip, read from the
// same TanStack query the Studio uses (D300), so a preview made in the Studio shows here too.
export function AvatarFocusPreview({ avatar, studioHref }: { avatar: Avatar; studioHref: string }) {
  const clientId = useClientId();
  const query = useVoicePreviewQuery(clientId, avatar.id, voiceDeclarationKey(avatar.voice));
  const preview = query.data?.preview ?? null;

  if (query.isLoading) return <AvatarGeneratingTile label="Loading the preview…" className="aspect-[9/16] w-full max-w-[16rem] rounded-xl" />;

  if (preview?.status === "running") {
    return <AvatarGeneratingTile label="Making the preview…" className="aspect-[9/16] w-full max-w-[16rem] rounded-xl" />;
  }

  if (preview?.status !== "succeeded" || !preview.url) {
    return (
      <div className="flex aspect-[9/16] w-full max-w-[16rem] flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-center">
        <Clapperboard className="size-6 text-muted-foreground" strokeWidth={1.5} />
        <p className="text-sm font-medium">No preview yet</p>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={studioHref} target="_blank" rel="noopener" />}
        >
          Make one in the Studio
        </Button>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-[16rem] flex-col gap-2">
      <video
        key={preview.url}
        src={preview.url}
        controls
        playsInline
        preload="metadata"
        className="aspect-[9/16] w-full rounded-xl border bg-muted object-cover"
      />
      <p className="text-xs text-muted-foreground">
        {preview.voiceName ? `${preview.voiceName} · ` : ""}“{preview.line}”
      </p>
      {isVoicePreviewStale(preview, avatar) && (
        <Badge variant="outline" className="self-start border-warning/40 bg-warning/15 text-warning-text">
          Out of date — the face or voice changed since
        </Badge>
      )}
    </div>
  );
}
