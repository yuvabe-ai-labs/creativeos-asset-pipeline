import { PERSON_TYPE_LABELS } from "./constants";
import { hasFourViews, needsLikenessConsent, sheetKind } from "./utils";
import { isVoicePreviewStale } from "./voice-preview";
import { avatarVoiceLabel } from "./voice";
import type { Avatar, AvatarVoice, VoicePreview } from "./schema";

/** D340 — the sheet's state in one word, for the stepper and the summary card. */
export function sheetStatusLabel(
  avatar: Pick<Avatar, "sheet" | "sheetViews" | "sheetStale"> | null,
  optional: string,
): string {
  if (!avatar) return optional;
  const kind = sheetKind(avatar);
  if (kind === "none") return optional;
  if (avatar.sheetStale) return "Out of date";
  if (kind === "four-view") return hasFourViews(avatar) ? "Four views" : "Missing a view";
  if (kind === "three-view") return "Three views";
  return "Older sheet"; // an upload from before D340 ended sheet uploads
}

/** D301 — the Voice step's three cards. */
export type VoiceChoice = "auto" | "library" | "custom";

/** The card a declaration came from: the voice chosen for the avatar, a library voice, or a voice
 *  made from a recording. Declarations from before D301 carry no origin and read as library. */
export function voiceChoiceOf(voice: AvatarVoice | null): VoiceChoice | null {
  if (!voice) return null;
  if (voice.mode === "native") return "auto";
  return voice.origin === "custom" ? "custom" : "library";
}

// D297 — the Avatar Studio's rules: its five steps, which are done, which are open, where the
// Studio opens, each step's status line, and the avatar's lifecycle. Pure, so the stepper, the
// footer and the summary all read the same answers (spec §4.0, §4.6).

export type StudioStepId = "name" | "look" | "sheet" | "voice" | "preview";

export type StudioStep = {
  id: StudioStepId;
  /** In the stepper and in "Continue to …" / "Back to …". */
  title: string;
  /** The panel's heading. */
  heading: string;
  /** One line under the heading: what the step is for. */
  lede: string;
  optional: boolean;
};

// The name comes first: the preview has the avatar say it ("Hi, I'm {name}…"), so it is needed
// before anything else. Saving to the library is the last step's footer action.
export const STUDIO_STEPS: readonly StudioStep[] = [
  {
    id: "name", title: "Name", heading: "Name", optional: false,
    lede: "What this avatar is called.",
  },
  {
    id: "look", title: "Look", heading: "Front image", optional: false,
    lede: "Facing the camera, waist-up, even light, plain background. Every video model starts from this image.",
  },
  {
    id: "sheet", title: "Profile sheet", heading: "Profile sheet", optional: true,
    lede: "Front, left, right and back, head to toe, each made from the front image. It keeps the face the same in every storyboard panel.",
  },
  {
    id: "voice", title: "Voice", heading: "Voice", optional: true,
    lede: "How this avatar sounds in every video.",
  },
  {
    id: "preview", title: "Preview", heading: "Preview", optional: true,
    lede: "Generate a preview to see and hear the avatar, then save to library.",
  },
];

type StudioAvatar = Pick<
  Avatar,
  "name" | "front" | "likenessConsentAt" | "sheet" | "sheetViews" | "sheetStale" | "voice" | "voiceSample" | "status"
>;

/** Everything the rules read. `name` is the one being typed, which runs ahead of the stored one;
 *  `skipped` is this visit's optional steps left with Continue, and is never stored. */
export type StudioSnapshot = {
  avatar: StudioAvatar | null;
  name: string;
  preview: Pick<VoicePreview, "status" | "mode" | "voiceId" | "frontUrl"> | null;
  sheetGenerating: boolean;
  /** The preview is still being read, so whether Preview is done is not yet known. */
  previewLoading?: boolean;
  skipped: ReadonlySet<StudioStepId>;
};

/** A step whose state is still being read — the stepper shows a placeholder for it rather than
 *  calling it not done and then flipping to done a moment later. */
