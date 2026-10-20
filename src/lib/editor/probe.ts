// Media facts from a file's header (D391), ported from the rough-cut spike's browser probe to run
// on the server. Over a URL, mediabunny reads only what it needs with range requests: measured
// 2026-10-20, about 288 KB of a 5.15 MB CreativeOS clip in two reads. Frame rates come from the
// file itself; CreativeOS clips are 24 fps (121 frames for 5.04 s), never an assumed 25.
import { ALL_FORMATS, Input, UrlSource, type Source } from "mediabunny";
import type { MediaFacts } from "./types";

export class MediaReadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MediaReadError";
  }
}

export async function probeMedia(source: Source): Promise<MediaFacts> {
  const input = new Input({ source, formats: ALL_FORMATS });
  try {
    const [videoTrack, audioTrack] = await Promise.all([input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack()]);
    if (!videoTrack && !audioTrack) throw new MediaReadError("No video or audio track in this file.");
    const audio = audioTrack
      ? { channels: await audioTrack.getNumberOfChannels(), sampleRate: await audioTrack.getSampleRate() }
      : null;
    if (!videoTrack) {
      const [first, end] = await Promise.all([audioTrack!.getFirstTimestamp(), audioTrack!.computeDuration()]);
      return { durationSeconds: end - first, video: null, audio };
    }
    const [metrics, first, end, width, height] = await Promise.all([
      videoTrack.computeFrameRateMetrics(),
      videoTrack.getFirstTimestamp(),
      videoTrack.computeDuration(),
      videoTrack.getDisplayWidth(),
      videoTrack.getDisplayHeight(),
    ]);
    const fps = metrics.bestGuessFrameRate;
    if (!Number.isFinite(fps) || fps <= 0) throw new MediaReadError("Couldn't work out the frame rate.");
    const durationSeconds = end - first;
    return { durationSeconds, video: { fps, frames: Math.round(durationSeconds * fps), width, height }, audio };
  } catch (err) {
    if (err instanceof MediaReadError) throw err;
    throw new MediaReadError("Couldn't read this file's header.", { cause: err });
  } finally {
    input.dispose();
  }
}

/** Measures a stored file by URL, reading only its header. */
export function probeMediaUrl(url: string): Promise<MediaFacts> {
  return probeMedia(new UrlSource(url));
}
