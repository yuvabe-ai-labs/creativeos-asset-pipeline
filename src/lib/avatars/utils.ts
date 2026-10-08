import {
  AVATAR_IMAGE_CONTENT_TYPES, AVATAR_IMAGE_EXTENSION_CONTENT_TYPES, AVATAR_IMAGE_EXTENSIONS,
  AVATAR_IMAGE_MAX_BYTES, AVATAR_IMAGE_MAX_LABEL, AVATAR_NAME_MAX, AVATAR_STORY_MAX,
  AVATAR_VIEWS, LIKENESS_CONSENT_CHANGED_ERROR, READINESS_GAP_LABELS,
} from "./constants";
import type { Avatar, AvatarImage, AvatarSheetViews, AvatarViewId } from "./schema";
import { voiceAfterFrontChange } from "./voice";

export type ReadinessGap = keyof typeof READINESS_GAP_LABELS;

// The fields readiness depends on — a Pick, so the Studio can ask before an avatar row exists.
export type ReadinessInput = Pick<
  Avatar, "name" | "front" | "sheet" | "sheetStale" | "likenessConsentAt"
>;

export type AvatarPatch = Partial<Pick<
  Avatar,
  | "name" | "story" | "personType" | "front" | "sheet" | "sheetStale" | "sheetViews" | "status"
  | "likenessConsentBy" | "likenessConsentAt" | "voice" | "voiceSample"
>>;

export type AvatarUpdateInput = {
  name?: string;
  story?: string;
  status?: "ready";
  // The front image the operator saw when they ticked the statement — bound so consent never
  // attaches to a photo they never looked at (D289 amended).
  consent?: { frontUrl: string };
};

/** A real person's likeness needs a consent record. Only an uploaded front is ever a real
 *  person, so a generated front never needs — or carries — one. */
export function needsLikenessConsent(avatar: Pick<Avatar, "front" | "likenessConsentAt">): boolean {
  return avatar.front?.source.kind === "upload" && !avatar.likenessConsentAt;
}

export function avatarReadinessGaps(avatar: ReadinessInput): ReadinessGap[] {
  const gaps: ReadinessGap[] = [];
  if (!avatar.name.trim()) gaps.push("name");
  if (!avatar.front) gaps.push("front");
  if (needsLikenessConsent(avatar)) gaps.push("consent");
  return gaps;
}

export function isAvatarReady(avatar: ReadinessInput): boolean {
  return avatarReadinessGaps(avatar).length === 0;
}

/** A new front is a new face: any sheet made from the old one is stale, the person type
 *  follows the new image's source — an upload is a specific person, a generated image is
 *  generic — and any consent on record is cleared, upload or not: a new photo may be a
 *  different person, so an upload asks again.
 *
 *  `sheetStale` is stated unconditionally (never gated on `current.sheet !== null`): a sheet
 *  written between this caller's read of `current` and its write would otherwise go unmarked,
 *  since the read that decided "no sheet yet" is already stale by the time the write lands.
 *  `avatarReadinessGaps` only turns this into the "sheet-stale" gap when a sheet actually
 *  exists, so stating it on a sheet-less avatar is inert until a sheet shows up. */
export function frontChangePatch(current: Avatar, image: AvatarImage): AvatarPatch {
  const personType = image.source.kind === "generated" ? "generic" : "specific";
  const voice = voiceAfterFrontChange(current.voice, personType);
  return {
    front: image,
    sheetStale: true,
    personType,
    likenessConsentBy: null,
    likenessConsentAt: null,
    // Only stated when the declaration stops being possible (a native voice on what is now a
    // real person, D293); a voice that survives the change is left untouched. The voice sample
    // goes with it (D296): it is the engine's own voice, and the engine a real person runs on
    // accepts no audio at all, so a sample left behind could never be sent anywhere.
    ...(voice !== current.voice ? { voice, voiceSample: null } : {}),
  };
}

/** D339 — a current four-view sheet: every view made, from the front image the avatar has now. */
export function hasFourViews(avatar: Pick<Avatar, "sheetViews" | "sheetStale">): boolean {
  const views = avatar.sheetViews;
  return !avatar.sheetStale && views !== null && AVATAR_VIEWS.every((v) => views[v] !== null);
}

export type SheetKind = "none" | "three-view" | "uploaded" | "four-view";

/** Which kind of sheet an avatar has. A generated single image is the older three-view sheet
 *  (D288); an uploaded one predates D339, which ended sheet uploads. Both are kept until the
 *  four views are generated. */
export function sheetKind(avatar: Pick<Avatar, "sheet" | "sheetViews">): SheetKind {
  if (avatar.sheetViews) return "four-view";
  if (!avatar.sheet) return "none";
  return avatar.sheet.source.kind === "upload" ? "uploaded" : "three-view";
}