export function isStepLoading(id: StudioStepId, snap: StudioSnapshot): boolean {
  return id === "preview" && Boolean(snap.previewLoading);
}

/** Look is done with a front image — and, for an uploaded photo, the confirmed permission. */
export function isLookDone(avatar: Pick<Avatar, "front" | "likenessConsentAt"> | null): boolean {
  return Boolean(avatar?.front) && !needsLikenessConsent(avatar!);
}

export function isStepDone(id: StudioStepId, snap: StudioSnapshot): boolean {
  const a = snap.avatar;
  switch (id) {
    case "name": return snap.name.trim().length > 0;
    case "look": return isLookDone(a);
    case "sheet": return Boolean(a?.sheet) && !a?.sheetStale;
    case "voice": return Boolean(a?.voice);
    case "preview":
      return Boolean(a) && snap.preview?.status === "succeeded" && !isVoicePreviewStale(snap.preview, a!);
  }
}

/** Name is always open; Look opens once there is a name; the rest once Look is done too. An
 *  avatar already in the library opens every step while it has a name — the operator is editing
 *  it, not creating it. */
export function isStepOpen(id: StudioStepId, snap: StudioSnapshot): boolean {
  if (id === "name") return true;
  if (!snap.name.trim()) return false;
  return id === "look" || isLookDone(snap.avatar) || snap.avatar?.status === "ready";
}

/**
 * Where the Studio opens, from what is stored: Name until there is one, then Look until it is
 * done. A draft past that opens on its first unfinished optional step; an avatar in the library on
 * the last step, where Done is.
 */
export function studioOpeningStep(avatar: StudioAvatar | null): StudioStepId {
  if (!avatar?.name.trim()) return "name";
  if (!isLookDone(avatar)) return "look";
  if (avatar.status === "ready") return "preview";
  if (!avatar.sheet || avatar.sheetStale) return "sheet";
  if (!avatar.voice) return "voice";
  return "preview";
}

/** The one-line status under each step's title in the stepper (spec §4.0). */
export function stepStatusLine(id: StudioStepId, snap: StudioSnapshot): string {
  const a = snap.avatar;
  const optional = snap.skipped.has(id) ? "Skipped" : "Optional";
  switch (id) {
    case "name":
      return snap.name.trim() || "Needed";
    case "look": {
      if (!a?.front) return "Needed";
      if (a.front.source.kind === "upload") return isLookDone(a) ? PERSON_TYPE_LABELS.specific : "Needs permission";
      return PERSON_TYPE_LABELS.generic;
    }
    case "sheet":
      if (snap.sheetGenerating) return "Generating…";
      return sheetStatusLabel(a, optional);
    case "voice":
      return avatarVoiceLabel(a?.voice ?? null) ?? optional;
    case "preview": {
      const p = snap.preview;
      if (p?.status === "running") return "Generating…";
      if (p?.status === "succeeded" && a) {
        if (isVoicePreviewStale(p, a)) return "Out of date";
        return p.mode === "native" && a.voiceSample ? "Voice kept" : "Clip ready";
      }
      return optional;
    }
  }
}

export type AvatarLifecycle = "new" | "draft" | "library";

/** New before any row exists; a draft from the first Generate or upload (the row owns the spent
 *  credits); in the library once saved. The header's ⋯ menu follows it (spec §4.6). */
export function avatarLifecycle(avatar: Pick<Avatar, "status"> | null): AvatarLifecycle {
  if (!avatar) return "new";
  return avatar.status === "ready" ? "library" : "draft";
}

/** How the face was made, for the summary card. */
export function avatarFaceLabel(avatar: Pick<Avatar, "front">): string | null {
  if (!avatar.front) return null;
  // D301 — no model names: what made the face is the Studio's business, not the operator's.
  return avatar.front.source.kind === "upload" ? PERSON_TYPE_LABELS.specific : PERSON_TYPE_LABELS.generic;
}
