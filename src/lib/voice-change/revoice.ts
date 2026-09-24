import type { RevoicePayload } from "./types";

export type RevoiceDeps = {
  fetchBytes: (url: string) => Promise<Buffer>;
  extractAudio: (video: Buffer) => Promise<Buffer>;
  speechToSpeech: (args: { audio: Buffer; voiceId: string }) => Promise<Buffer>;
  replaceAudio: (video: Buffer, audio: Buffer) => Promise<Buffer>;
  putBytes: (url: string, body: Buffer, contentType: string) => Promise<void>;
};

/**
 * D282 — the video-revoice task's steps. Throws on any failure: the task's own retry policy
 * re-runs just this, never the paid video generation.
 */
export async function revoiceVideo(payload: RevoicePayload, deps: RevoiceDeps): Promise<void> {
  const video = await deps.fetchBytes(payload.sourceUrl);
  const audio = await deps.extractAudio(video);
  const voiced = await deps.speechToSpeech({ audio, voiceId: payload.voiceId });
  const final = await deps.replaceAudio(video, voiced);
  await deps.putBytes(payload.revoicedPutUrl, final, "video/mp4");
}