/** The views a Generate would make: only the gaps in a current sheet, otherwise all four. */
export function missingViews(avatar: Pick<Avatar, "sheetViews" | "sheetStale">): AvatarViewId[] {
  const views = avatar.sheetViews;
  if (!views || avatar.sheetStale) return [...AVATAR_VIEWS];
  return AVATAR_VIEWS.filter((v) => views[v] === null);
}

/** D339 — the views a sheet request makes. Only the ones asked for when the sheet is current;
 *  all four when there are none or they show an older front, so views of two faces never mix. */
export function viewsToMake(
  current: Pick<Avatar, "sheetViews" | "sheetStale">,
  requested?: readonly AvatarViewId[],
): AvatarViewId[] {
  if (!requested || !current.sheetViews || current.sheetStale) return [...AVATAR_VIEWS];
  return AVATAR_VIEWS.filter((v) => requested.includes(v));
}

const NO_VIEWS: AvatarSheetViews = { front: null, left: null, right: null, back: null };

/** New views laid over the ones already made from this front (none, when they are out of date).
 *  `complete` is the full set once all four exist. `sheet` is cleared here: the caller composes
 *  the strip from `complete`, so video never gets an older strip beside newer views. */
export function sheetViewsPatch(
  current: Pick<Avatar, "sheetViews" | "sheetStale">,
  made: Partial<Record<AvatarViewId, AvatarImage>>,
): { patch: AvatarPatch; complete: Record<AvatarViewId, AvatarImage> | null } {
  const base = current.sheetViews && !current.sheetStale ? current.sheetViews : NO_VIEWS;
  const views: AvatarSheetViews = { ...base, ...made };
  const complete = AVATAR_VIEWS.every((v) => views[v] !== null)
    ? (views as Record<AvatarViewId, AvatarImage>)
    : null;
  return { patch: { sheetViews: views, sheetStale: false, sheet: null }, complete };
}

/** States `status: "draft"` whenever the merged avatar (`current` with `patch` applied) is
 *  incomplete — regardless of what `current.status` already was. Read-then-write races (a
 *  concurrent front or sheet write landing between this caller's read and write) mean the row
 *  actually being written over may no longer match `current`; if this patch only omits
 *  `status` when `current` already said "draft", a write that races a promotion to "ready"
 *  would leave "ready" on an incomplete avatar. Stating it every time the merge is incomplete
 *  closes that gap. Never promotes to ready — that only happens where the caller explicitly
 *  sets `status: "ready"` after checking readiness (see `planAvatarUpdate`). */
export function withStatus(current: Avatar, patch: AvatarPatch): AvatarPatch {
  const merged = { ...current, ...patch };
  if (!isAvatarReady(merged)) return { ...patch, status: "draft" };
  return patch;
}

export function planAvatarUpdate(
  current: Avatar,
  input: AvatarUpdateInput,
  ctx: { userId: string; now: string },
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
  // Runs before the readiness check below, so one request can confirm consent and mark the
  // avatar ready in the same call.
  if (input.consent) {
    if (current.front?.source.kind !== "upload") {
      return { ok: false, error: "Only an uploaded front image needs consent." };
    }
    // The operator ticked the box looking at a specific photo — a stale tab, a second
    // operator, or a front replacement racing this request must not attach it elsewhere.
    if (current.front.url !== input.consent.frontUrl) {
      return { ok: false, error: LIKENESS_CONSENT_CHANGED_ERROR };
    }
    // Already recorded for this exact front: a repeated confirmation is a no-op, keeping the
    // original who/when rather than overwriting it with the caller of the repeat.
    if (!current.likenessConsentAt) {
      patch.likenessConsentBy = ctx.userId;
      patch.likenessConsentAt = ctx.now;
    }
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

/** Browser and server share this too — both hooks that call service methods want "the error's
 *  message, or a fallback for a non-Error throw," and had each declared their own copy. */
export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

/** Some OSes report an empty `file.type` for certain image files (notably .jpg); others report
 *  a non-canonical type the sign route doesn't recognise (`image/jpg`, `image/pjpeg`). Either
 *  way, falls back to the extension so the signed upload still gets a content type the avatar
 *  sign route accepts, rather than the generic "application/octet-stream" it rejects. */
export function avatarImageContentType(file: { name: string; type: string }): string {
  if (file.type && AVATAR_IMAGE_CONTENT_TYPES.has(file.type)) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return AVATAR_IMAGE_EXTENSION_CONTENT_TYPES[ext] ?? "application/octet-stream";
}
