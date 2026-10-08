"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { avatarsService } from "@/services/avatars.service";
import { useLinkCast, visualiseKeys } from "@/hooks/queries/visualise";
import { avatarKeys } from "@/hooks/queries/avatars";
import { AVATAR_DEFAULT_FRONT_MODEL_ID, AVATAR_DEFAULT_SHEET_MODEL_ID, AVATAR_STYLES } from "@/lib/avatars/constants";
import { errorMessage, validateAvatarImageFile } from "@/lib/avatars/utils";
import type { Avatar } from "@/lib/avatars/schema";
import type { CastMember } from "@/lib/scripts/schema";
import {
  avatarFieldsFor, finishAvatar, makeGeneratedAvatar, reusableFor, type MakerDeps, type MakerStep,
} from "@/lib/scripts/visualise/maker";

export type SlotStep = MakerStep | "upload" | "consent" | "link";

// D338 — one cast slot's avatar maker. Every call goes through the Avatar Studio's own routes,
// so what Visualise makes is the same client Avatar the Studio makes (spec §5.1).
export function useCastAvatarMaker({ clientId, scriptId, member, avatar }: {
  clientId: string;
  scriptId: string;
  member: CastMember;
  avatar: Avatar | null;
}) {
  const queryClient = useQueryClient();
  const linkCast = useLinkCast(clientId, scriptId);
  const [step, setStep] = useState<SlotStep | null>(null);

  const refresh = useCallback(() => Promise.all([
    queryClient.invalidateQueries({ queryKey: visualiseKeys.board(clientId, scriptId) }),
    queryClient.invalidateQueries({ queryKey: avatarKeys.list(clientId) }),
  ]), [queryClient, clientId, scriptId]);

  const deps: MakerDeps = useMemo(() => ({
    createAndLink: async (fields) => {
      const created = await avatarsService.create(clientId, fields);
      await linkCast.mutateAsync({ castId: member.id, avatarId: created.id });
      return created;
    },
    generateFront: async (avatarId, description) => {
      const { candidate } = await avatarsService.generateFront(clientId, avatarId, {
        description, attributes: {}, styleId: AVATAR_STYLES[0].id,
        modelId: AVATAR_DEFAULT_FRONT_MODEL_ID, batchId: crypto.randomUUID(),
      });
      return { generationId: candidate.generationId };
    },
    pickFront: (avatarId, generationId) => avatarsService.pickFront(clientId, avatarId, generationId),
    generateViews: async (avatarId, views) => {
      const { avatar: updated, failed } = await avatarsService.generateSheet(clientId, avatarId, AVATAR_DEFAULT_SHEET_MODEL_ID, views);
      for (const f of failed) toast.error(`The ${f.label} view failed: ${f.error}`);
      return updated;
    },
    markReady: (avatarId) => avatarsService.update(clientId, avatarId, { status: "ready" }),
    onStep: setStep,
  }), [clientId, member.id, linkCast]);

  const run = useCallback(async (work: () => Promise<unknown>, fallback: string) => {
    try {
      await work();
    } catch (e) {
      toast.error(errorMessage(e, fallback));
    } finally {
      setStep(null);
      await refresh();
    }
  }, [refresh]);

  return {
    step,
    busy: step !== null,
    /** Re-reads the board and the avatar list, e.g. after a voice change. */
    refresh,
    make: (instructions: string, fresh: boolean) =>
      run(() => makeGeneratedAvatar(deps, { member, avatar, instructions, fresh }), "Could not make the avatar"),
    finish: () => (avatar ? run(() => finishAvatar(deps, avatar), "Could not finish the avatar") : Promise.resolve()),
    uploadPhoto: (file: File) =>
      run(async () => {
        const invalid = validateAvatarImageFile(file);
        if (invalid) throw new Error(invalid);
        setStep("upload");
        const target = reusableFor("photo", avatar) ?? (await deps.createAndLink(avatarFieldsFor(member)));
        await avatarsService.uploadImage(clientId, target.id, "front", file);
      }, "Could not upload the photo"),
    confirmConsent: () =>
      avatar?.front
        ? run(async () => {
            setStep("consent");
            await avatarsService.update(clientId, avatar.id, { consent: { frontUrl: avatar.front!.url } });
          }, "Could not confirm the permission")
        : Promise.resolve(),
    pick: (avatarId: string) =>
      run(async () => {
        setStep("link");
        await linkCast.mutateAsync({ castId: member.id, avatarId });
      }, "Could not use that avatar"),
    change: () =>
      run(async () => {
        setStep("link");
        await linkCast.mutateAsync({ castId: member.id, avatarId: null });
      }, "Could not change the avatar"),
  };
}
