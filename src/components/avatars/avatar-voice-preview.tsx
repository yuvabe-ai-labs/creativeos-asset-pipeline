"use client";

import { Info, Play, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { useAvatarVoicePreview } from "@/hooks/use-avatar-voice-preview";
import { defaultVoicePreviewLine, isVoicePreviewStale, voicePreviewMode } from "@/lib/avatars/voice-preview";
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

const CLIP_BOX = "aspect-[9/16] w-full max-w-[13rem] rounded-xl";

// D294, D296, D297 — see and hear the avatar speak (spec §4.4). Two things happen on this step:
// generate a preview here, then save to the library from the footer. The clip is the centre of
// the step and the button sits beside it; the line spoken is fixed (they introduce themself), so
// there is nothing to write and nothing to show about it.
export function AvatarVoicePreview({ avatar, preview: p, disabled }: Props) {
  const mode = voicePreviewMode(avatar);
  const name = avatar.name.trim() || "This avatar";
  const line = defaultVoicePreviewLine(avatar.name);
  const busy = p.starting || p.running;
  const clip = p.preview?.status === "succeeded" ? p.preview : null;
  const failed = p.preview?.status === "failed" ? p.preview : null;
  if (!mode) return null;

  // The same shape as the loaded step, so nothing moves when the preview's state arrives.
  if (p.loading) {
    return (
      <div className="flex flex-wrap items-start gap-8" aria-busy="true">
        <Skeleton className={CLIP_BOX} />
        <div className="flex min-w-0 flex-1 basis-56 flex-col gap-3">
          <Skeleton className="h-10 w-48 rounded-lg" />
          <Skeleton className="h-3.5 w-64" />
        </div>
      </div>
    );
  }

  const generate = (
    <Button
      variant={clip ? "outline" : "default"}
      size="lg"
      className="self-start"
      disabled={disabled || busy || p.estimateCredits === null}
      onClick={() => void p.generate(line)}
    >
      {clip ? <RotateCcw className="size-4" strokeWidth={1.5} /> : <Play className="size-4" strokeWidth={1.5} />}
      {busy ? "Generating…" : clip ? "Generate again" : "Generate preview"}
      <AvatarCreditCost credits={p.estimateCredits} />
    </Button>
  );

  return (
    <div className="flex flex-wrap items-start gap-8">
      {busy ? (
        <AvatarGeneratingTile label="Making the clip…" className={CLIP_BOX} />
      ) : clip?.url ? (
        <video
          key={clip.url}
          src={clip.url}
          controls
          playsInline
          preload="metadata"
          className={`${CLIP_BOX} border bg-muted object-cover`}
        />
      ) : (
        <div className={`${CLIP_BOX} grid place-items-center border border-dashed bg-muted/40 p-4 text-center`}>
          <span className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <Play className="size-6 text-primary/60" strokeWidth={1.5} />
            {name}&apos;s clip appears here
          </span>
        </div>
      )}

      <div className="flex min-w-0 flex-1 basis-56 flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">
            {clip ? `This is how ${name} looks and sounds` : `See and hear ${name} speak`}
          </p>
          <p className="text-sm text-muted-foreground">
            {busy
              ? "Usually a minute or two. You can keep working on other steps."
              : clip
                ? "Happy with it? Save to library below. Not quite right? Generate again."
                : "Generate a short clip, then save to library below."}
          </p>
        </div>

        {generate}

        {clip && isVoicePreviewStale(clip, avatar) && (
          <Badge variant="outline" className="self-start border-warning/40 bg-warning/15 text-warning-text">
            Out of date: the face or voice changed since this clip
          </Badge>
        )}

        {mode === "native" && !busy && avatar.voiceSample && <AvatarVoiceSample sample={avatar.voiceSample} />}

        {/* D301 — the voice was kept for Seedance but not copied for the other models. */}
        {mode === "native" && !busy && avatarAutoVoiceMissing(avatar) && (
          <p className="flex gap-2 rounded-lg bg-warning/15 px-3 py-2.5 text-sm text-warning-text">
            <Info className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
            {name}&apos;s voice couldn&apos;t be kept for every video. Generate again to retry.
          </p>
        )}

        {!busy && failed && (
          <p className="text-sm text-destructive-text">
            {failed.error ?? "The preview failed."} No credits were charged.
          </p>
        )}
      </div>
    </div>
  );
}
