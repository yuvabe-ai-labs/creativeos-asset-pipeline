"use client";

import { Loader2, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AvatarCreditCost } from "@/components/avatars/avatar-credit-cost";
import { useAvatarVoicePreview } from "@/hooks/use-avatar-voice-preview";
import {
  defaultVoicePreviewLine, voiceDeclarationKey, voicePreviewBlocker,
} from "@/lib/avatars/voice-preview";
import type { Avatar } from "@/lib/avatars/schema";

// Asked for in testing: once a voice is set, see and hear the avatar from the cast card. The
// Studio's preview (D294) made compact: the same hook, the same spoken line, the same billing;
// D466: the clip itself plays beside the four views (CastSlotSheet); here are its controls.
export function CastSlotPreview({ clientId, avatar, disabled, lockedReason = null, onSettled }: {
  clientId: string;
  avatar: Avatar;
  /** The card is busy (a voice being saved, a face being made): a preview now would be stale. */
  disabled: boolean;
  /** D465 — locked until the avatar is made: why, shown in place of the button's other hints. */
  lockedReason?: string | null;
  /** Must be a stable callback: a new identity restarts the preview's poll. */
  onSettled: (avatarId: string) => void;
}) {
  const p = useAvatarVoicePreview({
    clientId, avatarId: avatar.id, declaration: voiceDeclarationKey(avatar.voice), onSettled,
  });
  if (!avatar.voice) return null;

  const busy = p.starting || p.running;
  const clip = p.preview?.status === "succeeded" && p.preview.url ? p.preview : null;
  const failed = p.preview?.status === "failed" ? p.preview : null;
  const blocker = lockedReason ?? voicePreviewBlocker(avatar);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">Video preview</span>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          // D465 — the first preview is the popup's next step (primary); making it again is secondary.
          variant={clip ? "secondary" : "default"}
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
      {!busy && failed && (
        <p className="text-xs text-destructive-text">{failed.error ?? "The preview failed."} No credits were charged.</p>
      )}
      {blocker && <p className="text-xs text-muted-foreground">{blocker}</p>}
    </div>
  );
}
