"use client";

import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAvatarVoice } from "@/hooks/use-avatar-voice";
import { useClientVoices } from "@/hooks/queries/client-voices";
import { avatarVoiceLabel } from "@/lib/avatars/voice";
import type { Avatar } from "@/lib/avatars/schema";

const NONE = "none";
const NATIVE = "native";

// Spec §5.5 — each person's voice, chosen here from the Avatars feature's own voices: none, the
// engine's own ("Choose a voice for me"), or one of this client's voices. The storyboard does not
// use it; the package and the lead's avatar on the canvas do.
export function CastSlotVoice({ clientId, castId, avatar, onChanged }: {
  clientId: string;
  castId: string;
  avatar: Avatar | null;
  onChanged: () => void;
}) {
  const voices = useClientVoices(clientId);
  const voice = useAvatarVoice({ clientId, avatarId: avatar?.id ?? null, onAvatar: onChanged });
  const list = voices.data ?? [];
  const declared = avatar?.voice ?? null;
  const named = declared?.mode === "named" ? declared : null;
  const value = named ? named.voiceId : declared?.mode === "native" ? NATIVE : NONE;
  const id = `voice-${castId}`;

  const onChange = (next: string) => {
    if (next === NONE) void voice.clear();
    else if (next === NATIVE) void voice.chooseNative();
    else {
      const picked = list.find((v) => v.voiceId === next);
      if (picked) void voice.chooseNamed(picked);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
        Voice
        {voice.saving && (
          <span role="status" className="flex items-center gap-1 text-foreground">
            <Loader2 className="size-3 animate-spin text-primary" strokeWidth={1.5} />
            Saving…
          </span>
        )}
      </Label>
      <Select value={value} onValueChange={(v) => { if (typeof v === "string") onChange(v); }} disabled={!avatar || voice.saving}>
        <SelectTrigger id={id} size="sm" className="w-full">
          <SelectValue>{avatarVoiceLabel(declared) ?? "No voice"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>No voice</SelectItem>
          <SelectItem value={NATIVE}>Choose a voice for me</SelectItem>
          {named && !list.some((v) => v.voiceId === named.voiceId) && (
            <SelectItem value={named.voiceId}>{named.name}</SelectItem>
          )}
          {list.map((v) => <SelectItem key={v.voiceId} value={v.voiceId}>{v.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
