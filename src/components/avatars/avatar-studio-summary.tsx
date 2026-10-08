"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { avatarWorksWith } from "@/lib/avatars/generation";
import { avatarFaceLabel, sheetStatusLabel } from "@/lib/avatars/studio";
import { avatarVoiceLabel } from "@/lib/avatars/voice";
import type { Avatar } from "@/lib/avatars/schema";
import { FullScreenImageZoom } from "@/components/shared/full-screen-image-zoom";

// D297 — the avatar so far, beside every step: its face, what it has, and the names of the video
// models it can be used with. It carries no Save and no Archive; those have their own places.
export function AvatarStudioSummary({ avatar, name }: { avatar: Avatar | null; name: string }) {
  const [zoomed, setZoomed] = useState(false);
  const models = avatar ? avatarWorksWith(avatar) : [];
  const native = avatar?.voice?.mode === "native";

  return (
    <Card className="flex flex-col gap-3 self-start p-4 shadow-card lg:sticky lg:top-6">
      <div className="grid aspect-square place-items-center overflow-hidden rounded-lg bg-muted">
        {avatar?.front ? (
          <Button
            variant="ghost"
            aria-label="View the front image full size"
            className="size-full cursor-zoom-in rounded-none p-0"
            onClick={() => setZoomed(true)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatar.front.url} alt="" className="size-full object-cover" />
          </Button>
        ) : (
          <UserRound className="size-10 text-muted-foreground/40" strokeWidth={1.5} />
        )}
      </div>

      <p className="break-words font-display text-lg font-semibold">{name.trim() || "Untitled avatar"}</p>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Face</dt>
        <dd className="text-right font-medium">{(avatar && avatarFaceLabel(avatar)) ?? "—"}</dd>
        <dt className="text-muted-foreground">Profile sheet</dt>
        <dd className="text-right font-medium">{sheetStatusLabel(avatar, "Optional")}</dd>
        <dt className="text-muted-foreground">Voice</dt>
        <dd className="text-right font-medium">{avatarVoiceLabel(avatar?.voice ?? null) ?? "Optional"}</dd>
        {native && (
          <>
            <dt className="text-muted-foreground">Voice kept</dt>
            <dd className="text-right font-medium">
              {avatar?.voiceSample ? `${avatar.voiceSample.durationSeconds.toFixed(1)} s saved` : "Not yet"}
            </dd>
          </>
        )}
      </dl>

      <div className="flex flex-col gap-2 border-t pt-3">
        <p className="text-eyebrow text-muted-foreground">Works with</p>
        {models.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {models.map((model) => <Badge key={model} variant="outline">{model}</Badge>)}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Pick a front image first.</p>
        )}
      </div>
      {zoomed && avatar?.front && (
        <FullScreenImageZoom imageUrl={avatar.front.url} title="Front image" onClose={() => setZoomed(false)} />
      )}
    </Card>
  );
}
