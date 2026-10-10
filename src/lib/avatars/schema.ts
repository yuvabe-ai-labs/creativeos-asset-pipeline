// D287/D288 — a client-level avatar. Pure types: imported by routes, the DAL and the browser.

import type { AvatarAttributes, AvatarStyleId } from "./constants";

export type PersonType = "generic" | "specific";
export type AvatarStatus = "draft" | "ready";
export type AvatarImageSlot = "front" | "sheet";

// D340 — the sheet is four views for every avatar (supersedes D288's single three-view image).
export type AvatarViewId = "front" | "left" | "right" | "back";
/** Each view is its own 3:4 image made from the front image. Null while a view has not been
 *  made yet, or its generation failed. */
export type AvatarSheetViews = Record<AvatarViewId, AvatarImage | null>;

/** What a sheet draws for each view: only the URL. A live avatar's views fit it, and so does a
 *  shared version's frozen snapshot (spec 4), which keeps URLs only. */
export type AvatarViewImages = Record<AvatarViewId, Pick<AvatarImage, "url"> | null>;

// D288 — how an image came to exist. Seedance eligibility (D290, plan 2) is computed from the
// `generated` fields and never stored, so they are recorded from day one.
export type AvatarImageSource =
  | { kind: "upload"; filename: string; uploadedBy: string; uploadedAt: string }
  | {
      kind: "generated";
      modelId: string;
      mode: "text" | "edit";
      prompt: string;
      generatedAt: string;
      generationId: string;
      untouched: boolean;
    };

export type AvatarImage = {
  url: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  source: AvatarImageSource;
};

// D293 — the avatar's voice declaration. "native" is the engine's own generated voice ("Choose a
// voice for me"); "named" is an ElevenLabs account voice, applied by re-voicing after generation.
// D301 — a native voice carries the ElevenLabs voice cloned from its preview (`autoVoice`, paired
// with the voice sample by `sourceKey`), so it follows the avatar onto every model; a named voice
// records which Studio card it came from (`origin`, missing = "library").
export type AvatarVoiceMode = "native" | "named";
export type AvatarVoice =
  | { mode: "native"; autoVoice?: { voiceId: string; sourceKey: string } }
  | {
      mode: "named";
      voiceId: string;
      name: string;
      labels: Record<string, string | undefined>;
      previewUrl: string | null;
      origin?: "library" | "custom";
    };

export type AvatarVoiceSample = { url: string; durationSeconds: number; sourceKey: string };

// One generated front image the operator can pick (plan 2). Read back from `generations`;
// no table of its own.
export type AvatarCandidate = {
  generationId: string;
  batchId: string | null;
  url: string;
  modelId: string;
  createdAt: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
};

// The avatar speaking one line (D294, D296). Read back from `generations`; no table of its own.
// `mode` is which engine made it — a named ElevenLabs voice through Omni, or the engine's own
// voice through Seedance — and `voiceId`/`frontUrl` are what it was made with, so the Studio can
// tell when it no longer shows this avatar. A native preview has no `voiceId`.
export type VoicePreview = {
  generationId: string;
  mode: "named" | "native";
  status: "running" | "succeeded" | "failed";
  url: string | null;
  line: string;
  voiceId: string | null;
  voiceName: string;
  frontUrl: string;
  error: string | null;
  createdAt: string;
};

export type Avatar = {
  id: string;
  clientId: string;
  name: string;
  story: string;
  // Derived from the front image's source: an upload makes it "specific", a generated
  // image makes it "generic". Null until there is a front image.
  personType: PersonType | null;
  // Who confirmed permission to use this person's likeness, and when. Null for a generated
  // front, or an upload not yet confirmed; cleared whenever the front image is replaced.
  likenessConsentBy: string | null;
  likenessConsentAt: string | null;
  front: AvatarImage | null;
  sheet: AvatarImage | null;
  /** D340 — the four views. Null for an avatar whose sheet is the older three-view image or an
   *  upload from before D340 (both kept until the views are generated), or that has none. When
   *  all four exist, `sheet` holds them composed side by side, so everything that sends the sheet
   *  (D308) is unchanged. */
  sheetViews: AvatarSheetViews | null;
  sheetStale: boolean;
  voice: AvatarVoice | null;
  voiceSample: AvatarVoiceSample | null;
  status: AvatarStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// The front-generation composer's shape (plan 2) — one Generate call's worth of input. Also
// used as the Describe panel's persisted draft state (useAvatarGeneration's `composer`), since
// the draft is exactly what a Generate click needs.
export type GenerateFrontInput = {
  description: string;
  attributes: AvatarAttributes;
  styleId: AvatarStyleId;
  modelId: string;
  count: number;
};
