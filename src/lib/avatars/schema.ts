// D287/D288 — a client-level avatar. Pure types: imported by routes, the DAL and the browser.

import type { AvatarAttributes, AvatarStyleId } from "./constants";

export type PersonType = "generic" | "specific";
export type AvatarStatus = "draft" | "ready";
export type AvatarImageSlot = "front" | "sheet";

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

// D293 — the avatar's voice declaration. "native" is the engine's own generated voice; "named"
// is an ElevenLabs account voice, applied by re-voicing after generation.
export type AvatarVoiceMode = "native" | "named";
export type AvatarVoice =
  | { mode: "native" }
  | {
      mode: "named";
      voiceId: string;
      name: string;
      labels: Record<string, string | undefined>;
      previewUrl: string | null;
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
