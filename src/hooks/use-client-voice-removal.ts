"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { elevenLabsApi } from "@/lib/elevenlabs/api";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";

// D292 — remove one of a client's voices from the picker. The server refuses while a live avatar
// uses it and says which one; that message is shown as it comes. `onRemoved` refetches the list.
export function useClientVoiceRemoval(clientId: string | undefined, onRemoved: () => void) {
  return useCallback(
    async (voice: PickerVoice) => {
      if (!clientId) return;
      try {
        await elevenLabsApi.removeClientVoice(clientId, voice.voiceId);
        toast.success(`Removed "${voice.name}"`);
        onRemoved();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not remove this voice.");
      }
    },
    [clientId, onRemoved],
  );
}
