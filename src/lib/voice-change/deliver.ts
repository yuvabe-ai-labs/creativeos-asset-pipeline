import type { RevoiceResult, VoiceMeta, VoicePayload } from "./types";

export type DeliverDeps = {
  fetchProviderVideo: (url: string) => Promise<Buffer>;
  putBytes: (url: string, body: Buffer, contentType: string) => Promise<void>;
  revoice: (args: { sourceUrl: string; voiceId: string; revoicedPutUrl: string }) => Promise<RevoiceResult>;
};

/** The original couldn't be downloaded or stored — there is nothing to fall back to. */
export class OriginalStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OriginalStoreError";
  }
}

/**
 * D282 — video-generate's voice branch. Stores the original BEFORE re-voicing, so a failed voice
 * change still delivers the paid-for video. Only an unstorable original throws.
 */
export async function deliverWithVoice(
  args: { providerVideoUrl: string; voice: VoicePayload },
  deps: DeliverDeps,
): Promise<{ videoUrl: string; meta: { voice: VoiceMeta } }> {
  const { voice } = args;
  try {
    const original = await deps.fetchProviderVideo(args.providerVideoUrl);
    await deps.putBytes(voice.originalPutUrl, original, "video/mp4");
  } catch (e) {
    throw new OriginalStoreError(
      `Video generated but could not be stored for voice change: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const result = await deps.revoice({
    sourceUrl: voice.originalUrl,
    voiceId: voice.voiceId,
    revoicedPutUrl: voice.revoicedPutUrl,
  });

  const base = { voiceId: voice.voiceId, voiceName: voice.voiceName, originalUrl: voice.originalUrl };
  return result.ok
    ? { videoUrl: voice.revoicedUrl, meta: { voice: { ...base, status: "applied" } } }
    : { videoUrl: voice.originalUrl, meta: { voice: { ...base, status: "failed", error: result.error } } };
}
