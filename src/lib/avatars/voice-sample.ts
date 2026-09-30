// Browser-only helpers for a custom-voice sample: an uploaded audio/video file or a YouTube link.

export const VOICE_SAMPLE_MIN_SECONDS = 30;
export const VOICE_SAMPLE_MAX_BYTES = 50 * 1024 * 1024;
export const VOICE_SAMPLE_ACCEPT = ".mp3,.wav,.m4a,.aac,.ogg,.mp4,.mov,.webm,audio/*,video/*";

const YOUTUBE_RE =
  /^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/|live\/)|youtu\.be\/)[\w-]{6,}/i;

export function isYouTubeUrl(url: string): boolean {
  return YOUTUBE_RE.test(url.trim());
}

/** Duration in seconds, read from the file's own metadata. */
export function readMediaDuration(url: string, isVideo: boolean): Promise<number> {
  return new Promise((resolve, reject) => {
    const el = document.createElement(isVideo ? "video" : "audio");
    el.preload = "metadata";
    el.onloadedmetadata = () => resolve(el.duration);
    el.onerror = () => reject(new Error("Couldn't read that file."));
    el.src = url;
  });
}

export function formatSeconds(total: number): string {
  const s = Math.round(total);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
