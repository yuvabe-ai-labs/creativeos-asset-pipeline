"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { avatarsService } from "@/services/avatars.service";
import { elevenLabsApi } from "@/lib/elevenlabs/api";
import { errorMessage } from "@/lib/avatars/utils";
import type { Avatar } from "@/lib/avatars/schema";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";

/** The choice being saved, shown at once rather than after the server confirms it. */
export type PendingVoiceChoice =
  | { mode: "named"; voice: PickerVoice }
  | { mode: "native" }
  | { mode: "none" };

// D293 — the avatar's voice declaration in the Studio: a named ElevenLabs voice, the engine's
// own voice, or none. A Voice Library pick is first saved for this client (D292), then declared
// with the account voice id the save returns.
//
// `pending` is the choice in flight. A Library pick is two round trips, and until they return
// the field used to keep showing the old voice — or "Pick a voice" — so a pick looked like it had
// not registered at all (D297 review). The Studio shows `pending` straight away, marked as
// saving, and drops it when the server answers either way.
export function useAvatarVoice({
  clientId, avatarId, onAvatar,
}: {
  clientId: string;
  avatarId: string | null;
  onAvatar: (avatar: Avatar) => void;
}) {
  const [pending, setPending] = useState<PendingVoiceChoice | null>(null);
  const saving = pending !== null;

  const declare = useCallback(
    async (choice: { mode: "none" } | { mode: "native" } | { mode: "named"; voiceId: string; origin?: "library" | "custom" }) => {
      if (!avatarId) return;
      onAvatar(await avatarsService.setVoice(clientId, avatarId, choice));
    },
    [clientId, avatarId, onAvatar],
  );

  const run = useCallback(async (choice: PendingVoiceChoice, work: () => Promise<void>, fallback: string) => {
    setPending(choice);
    try {
      await work();
    } catch (e) {
      toast.error(errorMessage(e, fallback));
    } finally {
      setPending(null);
    }
  }, []);

  // D301 — `origin` records which card the voice came from: the library, or one made from a
  // recording (already an account voice, so it needs no library save).
  const chooseNamed = useCallback(
    (voice: PickerVoice, origin: "library" | "custom" = "library") =>
      run({ mode: "named", voice }, async () => {
        const accountVoice =
          voice.source === "library"
            ? await elevenLabsApi.saveClientVoice(clientId, {
                publicOwnerId: voice.publicOwnerId ?? "",
                voiceId: voice.voiceId,
                name: voice.name,
              })
            : voice;
        await declare({ mode: "named", voiceId: accountVoice.voiceId, origin });
      }, `Couldn't use "${voice.name}"`),
    [clientId, declare, run],
  );

  const chooseNative = useCallback(
    () => run({ mode: "native" }, () => declare({ mode: "native" }), "Could not set the voice"),
    [declare, run],
  );

  const clear = useCallback(
    () => run({ mode: "none" }, () => declare({ mode: "none" }), "Could not remove the voice"),
    [declare, run],
  );

  return { saving, pending, chooseNamed, chooseNative, clear };
}
