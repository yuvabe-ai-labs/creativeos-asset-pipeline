"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { dubbingService } from "@/services/dubbing.service";
import { useVoicePreview } from "@/hooks/use-voice-preview";
import type { DubLanguage, DubVoice } from "@/lib/dubbing/types";

// D379 — preset-voice previews through TanStack Query (CLAUDE.md, "Data fetching"). A preview's URL
// never changes once made, so it is cached for the session; nothing loads until play is pressed.
export const dubVoicePreviewKeys = {
  all: ["dub-voice-preview"] as const,
  one: (voice: DubVoice, language: DubLanguage) => [...dubVoicePreviewKeys.all, voice, language] as const,
};

/** The player id of a voice's preview in a language: one shared player, one preview at a time. */
export const dubPreviewId = (voice: DubVoice, language: DubLanguage) => `dub:${voice}:${language}`;

/** Play or stop a preset voice's preview. `loadingId` is set while a first preview is being made. */
export function useDubVoicePreview(nodeId: string) {
  const queryClient = useQueryClient();
  const { playingId, toggle, stop } = useVoicePreview();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const play = useCallback(
    async (voice: DubVoice, language: DubLanguage) => {
      const id = dubPreviewId(voice, language);
      if (playingId === id) return toggle({ voiceId: id, previewUrl: null });
      setLoadingId(id);
      try {
        const { url } = await queryClient.fetchQuery({
          queryKey: dubVoicePreviewKeys.one(voice, language),
          queryFn: () => dubbingService.voicePreview(nodeId, voice, language),
          staleTime: Infinity,
        });
        toggle({ voiceId: id, previewUrl: url });
      } catch {
        toast.error("Couldn't play the preview. Try again.");
      } finally {
        setLoadingId(null);
      }
    },
    [nodeId, playingId, queryClient, toggle],
  );

  return { play, stop, playingId, loadingId };
}
