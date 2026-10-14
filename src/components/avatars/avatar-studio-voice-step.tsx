"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useVoicePreview } from "@/hooks/use-voice-preview";
import type { useAvatarVoice } from "@/hooks/use-avatar-voice";
import { voiceChoiceOf, type VoiceChoice } from "@/lib/avatars/studio";
import { avatarVoiceToPickerVoice } from "@/lib/avatars/voice";
import type { Avatar } from "@/lib/avatars/schema";
import { VideoGenChangeVoicePicker } from "@/components/nodes/video-gen-change-voice-picker";
import { AvatarVoiceAutoPanel } from "./avatar-voice-auto-panel";
import { AvatarVoiceCustomPanel } from "./avatar-voice-custom-panel";
import { AvatarVoiceOptions } from "./avatar-voice-options";

type Props = {
  clientId: string;
  avatar: Avatar;
  voice: ReturnType<typeof useAvatarVoice>;
};

// D293, D297, D301 — the Voice step: how this avatar sounds in every video. Optional. Three ways,
// for any face: a voice chosen for it (made in the Preview step), one from the library, or one made
// from a recording. Picking "chosen for me" saves at once; the other two save when a voice is
// picked or created, so the card opens its panel first.
export function AvatarStudioVoiceStep({ clientId, avatar, voice: v }: Props) {
  const sample = useVoicePreview();
  const declared = avatar.voice;
  const pending = v.pending;
  const name = avatar.name.trim() || "this avatar";
  const [open, setOpen] = useState<VoiceChoice | null>(voiceChoiceOf(declared));

  // What the operator chose wins over what the server has confirmed, for as long as it is saving.
  const savingCard: VoiceChoice | null = !pending ? null
    : pending.mode === "native" ? "auto"
      : pending.mode === "named" ? open
        : null;
  const declaredChoice = voiceChoiceOf(declared);
  const libraryVoice = pending?.mode === "named" && open === "library" ? pending.voice
    : pending?.mode === "none" ? null
      : declaredChoice === "library" ? avatarVoiceToPickerVoice(declared) : null;
  const customVoice = pending?.mode === "named" && open === "custom" ? pending.voice
    : declaredChoice === "custom" ? avatarVoiceToPickerVoice(declared) : null;

  function select(choice: VoiceChoice) {
    if (v.saving) return;
    sample.stop();
    setOpen(choice);
    if (choice === "auto" && declared?.mode !== "native") void v.chooseNative();
  }

  return (
    <>
      <AvatarVoiceOptions
        name={name}
        selected={open}
        saving={savingCard}
        disabled={v.saving}
        onSelect={select}
      />

      {open === "auto" && (
        <AvatarVoiceAutoPanel name={name} saving={savingCard === "auto"} saved={declared?.mode === "native"} />
      )}

      {open === "library" && (
        <div className="w-full max-w-md animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
          <VideoGenChangeVoicePicker
            clientId={clientId}
            voice={libraryVoice}
            saving={savingCard === "library"}
            savingLabel="Saving…"
            playing={Boolean(libraryVoice && sample.playingId === libraryVoice.voiceId)}
            onTogglePreview={() => libraryVoice && sample.toggle(libraryVoice)}
            onSelect={(picked) => {
              sample.stop();
              void v.chooseNamed(picked, "library");
            }}
          />
        </div>
      )}

      {open === "custom" && (
        <div className="w-full max-w-xl">
          <AvatarVoiceCustomPanel
            clientId={clientId}
            name={avatar.name.trim()}
            voice={customVoice}
            saving={savingCard === "custom"}
            onCreated={(created) => void v.chooseNamed(created, "custom")}
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
            setOpen(null);
            void v.clear();
          }}
        >
          {pending?.mode === "none" ? "Removing…" : "Remove the voice"}
        </Button>
      )}
    </>
  );
}
