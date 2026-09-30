"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { avatarsService } from "@/services/avatars.service";
import { mergeCandidates, type PendingCandidate } from "@/lib/avatars/generation";
import { errorMessage } from "@/lib/avatars/utils";
import {
  AVATAR_BATCH_DEFAULT, AVATAR_DEFAULT_FRONT_MODEL_ID, AVATAR_DEFAULT_SHEET_MODEL_ID, AVATAR_STYLES,
} from "@/lib/avatars/constants";
import type { Avatar, AvatarCandidate, GenerateFrontInput } from "@/lib/avatars/schema";

const DEFAULT_COMPOSER: GenerateFrontInput = {
  description: "", attributes: {}, styleId: AVATAR_STYLES[0].id,
  modelId: AVATAR_DEFAULT_FRONT_MODEL_ID, count: AVATAR_BATCH_DEFAULT,
};

// D288/D291 — generation state for the Avatar Studio: the front candidates, the images still
// generating, what this avatar has cost, and the two actions that change the avatar (pick a
// front, generate the sheet). One request per image, so each placeholder resolves on its own
// and one failure does not sink the batch.
//
// Also owns the Describe composer's draft (spec §4.1, plan 2 review) and the sheet step's chosen
// model — both live here, not as local state in their panels, so switching to "Upload photo" or
// leaving the Look step (which unmounts the panels) never loses what was typed.
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
  const [composer, setComposerState] = useState<GenerateFrontInput>(DEFAULT_COMPOSER);
  const [sheetModelId, setSheetModelId] = useState(AVATAR_DEFAULT_SHEET_MODEL_ID);
  const loadedFor = useRef<string | null>(null);

  const setComposer = useCallback((patch: Partial<GenerateFrontInput>) => {
    setComposerState((prev) => ({ ...prev, ...patch }));
  }, []);

  // Every total the server reports is a snapshot of a number that only grows, and responses in
  // a batch can arrive out of order — so the larger snapshot is always the more recent truth.
  const applySpent = useCallback((total: number) => {
    setSpentCredits((prev) => Math.max(prev, total));
  }, []);

  // What was generated before this visit. Merged, not assigned: a draft created in this
  // session may already have results on screen when the load returns.
  useEffect(() => {
    if (!avatarId || loadedFor.current === avatarId) return;
    loadedFor.current = avatarId;
    avatarsService
      .listGenerations(clientId, avatarId)
      .then((loaded) => {
        setCandidates((prev) => mergeCandidates(prev, loaded.candidates));
        applySpent(loaded.spentCredits);
      })
      .catch(() => {
        // The grid is a convenience; a failed load leaves it empty rather than blocking work.
      });
  }, [clientId, avatarId, applySpent]);

  // A failed generation batch (or sheet request) may still have charged credits for the images
  // that DID succeed before the error — refetches the real settled total rather than trusting
  // whatever partial bookkeeping the browser could reconstruct.
  const refreshSpentCredits = useCallback(async (id: string) => {
    try {
      const loaded = await avatarsService.listGenerations(clientId, id);
      applySpent(loaded.spentCredits);
    } catch {
      // Best-effort; the toast already told the operator what happened.
    }
  }, [clientId, applySpent]);

  const generate = useCallback(async (input: GenerateFrontInput) => {
    let target: Avatar;
    try {
      target = await ensureAvatar();
    } catch (e) {
      toast.error(errorMessage(e, "Could not start the avatar"));
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
        const { candidate, spentCredits: total } = await avatarsService.generateFront(clientId, target.id, {
          description: input.description,
          attributes: input.attributes,
          styleId: input.styleId,
          modelId: input.modelId,
          batchId,
        });
        setCandidates((prev) => mergeCandidates(prev, [candidate]));
        applySpent(total);
      } catch (e) {
        errors.add(errorMessage(e, "Could not generate the image"));
      } finally {
        setPending((prev) => prev.filter((p) => p.key !== tile.key));
      }
    }));
    for (const text of errors) toast.error(text);
    // The server's number is the source of truth: a partial-batch failure may have charged for
    // the images that succeeded, in an order the per-tile responses above cannot be trusted to
    // reflect (concurrent requests can settle out of order).
    if (errors.size > 0) await refreshSpentCredits(target.id);
  }, [clientId, ensureAvatar, refreshSpentCredits, applySpent]);

  const pickFront = useCallback(async (candidate: AvatarCandidate) => {
    // The front cannot change while a sheet is generating (it was made from the front now on
    // screen) or while another pick is already in flight.
    if (!avatarId || picking || generatingSheet) return;
    setPicking(candidate.generationId);
    try {
      onAvatar(await avatarsService.pickFront(clientId, avatarId, candidate.generationId));
    } catch (e) {
      toast.error(errorMessage(e, "Could not set the front image"));
    } finally {
      setPicking(null);
    }
  }, [clientId, avatarId, picking, generatingSheet, onAvatar]);

  const generateSheet = useCallback(async (modelId: string) => {
    if (!avatarId || generatingSheet) return;
    setGeneratingSheet(true);
    try {
      const { avatar, spentCredits: total } = await avatarsService.generateSheet(clientId, avatarId, modelId);
      onAvatar(avatar);
      applySpent(total);
    } catch (e) {
      toast.error(errorMessage(e, "Could not generate the profile sheet"));
      // A 409 here (the front changed mid-generation) has already charged credits for the
      // image the server made — refetch so the total on screen includes it.
      await refreshSpentCredits(avatarId);
    } finally {
      setGeneratingSheet(false);
    }
  }, [clientId, avatarId, generatingSheet, onAvatar, refreshSpentCredits, applySpent]);

  return {
    candidates, pending, spentCredits, picking, generatingSheet,
    composer, setComposer, sheetModelId, setSheetModelId,
    generate, pickFront, generateSheet,
  };
}
