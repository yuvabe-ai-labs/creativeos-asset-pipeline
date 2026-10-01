"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/avatars/utils";
import { useStartVoicePreview, useVoicePreviewQuery } from "@/hooks/queries/avatars";
import type { VoicePreview } from "@/lib/avatars/schema";

// D294 — the avatar's voice preview in the Studio: the latest clip, what the next one costs, and
// starting one. D300 — the data now lives in TanStack Query (`hooks/queries/avatars.ts`), which
// polls a running preview by itself and shares the result with the canvas's Avatar focus view;
// this hook keeps the Studio's shape and adds the one thing the Studio needs on top, "a preview
// just finished". It lives in the Studio (not the Voice step) so the wait carries on across steps.
export function useAvatarVoicePreview({
  clientId, avatarId, declaration, onSettled,
}: {
  clientId: string;
  avatarId: string | null;
  /** The declaration, as a key: its mode and, for a named voice, which one. Both the engine and
   *  the estimate follow it, so a change reloads. */
  declaration: string | null;
  /** A preview finished, either way. What the avatar has cost has changed, and a native preview
   *  has written a voice reference onto the avatar itself. */
  onSettled: (avatarId: string) => void;
}) {
  const query = useVoicePreviewQuery(clientId, avatarId, declaration);
  const start = useStartVoicePreview(clientId, avatarId);
  const preview = query.data?.preview ?? null;
  const estimateCredits = query.data?.estimateCredits ?? null;
  const running = preview?.status === "running";

  // "Finished" is the moment a preview this screen saw running stops running.
  const lastStatus = useRef<VoicePreview["status"] | null>(null);
  useEffect(() => {
    const status = preview?.status ?? null;
    if (lastStatus.current === "running" && status && status !== "running" && avatarId) onSettled(avatarId);
    lastStatus.current = status;
  }, [preview?.status, avatarId, onSettled]);

  const generate = useCallback(
    async (line: string) => {
      if (!avatarId || start.isPending || running) return;
      try {
        await start.mutateAsync(line);
      } catch (e) {
        toast.error(errorMessage(e, "Could not start the voice preview"));
      }
    },
    [avatarId, start, running],
  );

  return { preview, estimateCredits, starting: start.isPending, running, generate };
}
