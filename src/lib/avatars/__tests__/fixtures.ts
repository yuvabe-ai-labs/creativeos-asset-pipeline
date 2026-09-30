import type { Avatar, AvatarImage, AvatarImageSource } from "../schema";

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

/** A complete, ready avatar with an uploaded, declared front image. Override to break it. */
export function makeAvatar(overrides: Partial<Avatar> = {}): Avatar {
  return {
    id: "a1", clientId: "c1", name: "Riya", story: "",
    personType: "specific", likenessConfirmedBy: "user-1", likenessConfirmedAt: "2026-09-30T10:05:00.000Z",
    front: makeImage(), sheet: makeImage(), sheetStale: false,
    voice: null, voiceSample: null, status: "ready", archivedAt: null,
    createdAt: "2026-09-30T10:00:00.000Z", updatedAt: "2026-09-30T10:05:00.000Z",
    ...overrides,
  };
}
