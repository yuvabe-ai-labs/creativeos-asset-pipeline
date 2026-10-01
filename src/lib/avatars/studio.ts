import { imageGenClientModelMap } from "@/lib/image-gen/client-models";
import { needsLikenessConsent } from "./utils";
import { isVoicePreviewStale } from "./voice-preview";
import type { Avatar, VoicePreview } from "./schema";

// D297 — the Avatar Studio's rules: its five steps, which are done, which are open, where the
// Studio opens, each step's status line, and the avatar's lifecycle. Pure, so the stepper, the
// footer and the summary all read the same answers (spec §4.0, §4.6).

export type StudioStepId = "look" | "sheet" | "voice" | "preview" | "save";

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

export const STUDIO_STEPS: readonly StudioStep[] = [
  {
    id: "look", title: "Look", heading: "Front image", optional: false,
    lede: "Facing the camera, waist-up, even light, plain background. Every video model starts from this image.",
  },
  {
    id: "sheet", title: "Profile sheet", heading: "Profile sheet", optional: true,
    lede: "Front, side and back, head to toe, in one wide image. It is for the people working on this avatar; no video model waits on it.",
  },
  {
    id: "voice", title: "Voice", heading: "Voice", optional: true,
    lede: "How this avatar sounds in every video.",
  },
  {
    id: "preview", title: "Preview", heading: "Preview", optional: true,
    lede: "See and hear the avatar speak before you put it in a video.",
  },
  {
    id: "save", title: "Name & save", heading: "Name & save", optional: false,
    lede: "Give the avatar a name. Saving puts it in this client's library, ready to use in videos.",
  },
];

type StudioAvatar = Pick<
  Avatar,
  "front" | "likenessConsentAt" | "sheet" | "sheetStale" | "voice" | "voiceSample" | "status"
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
    case "look": return isLookDone(a);
    case "sheet": return Boolean(a?.sheet) && !a?.sheetStale;
    case "voice": return Boolean(a?.voice);
    case "preview":
      return Boolean(a) && snap.preview?.status === "succeeded" && !isVoicePreviewStale(snap.preview, a!);
    case "save": return a?.status === "ready";
  }
}

/** Look is always open; the other four open once Look is done. An avatar already in the library
 *  opens every step — the operator is editing it, not creating it. */
export function isStepOpen(id: StudioStepId, snap: StudioSnapshot): boolean {
  return id === "look" || isLookDone(snap.avatar) || snap.avatar?.status === "ready";
}

/**
 * Where the Studio opens, from what is stored. A draft with Look done opens on its first
 * unfinished optional step. The preview loads after the page, so it is not consulted: an avatar
 * whose preview is already done still opens on Preview, one Continue away from saving.
 */
export function studioOpeningStep(avatar: StudioAvatar | null): StudioStepId {
  if (!avatar || !isLookDone(avatar)) return "look";
  if (avatar.status === "ready") return "save";
  if (!avatar.sheet || avatar.sheetStale) return "sheet";
  if (!avatar.voice) return "voice";
  return "preview";
}

function imageModelLabel(modelId: string): string {
  return imageGenClientModelMap[modelId]?.label ?? "another model";
}

/** The one-line status under each step's title in the stepper (spec §4.0). */
export function stepStatusLine(id: StudioStepId, snap: StudioSnapshot): string {
  const a = snap.avatar;
  const optional = snap.skipped.has(id) ? "Skipped" : "Optional";
  switch (id) {
    case "look": {
      if (!a?.front) return "Needed";
      if (a.front.source.kind === "upload") return isLookDone(a) ? "Uploaded photo" : "Needs permission";
      return imageModelLabel(a.front.source.modelId);
    }
    case "sheet":
      if (snap.sheetGenerating) return "Generating…";
      if (a?.sheet) return a.sheetStale ? "Out of date" : "Added";
      return optional;
    case "voice":
      if (a?.voice?.mode === "native") return "Engine's own voice";
      if (a?.voice?.mode === "named") return a.voice.name;
      return optional;
    case "preview": {
      const p = snap.preview;
      if (p?.status === "running") return "Generating…";
      if (p?.status === "succeeded" && a) {
        if (isVoicePreviewStale(p, a)) return "Out of date";
        return p.mode === "native" && a.voiceSample ? "Voice reference saved" : "Clip ready";
      }
      return optional;
    }
    case "save":
      if (a?.status === "ready") return "In the library";
      return snap.name.trim() ? "Ready to save" : "Needs a name";
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
  const source = avatar.front.source;
  return source.kind === "upload" ? "Real person" : `Generated · ${imageModelLabel(source.modelId)}`;
}
