"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { avatarsService } from "@/services/avatars.service";
import { mergeCandidates, type PendingCandidate } from "@/lib/avatars/generation";
import type { AvatarAttributes, AvatarStyleId } from "@/lib/avatars/constants";
import type { Avatar, AvatarCandidate } from "@/lib/avatars/schema";

export type GenerateFrontInput = {
  description: string;
  attributes: AvatarAttributes;
  styleId: AvatarStyleId;
  modelId: string;
  count: number;
};

const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

// D288/D291 — generation state for the Avatar Studio: the front candidates, the images still
// generating, what this avatar has cost, and the two actions that change the avatar (pick a
// front, generate the sheet). One request per image, so each placeholder resolves on its own
// and one failure does not sink the batch.
export function useAvatarGeneration({
  clientId, avatarId, ensureAvatar, onAvatar,
}: {
  clientId: string;
  avatarId: string | null;
  ensureAvatar: () => Promise<Avatar>;
  onAvatar: (avatar: Avatar) => void;
}) {
  const [candidates, setCandidates] = useState<AvatarCandidate[]>([]);
  const [pending, setPending] = useState<PendingCandidate[]>([]);
  const [spentCredits, setSpentCredits] = useState(0);
  const [picking, setPicking] = useState<string | null>(null);
  const [generatingSheet, setGeneratingSheet] = useState(false);
  const loadedFor = useRef<string | null>(null);

  // What was generated before this visit. Merged, not assigned: a draft created in this
  // session may already have results on screen when the load returns.
  useEffect(() => {
    if (!avatarId || loadedFor.current === avatarId) return;
    loadedFor.current = avatarId;
    avatarsService
      .listGenerations(clientId, avatarId)
      .then((loaded) => {
        setCandidates((prev) => mergeCandidates(prev, loaded.candidates));
        setSpentCredits((prev) => Math.max(prev, loaded.spentCredits));
      })
      .catch(() => {
        // The grid is a convenience; a failed load leaves it empty rather than blocking work.
      });
  }, [clientId, avatarId]);

  const generate = useCallback(async (input: GenerateFrontInput) => {
    let target: Avatar;
    try {
      target = await ensureAvatar();
    } catch (e) {
      toast.error(message(e, "Could not start the avatar"));
      return;
    }
    const batchId = crypto.randomUUID();
    const tiles: PendingCandidate[] = Array.from({ length: input.count }, (_, i) => ({
      key: `${batchId}-${i}`, batchId, modelId: input.modelId,
    }));
    setPending((prev) => [...tiles, ...prev]);

    // The same failure (the credit cap, a blocked prompt) usually hits every image in the
    // batch: report each distinct message once.
    const errors = new Set<string>();
    await Promise.all(tiles.map(async (tile) => {
      try {
        const { candidate, creditsCharged } = await avatarsService.generateFront(clientId, target.id, {
          description: input.description,
          attributes: input.attributes,
          styleId: input.styleId,
          modelId: input.modelId,
          batchId,
        });
        setCandidates((prev) => mergeCandidates(prev, [candidate]));
        setSpentCredits((prev) => prev + creditsCharged);
      } catch (e) {
        errors.add(message(e, "Could not generate the image"));
      } finally {
        setPending((prev) => prev.filter((p) => p.key !== tile.key));
      }
    }));
    for (const text of errors) toast.error(text);
  }, [clientId, ensureAvatar]);

  const pickFront = useCallback(async (candidate: AvatarCandidate) => {
    if (!avatarId || picking) return;
    setPicking(candidate.generationId);
    try {
      onAvatar(await avatarsService.pickFront(clientId, avatarId, candidate.generationId));
    } catch (e) {
      toast.error(message(e, "Could not set the front image"));
    } finally {
      setPicking(null);
    }
  }, [clientId, avatarId, picking, onAvatar]);

  const generateSheet = useCallback(async (modelId: string) => {
    if (!avatarId || generatingSheet) return;
    setGeneratingSheet(true);
    try {
      const { avatar, creditsCharged } = await avatarsService.generateSheet(clientId, avatarId, modelId);
      onAvatar(avatar);
      setSpentCredits((prev) => prev + creditsCharged);
    } catch (e) {
      toast.error(message(e, "Could not generate the profile sheet"));
    } finally {
      setGeneratingSheet(false);
    }
  }, [clientId, avatarId, generatingSheet, onAvatar]);

  return {
    candidates, pending, spentCredits, picking, generatingSheet,
    generate, pickFront, generateSheet,
  };
}
