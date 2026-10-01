"use client";

import { useState } from "react";
import { Check, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useVoicePreview } from "@/hooks/use-voice-preview";
import type { useAvatarVoice } from "@/hooks/use-avatar-voice";
import { allowedVoiceModes, avatarVoiceToPickerVoice } from "@/lib/avatars/voice";
import type { Avatar, AvatarVoiceMode } from "@/lib/avatars/schema";
import { VideoGenChangeVoicePicker } from "@/components/nodes/video-gen-change-voice-picker";

const MODE_COPY: Record<AvatarVoiceMode, { title: string; body: string }> = {
  native: {
    title: "The engine's own voice",
    body: "Seedance invents a voice. Keep it in the Preview step and every Seedance video reuses it. No ElevenLabs cost.",
  },
  named: {
    title: "A named voice",
    body: "An ElevenLabs voice, applied after generation. The same voice on every model.",
  },
};

type Props = {
  clientId: string;
  avatar: Avatar;
  voice: ReturnType<typeof useAvatarVoice>;
};

// D293, D297 — the Voice step: how this avatar sounds in every video. Optional. A generated avatar
// may use its engine's own voice or a named one; a real person runs on engines that take no voice
// reference, so only a named voice is offered. The preview is its own step now (spec §4.4).
export function AvatarStudioVoiceStep({ clientId, avatar, voice: v }: Props) {
  const modes = allowedVoiceModes(avatar.personType);
  const sample = useVoicePreview();
  const declared = avatar.voice;
  const pending = v.pending;
  // What the operator chose wins over what the server has confirmed, for as long as it is saving.
  const chosenMode = pending ? (pending.mode === "none" ? null : pending.mode) : declared?.mode ?? null;
  const named = pending?.mode === "named" ? pending.voice
    : pending?.mode === "none" ? null
      : avatarVoiceToPickerVoice(declared);
  // Which option is open. A named voice has to be picked before anything is saved, so the
  // choice of "named" lives here until then.
  const [open, setOpen] = useState<AvatarVoiceMode | null>(
    declared?.mode ?? (modes.length === 1 ? modes[0] : null),
  );

  return (
    <>
      {modes.length === 1 && (
        <p className="flex max-w-xl gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
          A real person runs on Gemini Omni and Kling. Neither takes a voice reference, so the voice is
          applied after generation.
        </p>
      )}

      {modes.length > 1 && (
        <div className="grid max-w-2xl gap-2 sm:grid-cols-2">
          {modes.map((mode) => {
            const active = open === mode;
            const savingThis = pending?.mode === mode;
            return (
              <Button
                key={mode}
                variant="outline"
                aria-pressed={active}
                aria-busy={savingThis || undefined}
                // Only the other card dims while a choice saves; the one being saved stays bright
                // and shows it is working.
                disabled={v.saving && !savingThis}
                onClick={() => {
                  if (v.saving) return;
                  setOpen(mode);
                  if (mode === "native" && declared?.mode !== "native") void v.chooseNative();
                }}
                className={cn(
                  "h-auto flex-col items-start gap-1 whitespace-normal p-3.5 text-left",
                  active && "border-primary/50 bg-primary/5 hover:bg-primary/10",
                )}
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  {savingThis ? <Loader2 className="size-4 animate-spin text-primary" strokeWidth={1.5} />
                    : chosenMode === mode && <Check className="size-4 text-primary" strokeWidth={1.5} />}
                  {MODE_COPY[mode].title}
                </span>
                <span className="text-xs font-normal text-muted-foreground">{MODE_COPY[mode].body}</span>
              </Button>
            );
          })}
        </div>
      )}

      {open === "named" && (
        <div className="w-full max-w-md">
          <VideoGenChangeVoicePicker
            clientId={clientId}
            voice={named}
            saving={pending?.mode === "named"}
            savingLabel="Saving…"
            playing={Boolean(named && sample.playingId === named.voiceId)}
            onTogglePreview={() => named && sample.toggle(named)}
            onSelect={(picked) => {
              sample.stop();
              void v.chooseNamed(picked);
            }}
          />
        </div>
      )}

      {(declared || pending) && pending?.mode !== "native" && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start text-muted-foreground"
          disabled={v.saving}
          onClick={() => {
            sample.stop();
            setOpen(modes.length === 1 ? modes[0] : null);
            void v.clear();
          }}
        >
          {pending?.mode === "none" ? "Removing…" : "Remove the voice"}
        </Button>
      )}
    </>
  );
}
