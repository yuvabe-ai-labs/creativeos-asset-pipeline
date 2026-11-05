import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { avatarKeys } from "@/hooks/queries/avatars";
import { voiceDeclarationKey } from "@/lib/avatars/voice-preview";
import { MEENAKSHI_AVATAR, readyAvatar } from "@/lib/scripts/visualise/__tests__/fixtures";
import type { Avatar, VoicePreview } from "@/lib/avatars/schema";
import { CastSlotSheet } from "../cast-slot-sheet";

const voice = { mode: "named", voiceId: "v1", name: "Kavya", labels: {}, previewUrl: null } as const;
const avatar = (): Avatar => readyAvatar(MEENAKSHI_AVATAR, "m", { voice });
const preview = (a: Avatar, over: Partial<VoicePreview> = {}): VoicePreview => ({
  generationId: "g1", mode: "named", status: "succeeded", url: "https://cdn/preview.mp4", line: "Hi",
  voiceId: "v1", voiceName: "Kavya", frontUrl: a.front!.url, error: null, createdAt: "2026-11-01T00:00:00.000Z", ...over,
} as VoicePreview);

const render = (a: Avatar, p: VoicePreview | null) => {
  const client = new QueryClient();
  client.setQueryData([...avatarKeys.voicePreview("c1", a.id), voiceDeclarationKey(a.voice)], { preview: p, estimateCredits: 615 });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}><CastSlotSheet clientId="c1" name="Meenakshi" avatar={a} generating={false} /></QueryClientProvider>,
  );
};

describe("CastSlotSheet (D466: the preview plays beside the four views)", () => {
  it("plays a finished preview beside the sheet", () => {
    const a = avatar();
    expect(render(a, preview(a))).toMatch(/<video[^>]*src="https:\/\/cdn\/preview.mp4"/);
  });

  it("marks a preview made before the face or voice changed", () => {
    const a = avatar();
    expect(render(a, preview(a, { voiceId: "v0" }))).toContain("Out of date");
  });

  it("shows the sheet alone while a preview runs, or with none", () => {
    const a = avatar();
    expect(render(a, preview(a, { status: "running", url: null }))).not.toContain("<video");
    expect(render(a, null)).not.toContain("<video");
  });
});
