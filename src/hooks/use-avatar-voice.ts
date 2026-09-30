"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { avatarsService } from "@/services/avatars.service";
import { elevenLabsApi } from "@/lib/elevenlabs/api";
import { errorMessage } from "@/lib/avatars/utils";
import type { Avatar } from "@/lib/avatars/schema";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";

// D293 — the avatar's voice declaration in the Studio: a named ElevenLabs voice, the engine's
// own voice, or none. A Voice Library pick is first saved for this client (D292), then declared
// with the account voice id the save returns.
export function useAvatarVoice({
  clientId, avatarId, onAvatar,
}: {
  clientId: string;
  avatarId: string | null;
  onAvatar: (avatar: Avatar) => void;
}) {
  const [saving, setSaving] = useState(false);

  const declare = useCallback(
    async (choice: { mode: "none" } | { mode: "native" } | { mode: "named"; voiceId: string }) => {
      if (!avatarId) return;
      onAvatar(await avatarsService.setVoice(clientId, avatarId, choice));
    },
    [clientId, avatarId, onAvatar],
  );

  const run = useCallback(async (work: () => Promise<void>, fallback: string) => {
    setSaving(true);
    try {
      await work();
    } catch (e) {
      toast.error(errorMessage(e, fallback));
    } finally {
      setSaving(false);
    }
  }, []);

  const chooseNamed = useCallback(
    (voice: PickerVoice) =>
      run(async () => {
        const accountVoice =
          voice.source === "library"
            ? await elevenLabsApi.saveClientVoice(clientId, {
                publicOwnerId: voice.publicOwnerId ?? "",
                voiceId: voice.voiceId,
                name: voice.name,
              })
            : voice;
        await declare({ mode: "named", voiceId: accountVoice.voiceId });
      }, `Couldn't use "${voice.name}"`),
    [clientId, declare, run],
  );

  const chooseNative = useCallback(
    () => run(() => declare({ mode: "native" }), "Could not set the voice"),
    [declare, run],
  );

  const clear = useCallback(
    () => run(() => declare({ mode: "none" }), "Could not remove the voice"),
    [declare, run],
  );

  return { saving, chooseNamed, chooseNative, clear };
}
