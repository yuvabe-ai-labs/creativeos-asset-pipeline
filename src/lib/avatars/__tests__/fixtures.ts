import type { Avatar, AvatarImage, AvatarImageSource, AvatarSheetViews } from "../schema";

const UPLOAD: AvatarImageSource = {
  kind: "upload", filename: "face.png", uploadedBy: "user-1", uploadedAt: "2026-09-30T10:00:00.000Z",
};

export function makeImage(source: AvatarImageSource = UPLOAD): AvatarImage {
  return { url: "https://storage.googleapis.com/b/clients/c1/avatars/a1/front/face.png", width: 900, height: 1200, sizeBytes: 1000, source };
}

export const GENERATED: AvatarImageSource = {
  kind: "generated", modelId: "seedream:seedream-5-0-lite", mode: "text", prompt: "p",
  generatedAt: "2026-09-30T10:00:00.000Z", generationId: "gen-1", untouched: true,
};

/** A complete, ready avatar with an uploaded front image. Override to break it. */
export function makeAvatar(overrides: Partial<Avatar> = {}): Avatar {
  return {
    id: "a1", clientId: "c1", name: "Riya", story: "",
    personType: "specific",
    likenessConsentBy: "user-1", likenessConsentAt: "2026-09-30T10:05:00.000Z",
    front: makeImage(), sheet: makeImage(), sheetStale: false, sheetViews: null,
    voice: null, voiceSample: null, status: "ready", archivedAt: null,
    createdAt: "2026-09-30T10:00:00.000Z", updatedAt: "2026-09-30T10:05:00.000Z",
    ...overrides,
  };
}

/** A full four-view sheet (D340), each view a distinct generated image. */
export function makeViews(prefix = "v"): AvatarSheetViews {
  const view = (v: string): AvatarImage => {
    const source: AvatarImageSource = {
      kind: "generated", modelId: "gemini:gemini-3.1-flash-image", mode: "edit", prompt: "view",
      generatedAt: "2026-10-08T10:00:00.000Z", generationId: `${prefix}-${v}`, untouched: true,
    };
    return { url: `https://storage.googleapis.com/b/${prefix}-${v}.png`, width: 768, height: 1024, sizeBytes: 10, source };
  };
  return { front: view("front"), left: view("left"), right: view("right"), back: view("back") };
}
