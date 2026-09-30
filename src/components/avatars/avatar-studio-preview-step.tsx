"use client";

import { AudioLines, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { useAvatarVoicePreview } from "@/hooks/use-avatar-voice-preview";
import type { Avatar } from "@/lib/avatars/schema";
import { AvatarVoicePreview } from "./avatar-voice-preview";

type Props = {
  avatar: Avatar;
  preview: ReturnType<typeof useAvatarVoicePreview>;
  /** The voice is being saved — a preview now would use the one being replaced. */
  disabled: boolean;
  onBackToVoice: () => void;
};

// D297 — the preview as a step of its own (spec §4.4). The voice decides which model makes it,
// so with no voice there is nothing to make yet, and the step says so.
export function AvatarStudioPreviewStep({ avatar, preview, disabled, onBackToVoice }: Props) {
  if (!avatar.voice) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-12 text-center">
        <AudioLines className="size-6 text-muted-foreground" strokeWidth={1.5} />
        <p className="font-semibold">Choose a voice first</p>
        <p className="text-sm text-muted-foreground">The voice decides which model makes the preview.</p>
        <Button variant="outline" className="mt-2" onClick={onBackToVoice}>
          <ChevronLeft className="size-4" strokeWidth={1.5} />
          Back to voice
        </Button>
      </div>
    );
  }
  return <AvatarVoicePreview avatar={avatar} preview={preview} disabled={disabled} />;
}
