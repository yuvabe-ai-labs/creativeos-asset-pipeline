"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { avatarsService } from "@/services/avatars.service";
import { errorMessage } from "@/lib/avatars/utils";
import type { VoicePreview } from "@/lib/avatars/schema";

const POLL_MS = 4000;

// D294 — the avatar's voice preview in the Studio: the latest clip, what the next one costs, and
// starting one. A preview is made by a background task, so while one is running this asks the
// server for it every few seconds; it lives in the Studio (not the Voice step) so the wait
// carries on while the operator is on another step.
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
  const [preview, setPreview] = useState<VoicePreview | null>(null);
  const [estimateCredits, setEstimateCredits] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const running = preview?.status === "running";

  useEffect(() => {
    if (!avatarId) return;
    let cancelled = false;
    avatarsService
      .getVoicePreview(clientId, avatarId)
      .then((loaded) => {
        if (cancelled) return;
        setPreview(loaded.preview);
        setEstimateCredits(loaded.estimateCredits);
      })
      .catch(() => {
        // The preview is a convenience; a failed load leaves the block empty.
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, avatarId, declaration]);

  useEffect(() => {
    if (!avatarId || !running) return;
    let cancelled = false;
    const timer = setInterval(() => {
      avatarsService
        .getVoicePreview(clientId, avatarId)
        .then((loaded) => {
          if (cancelled) return;
          setPreview(loaded.preview);
          if (loaded.preview?.status !== "running") onSettled(avatarId);
        })
        .catch(() => {
          // A missed poll is retried by the next one.
        });
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [clientId, avatarId, running, onSettled]);

  const generate = useCallback(
    async (line: string) => {
      if (!avatarId || starting || running) return;
      setStarting(true);
      try {
        setPreview(await avatarsService.startVoicePreview(clientId, avatarId, line));
      } catch (e) {
        toast.error(errorMessage(e, "Could not start the voice preview"));
      } finally {
        setStarting(false);
      }
    },
    [clientId, avatarId, starting, running],
  );

  return { preview, estimateCredits, starting, running, generate };
}
