"use client";

import { useState } from "react";
import { Loader2, Play, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AvatarCreditCost } from "@/components/avatars/avatar-credit-cost";
import { useAvatarVoicePreview } from "@/hooks/use-avatar-voice-preview";
import {
  defaultVoicePreviewLine, isVoicePreviewStale, voiceDeclarationKey, voicePreviewBlocker,
} from "@/lib/avatars/voice-preview";
import type { Avatar } from "@/lib/avatars/schema";

// Asked for in testing: once a voice is set, see and hear the avatar from the cast card. The
// Studio's preview (D294) made compact: the same hook, the same spoken line, the same billing;
// the clip opens in a dialog rather than taking the card's space.
export function CastSlotPreview({ clientId, avatar, disabled, onSettled }: {
  clientId: string;
  avatar: Avatar;
  /** The card is busy (a voice being saved, a face being made): a preview now would be stale. */
  disabled: boolean;
  /** Must be a stable callback: a new identity restarts the preview's poll. */
  onSettled: (avatarId: string) => void;
}) {
  const [watching, setWatching] = useState(false);
  const p = useAvatarVoicePreview({
    clientId, avatarId: avatar.id, declaration: voiceDeclarationKey(avatar.voice), onSettled,
  });
  if (!avatar.voice) return null;

  const busy = p.starting || p.running;
  const clip = p.preview?.status === "succeeded" && p.preview.url ? p.preview : null;
  const failed = p.preview?.status === "failed" ? p.preview : null;
  const blocker = voicePreviewBlocker(avatar);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">Video preview</span>
      <div className="flex flex-wrap items-center gap-2">
        {clip && (
          <Button size="sm" variant="outline" onClick={() => setWatching(true)}>
            <Play className="size-3.5" strokeWidth={1.5} />
            Watch
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || busy || p.loading || blocker !== null || p.estimateCredits === null}
          onClick={() => void p.generate(defaultVoicePreviewLine(avatar.name))}
        >
          {busy ? (
            <>
              <Loader2 className="size-3.5 animate-spin text-primary" strokeWidth={1.5} />
              Making the preview…
            </>
          ) : (
            <>
              {clip ? <RotateCcw className="size-3.5" strokeWidth={1.5} /> : <Play className="size-3.5" strokeWidth={1.5} />}
              {clip ? "Generate again" : "Generate video preview"}
              <AvatarCreditCost credits={p.estimateCredits} />
            </>
          )}
        </Button>
      </div>
      {busy && <p className="text-xs text-muted-foreground">Usually a minute or two. You can keep working.</p>}
      {clip && isVoicePreviewStale(clip, avatar) && (
        <Badge variant="outline" className="self-start border-warning/40 bg-warning/15 text-warning-text">
          Out of date: the face or voice changed since this clip
        </Badge>
      )}
      {!busy && failed && (
        <p className="text-xs text-destructive-text">{failed.error ?? "The preview failed."} No credits were charged.</p>
      )}
      {blocker && <p className="text-xs text-muted-foreground">{blocker}</p>}
      {watching && clip?.url && (
        <Dialog open onOpenChange={(open) => { if (!open) setWatching(false); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{avatar.name} · preview</DialogTitle>
            </DialogHeader>
            <video src={clip.url} controls autoPlay playsInline className="aspect-[9/16] w-full rounded-lg bg-muted object-cover" />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
