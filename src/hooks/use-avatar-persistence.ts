"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { removeAvatar, upsertAvatar, type SavedAvatar } from "@/lib/avatars/local-store";

type Fields = Omit<SavedAvatar, "id" | "updatedAt">;

/** Save / delete for both avatar editors; each returns to the client's Avatars gallery. */
export function useAvatarPersistence(clientId: string, clientSlug: string, avatarId?: string) {
  const router = useRouter();
  const galleryHref = `/clients/${clientSlug}/avatar`;

  function save(fields: Fields) {
    // An uploaded custom-voice sample plays from a blob: URL that dies with the tab — don't store it.
    const voice =
      fields.voice?.previewUrl?.startsWith("blob:") ? { ...fields.voice, previewUrl: null } : fields.voice;
    try {
      upsertAvatar(clientId, { ...fields, voice, id: avatarId ?? crypto.randomUUID(), updatedAt: Date.now() });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the avatar.");
      return;
    }
    toast.success(`${fields.name} saved.`);
    router.push(galleryHref);
  }

  function remove() {
    if (!avatarId) return;
    removeAvatar(clientId, avatarId);
    router.push(galleryHref);
  }

  return { save, remove };
}
