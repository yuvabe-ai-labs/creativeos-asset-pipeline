import {
  AVATAR_IMAGE_EXTENSIONS, AVATAR_IMAGE_MAX_BYTES, AVATAR_IMAGE_MAX_LABEL,
  AVATAR_NAME_MAX, AVATAR_STORY_MAX, READINESS_GAP_LABELS,
} from "./constants";
import type { Avatar, AvatarImage } from "./schema";

export type ReadinessGap = keyof typeof READINESS_GAP_LABELS;

// The fields readiness depends on — a Pick, so the Studio can ask before an avatar row exists.
export type ReadinessInput = Pick<Avatar, "name" | "front" | "sheet" | "sheetStale">;

export type AvatarPatch = Partial<Pick<
  Avatar,
  "name" | "story" | "personType" | "front" | "sheet" | "sheetStale" | "status"
>>;

export type AvatarUpdateInput = {
  name?: string;
  story?: string;
  status?: "ready";
};

export function avatarReadinessGaps(avatar: ReadinessInput): ReadinessGap[] {
  const gaps: ReadinessGap[] = [];
  if (!avatar.name.trim()) gaps.push("name");
  if (!avatar.front) gaps.push("front");
  if (!avatar.sheet) gaps.push("sheet");
  else if (avatar.sheetStale) gaps.push("sheet-stale");
  return gaps;
}

export function isAvatarReady(avatar: ReadinessInput): boolean {
  return avatarReadinessGaps(avatar).length === 0;
}

/** A new front is a new face: any sheet made from the old one is stale, and the person type
 *  follows the new image's source — an upload is a specific person, a generated image is
 *  generic. */
export function frontChangePatch(current: Avatar, image: AvatarImage): AvatarPatch {
  return {
    front: image,
    sheetStale: current.sheet !== null,
    personType: image.source.kind === "generated" ? "generic" : "specific",
  };
}

export function sheetChangePatch(image: AvatarImage): AvatarPatch {
  return { sheet: image, sheetStale: false };
}

/** A ready avatar that no longer meets the bar goes back to draft. */
export function withStatus(current: Avatar, patch: AvatarPatch): AvatarPatch {
  const merged = { ...current, ...patch };
  if (merged.status === "ready" && !isAvatarReady(merged)) return { ...patch, status: "draft" };
  return patch;
}

export function planAvatarUpdate(
  current: Avatar,
  input: AvatarUpdateInput,
): { ok: true; patch: AvatarPatch } | { ok: false; error: string } {
  const patch: AvatarPatch = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length > AVATAR_NAME_MAX) {
      return { ok: false, error: `The name can be at most ${AVATAR_NAME_MAX} characters.` };
    }
    patch.name = name;
  }
  if (input.story !== undefined) {
    const story = input.story.trim();
    if (story.length > AVATAR_STORY_MAX) {
      return { ok: false, error: `The story can be at most ${AVATAR_STORY_MAX} characters.` };
    }
    patch.story = story;
  }
  if (input.status === "ready") {
    const gaps = avatarReadinessGaps({ ...current, ...patch });
    if (gaps.length > 0) {
      const needed = gaps.map((g) => READINESS_GAP_LABELS[g]).join(", ");
      return { ok: false, error: `Still needed: ${needed}.` };
    }
    patch.status = "ready";
  }
  return { ok: true, patch: withStatus(current, patch) };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postgres throws on a non-UUID id; callers use this to treat a malformed id as "not found"
 *  without querying. */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Browser and server share this, so the message is the same before and after the upload. */
export function validateAvatarImageFile(file: { name: string; size: number }): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!AVATAR_IMAGE_EXTENSIONS.has(ext)) {
    return `Unsupported file type '.${ext}'. Allowed: ${[...AVATAR_IMAGE_EXTENSIONS].join(", ")}.`;
  }
  if (file.size > AVATAR_IMAGE_MAX_BYTES) {
    return `This image is larger than the ${AVATAR_IMAGE_MAX_LABEL} limit.`;
  }
  return null;
}
