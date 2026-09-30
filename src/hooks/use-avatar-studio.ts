"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { avatarsService } from "@/services/avatars.service";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { avatarReadinessGaps, validateAvatarImageFile } from "@/lib/avatars/utils";
import type { Avatar, AvatarImageSlot, PersonType } from "@/lib/avatars/schema";

const SAVE_DELAY_MS = 600;
const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

// D287 — the Avatar Studio's state. `initialAvatar` is null on /avatars/new: no row exists until
// the first upload, which creates the draft (carrying the name and story typed so far) and then
// moves the URL to /avatars/<id> so a reload resumes the same draft.
export function useAvatarStudio({
  clientId, clientSlug, initialAvatar,
}: { clientId: string; clientSlug: string; initialAvatar: Avatar | null }) {
  const router = useRouter();
  const [avatar, setAvatar] = useState<Avatar | null>(initialAvatar);
  const [name, setNameState] = useState(initialAvatar?.name ?? "");
  const [story, setStoryState] = useState(initialAvatar?.story ?? "");
  const [uploading, setUploading] = useState<AvatarImageSlot | null>(null);
  const [saving, setSaving] = useState(false);
  const createdHere = useRef(false);
  const libraryHref = `/clients/${clientSlug}/avatars`;

  // Typing alone never creates a draft; it is saved once the avatar exists.
  const saveFields = useDebouncedCallback((fields: { name: string; story: string }) => {
    if (!avatar) return;
    avatarsService.update(clientId, avatar.id, fields).then(setAvatar).catch((e) => {
      toast.error(message(e, "Could not save"));
    });
  }, SAVE_DELAY_MS);

  const setName = useCallback((next: string) => {
    setNameState(next);
    saveFields({ name: next, story });
  }, [saveFields, story]);

  const setStory = useCallback((next: string) => {
    setStoryState(next);
    saveFields({ name, story: next });
  }, [saveFields, name]);

  const uploadImage = useCallback(async (slot: AvatarImageSlot, file: File) => {
    const invalid = validateAvatarImageFile(file);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setUploading(slot);
    try {
      let target = avatar;
      if (!target) {
        target = await avatarsService.create(clientId, { name, story });
        createdHere.current = true;
        setAvatar(target);
      }
      setAvatar(await avatarsService.uploadImage(clientId, target.id, slot, file));
      if (createdHere.current) {
        createdHere.current = false;
        router.replace(`${libraryHref}/${target.id}`);
      }
    } catch (e) {
      toast.error(message(e, "Upload failed"));
    } finally {
      setUploading(null);
    }
  }, [avatar, clientId, name, story, router, libraryHref]);

  const declare = useCallback(async (personType: PersonType) => {
    if (!avatar) return;
    try {
      setAvatar(await avatarsService.update(clientId, avatar.id, { declaration: { personType } }));
    } catch (e) {
      toast.error(message(e, "Could not save the declaration"));
    }
  }, [avatar, clientId]);

  const markReady = useCallback(async () => {
    if (!avatar) return;
    setSaving(true);
    try {
      await avatarsService.update(clientId, avatar.id, { name, story, status: "ready" });
      toast.success("Avatar saved");
      router.push(libraryHref);
    } catch (e) {
      toast.error(message(e, "Could not save the avatar"));
    } finally {
      setSaving(false);
    }
  }, [avatar, clientId, name, story, router, libraryHref]);

  const archive = useCallback(async () => {
    if (!avatar) return;
    try {
      await avatarsService.archive(clientId, avatar.id);
      router.push(libraryHref);
    } catch (e) {
      toast.error(message(e, "Could not archive the avatar"));
    }
  }, [avatar, clientId, router, libraryHref]);

  // `name` comes from local state so the list updates as the operator types.
  const gaps = avatarReadinessGaps({
    name,
    front: avatar?.front ?? null,
    sheet: avatar?.sheet ?? null,
    sheetStale: avatar?.sheetStale ?? false,
    personType: avatar?.personType ?? null,
    likenessConfirmedAt: avatar?.likenessConfirmedAt ?? null,
  });

  return {
    avatar, name, story, gaps, uploading, saving,
    setName, setStory, uploadImage, declare, markReady, archive,
  };
}
