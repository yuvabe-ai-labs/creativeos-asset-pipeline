"use client";

import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { useAvatarVoicePreview } from "@/hooks/use-avatar-voice-preview";
import {
  defaultVoicePreviewLine, isVoicePreviewStale, voicePreviewMode, type VoicePreviewMode,
} from "@/lib/avatars/voice-preview";
import { avatarAutoVoiceMissing } from "@/lib/avatars/presenter";
import type { Avatar } from "@/lib/avatars/schema";
import { AvatarCreditCost } from "./avatar-credit-cost";
import { AvatarGeneratingTile } from "./avatar-generating-tile";
import { AvatarVoiceSample } from "./avatar-voice-sample";

type Props = {
  avatar: Avatar;
  preview: ReturnType<typeof useAvatarVoicePreview>;
  /** The voice is being saved — a preview now would use the one being replaced. */
  disabled: boolean;
};

const BUTTON: Record<VoicePreviewMode, { first: string; again: string }> = {
  named: { first: "Generate preview", again: "Regenerate" },
  native: { first: "Make a voice", again: "Make another" },
};


// D294, D296, D297 — hear and see the avatar speak (spec §4.4). The declaration picks the
// engine: a named voice is applied to a Gemini Omni clip; the engine's own voice is made by
// Seedance and kept as the avatar's voice reference. Controls on the left, the clip on the right.
export function AvatarVoicePreview({ avatar, preview: p, disabled }: Props) {
  const mode = voicePreviewMode(avatar);
  const name = avatar.name.trim() || "This avatar";
  // The line is fixed — the avatar introduces themself by name — so there is nothing to write.
  const line = defaultVoicePreviewLine(avatar.name);
  const busy = p.starting || p.running;
  const clip = p.preview?.status === "succeeded" ? p.preview : null;
  const failed = p.preview?.status === "failed" ? p.preview : null;
  if (!mode) return null;
  // The same shape as the loaded step, so nothing moves when the preview's state arrives.
  if (p.loading) {
    return (
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_12rem]" aria-busy="true">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-9 w-44 rounded-lg" />
        </div>
        <Skeleton className="aspect-[9/16] w-full max-w-[12rem] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_12rem]">
      <div className="flex flex-col gap-3">
        {/* One fixed line, so there is nothing to write: the avatar introduces themself. */}
        <div className="flex flex-col gap-1">
          <p className="text-eyebrow text-muted-foreground">What {name} says</p>
          <p className="rounded-lg bg-muted px-3 py-2.5 text-sm">“{line}”</p>
        </div>

        <Button
          variant={clip ? "outline" : "default"}
          className="self-start"
          disabled={disabled || busy || !line.trim() || p.estimateCredits === null}
          onClick={() => void p.generate(line.trim())}
        >
          {busy ? "Generating…" : clip ? BUTTON[mode].again : BUTTON[mode].first}
          <AvatarCreditCost credits={p.estimateCredits} />
        </Button>

        {mode === "native" && !busy && (avatar.voiceSample ? (
          <AvatarVoiceSample sample={avatar.voiceSample} />
        ) : (
          <p className="flex gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
            The voice you keep here is the one {name} uses in every video. Make another until you like it.
          </p>
        ))}

        {/* D301 — the voice was kept for Seedance but not copied for the other models. */}
        {mode === "native" && !busy && avatarAutoVoiceMissing(avatar) && (
          <p className="flex gap-2 rounded-lg bg-warning/15 px-3 py-2.5 text-sm text-warning-text">
            <Info className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
            {name}&apos;s voice couldn&apos;t be kept for every video. Make the preview again to retry.
          </p>
        )}

        {!busy && failed && (
          <p className="text-xs text-destructive-text">
            {failed.error ?? "The preview failed."} No credits were charged.
          </p>
        )}
      </div>

      <div className="flex max-w-[12rem] flex-col gap-2">
        {busy ? (
          <>
            <AvatarGeneratingTile label="Making the clip…" className="aspect-[9/16] w-full rounded-xl" />
            <p className="text-xs text-muted-foreground">
              Usually a minute or two. You can keep working on other steps.
            </p>
          </>
        ) : clip?.url ? (
          <>
            <video
              key={clip.url}
              src={clip.url}
              controls
              playsInline
              preload="metadata"
              className="aspect-[9/16] w-full rounded-xl border bg-muted object-cover"
            />
            <p className="text-xs text-muted-foreground">“{clip.line}”</p>
            {isVoicePreviewStale(clip, avatar) && (
              <Badge variant="outline" className="self-start border-warning/40 bg-warning/15 text-warning-text">
                Out of date
              </Badge>
            )}
          </>
        ) : (
          <div className="grid aspect-[9/16] w-full place-items-center rounded-xl border border-dashed p-3 text-center text-xs text-muted-foreground">
            Your clip appears here
          </div>
        )}
      </div>
    </div>
  );
}
