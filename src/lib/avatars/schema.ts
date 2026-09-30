// D287/D288 — a client-level avatar. Pure types: imported by routes, the DAL and the browser.

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

export type AvatarVoice = {
  voiceId: string;
  name: string;
  labels: Record<string, string>;
  previewUrl: string | null;
};

export type AvatarVoiceSample = { url: string; durationSeconds: number; sourceKey: string };

export type Avatar = {
  id: string;
  clientId: string;
  name: string;
  story: string;
  // Derived from the front image's source: an upload makes it "specific", a generated
  // image makes it "generic". Null until there is a front image.
  personType: PersonType | null;
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
