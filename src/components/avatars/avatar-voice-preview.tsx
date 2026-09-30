"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { useAvatarVoicePreview } from "@/hooks/use-avatar-voice-preview";
import { AVATAR_VOICE_PREVIEW_LINE_MAX, AVATAR_VOICE_PREVIEW_SECONDS } from "@/lib/avatars/constants";
import { defaultVoicePreviewLine, isVoicePreviewStale } from "@/lib/avatars/voice-preview";
import type { Avatar } from "@/lib/avatars/schema";
import { AvatarCreditCost } from "./avatar-credit-cost";

type Props = {
  avatar: Avatar;
  preview: ReturnType<typeof useAvatarVoicePreview>;
  /** The voice is being saved — a preview now would use the one being replaced. */
  disabled: boolean;
};

// D294 — hear and see the avatar speak in its named voice: a short clip of the front image
// saying one line. Shown under the voice picker once a named voice is declared.
export function AvatarVoicePreview({ avatar, preview: p, disabled }: Props) {
  // Null until the operator types: the box then follows the last preview's line, or the default.
  const [typed, setTyped] = useState<string | null>(null);
  const line = typed ?? p.preview?.line ?? defaultVoicePreviewLine(avatar.name);
  const busy = p.starting || p.running;
  const clip = p.preview?.status === "succeeded" ? p.preview : null;
  const failed = p.preview?.status === "failed" ? p.preview : null;

  return (
    <div className="flex w-full max-w-md flex-col gap-3 rounded-xl border bg-card p-3">
      <div>
        <p className="text-eyebrow text-muted-foreground">Preview</p>
        <p className="mt-1 text-xs text-muted-foreground">
          A {AVATAR_VOICE_PREVIEW_SECONDS}-second clip of the front image speaking in this voice.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="avatar-voice-preview-line">What the avatar says</Label>
        <Textarea
          id="avatar-voice-preview-line"
          value={line}
          rows={2}
          maxLength={AVATAR_VOICE_PREVIEW_LINE_MAX}
          disabled={busy}
          onChange={(e) => setTyped(e.target.value)}
        />
      </div>

      <Button
        variant={clip ? "outline" : "default"}
        className="self-start"
        disabled={disabled || busy || !line.trim() || p.estimateCredits === null}
        onClick={() => void p.generate(line.trim())}
      >
        {busy ? "Generating…" : clip ? "Regenerate preview" : "Generate preview"}
        <AvatarCreditCost credits={p.estimateCredits} />
      </Button>

      {busy && (
        <div className="flex flex-col gap-1.5">
          <Skeleton className="aspect-[9/16] w-40 rounded-lg" />
          <p className="text-xs text-muted-foreground">Usually about a minute. You can leave this step.</p>
        </div>
      )}

      {!busy && clip?.url && (
        <div className="flex flex-col gap-1.5">
          <video
            key={clip.url}
            src={clip.url}
            controls
            playsInline
            preload="metadata"
            className="aspect-[9/16] w-40 rounded-lg border bg-muted object-cover"
          />
          <p className="text-xs text-muted-foreground">
            {clip.voiceName} · “{clip.line}”
          </p>
          {isVoicePreviewStale(clip, avatar) && (
            <Badge variant="outline" className="self-start">
              Out of date — the voice or the front image changed
            </Badge>
          )}
        </div>
      )}

      {!busy && failed && (
        <p className="text-xs text-destructive">
          {failed.error ?? "The preview failed."} No credits were charged.
        </p>
      )}
    </div>
  );
}
