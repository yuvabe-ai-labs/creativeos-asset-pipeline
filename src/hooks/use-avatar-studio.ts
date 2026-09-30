"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { avatarsService } from "@/services/avatars.service";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { avatarReadinessGaps, errorMessage, validateAvatarImageFile } from "@/lib/avatars/utils";
import { LIKENESS_CONSENT_CHANGED_ERROR } from "@/lib/avatars/constants";
import type { Avatar, AvatarImageSlot } from "@/lib/avatars/schema";

const SAVE_DELAY_MS = 600;

// A response is stale if it is older than what is already on screen — same server column
// (`updatedAt`), compared as dates. Applying it anyway could set a stale `status` (e.g.
// "Ready" beside "Still needed…") from a save that resolved out of order. `saveFields` and
// `confirmConsent` call this directly, merging only the fields they own on top of the current
// state; every other server response that replaces the whole avatar (upload, pick a front,
// generate the sheet) goes through `replaceAvatar` below, which applies the same guard.
function isStale(prev: Avatar, updated: Avatar): boolean {
  return new Date(updated.updatedAt).getTime() < new Date(prev.updatedAt).getTime();
}

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
  const [confirmingConsent, setConfirmingConsent] = useState(false);
  // The in-flight (or finished) draft creation. Kept so concurrent callers — an upload, or the
  // four requests of one Generate click — share a single draft instead of creating one each.
  const creatingRef = useRef<Promise<Avatar> | null>(null);
  // `uploading` state is stale inside `uploadImage` between renders (two quick calls can both
  // read it as null before either commits); the ref is checked synchronously instead.
  const uploadingRef = useRef(false);
  const libraryHref = `/clients/${clientSlug}/avatars`;

  // D287 amended (re-review) — `window.history.replaceState` in `ensureAvatar` below moves the
  // URL to /avatars/<id> without a navigation, so Next's router tree still thinks this is /new.
  // After Save navigates to the library, pressing Back can restore that /new tree under the
  // avatar's URL: a Studio with `initialAvatar === null` where an upload would create a SECOND
  // draft. A full reload re-renders from the server, which resolves the real avatar for that URL.
  useEffect(() => {
    if (initialAvatar === null && !window.location.pathname.endsWith("/new")) {
      window.location.reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Typing alone never creates a draft; it is saved once the avatar exists. Merges only the
  // fields a text save owns, so a save that resolves late never clobbers a newer image upload.
  const saveFields = useDebouncedCallback((fields: { name: string; story: string }) => {
    if (!avatar) return;
    avatarsService.update(clientId, avatar.id, fields)
      .then((updated) => {
        setAvatar((prev) => (prev && !isStale(prev, updated) ? {
          ...prev, name: updated.name, story: updated.story,
          status: updated.status, updatedAt: updated.updatedAt,
        } : prev ?? updated));
      })
      .catch((e) => {
        toast.error(errorMessage(e, "Could not save"));
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

  // Creates the draft the first time anything needs a row (an upload or a Generate click),
  // carrying the name and story typed so far, then moves the URL to /avatars/<id> in place.
  // Not router.replace: /new and /[avatarId] are different route segments, so that would
  // unmount and remount the Studio mid-flow. The Native History API integrates with the
  // Next.js router (app/getting-started/linking-and-navigating.md, "Native History API"), and
  // a reload still resumes this same draft.
  const ensureAvatar = useCallback((): Promise<Avatar> => {
    if (avatar) return Promise.resolve(avatar);
    creatingRef.current ??= avatarsService
      .create(clientId, { name, story })
      .then((created) => {
        setAvatar(created);
        window.history.replaceState(null, "", `${libraryHref}/${created.id}`);
        return created;
      })
      .catch((e) => {
        creatingRef.current = null;
        throw e;
      });
    return creatingRef.current;
  }, [avatar, clientId, name, story, libraryHref]);

  // The guarded full-replace for a server response that carries the whole avatar (an upload
  // here; a pick-a-front or generate-the-sheet response from `useAvatarGeneration`, which can
  // take minutes and so is especially likely to resolve after a newer edit is already on
  // screen). A stable identity (`useCallback`, no deps — it only closes over `setAvatar`) since
  // it is a dependency of callbacks in that hook.
  const replaceAvatar = useCallback((updated: Avatar) => {
    setAvatar((prev) => (prev && isStale(prev, updated) ? prev : updated));
  }, []);

  const uploadImage = useCallback(async (slot: AvatarImageSlot, file: File) => {
    // Two quick drops (or a front and a sheet drop together) must not both start: they'd
    // create two drafts, or race to clear each other's placeholder.
    if (uploadingRef.current) return;
    const invalid = validateAvatarImageFile(file);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    uploadingRef.current = true;
    setUploading(slot);
    try {
      const target = await ensureAvatar();
      replaceAvatar(await avatarsService.uploadImage(clientId, target.id, slot, file));
    } catch (e) {
      toast.error(errorMessage(e, "Upload failed"));
    } finally {
      uploadingRef.current = false;
      setUploading(null);
    }
  }, [clientId, ensureAvatar, replaceAvatar]);

  // Merges only the fields consent owns, so a response that resolves late never clobbers a
  // newer image upload (same guard as `saveFields`). Sends the front image currently on
  // screen, so the server can refuse a confirmation that no longer matches the real photo
  // (D289 amended).
  const confirmConsent = useCallback(async () => {
    if (!avatar?.front) return;
    setConfirmingConsent(true);
    try {
      const updated = await avatarsService.update(clientId, avatar.id, {
        consent: { frontUrl: avatar.front.url },
      });
      setAvatar((prev) => (prev && !isStale(prev, updated) ? {
        ...prev,
        likenessConsentBy: updated.likenessConsentBy,
        likenessConsentAt: updated.likenessConsentAt,
        status: updated.status,
        updatedAt: updated.updatedAt,
      } : prev ?? updated));
    } catch (e) {
      const msg = errorMessage(e, "Could not confirm");
      toast.error(msg);
      // The front image changed underneath the operator (a 409 from the DB precondition, or
      // the 400 planAvatarUpdate returns for the same reason) — reload so the screen shows the
      // real photo instead of the stale one the tick was given for.
      if (msg === LIKENESS_CONSENT_CHANGED_ERROR) {
        try {
          setAvatar(await avatarsService.get(clientId, avatar.id));
        } catch {
          // Best-effort refresh; the toast above already told the operator what happened.
        }
      }
    } finally {
      setConfirmingConsent(false);
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
      toast.error(errorMessage(e, "Could not save the avatar"));
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
      toast.error(errorMessage(e, "Could not archive the avatar"));
    }
  }, [avatar, clientId, router, libraryHref]);

  // `name` comes from local state so the list updates as the operator types.
  const gaps = avatarReadinessGaps({
    name,
    front: avatar?.front ?? null,
    sheet: avatar?.sheet ?? null,
    sheetStale: avatar?.sheetStale ?? false,
    likenessConsentAt: avatar?.likenessConsentAt ?? null,
  });

  return {
    avatar, name, story, gaps, uploading, saving, confirmingConsent,
    setName, setStory, uploadImage, markReady, archive, confirmConsent,
    ensureAvatar, replaceAvatar,
  };
}
