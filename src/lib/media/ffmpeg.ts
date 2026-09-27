// D282 — thin ffmpeg wrappers for the video-voice-change task. Buffers in, buffers out; temp
// files live in a per-call directory that is always removed.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

function ffmpegBin(): string {
  // Set by Trigger.dev's ffmpeg build extension in deployed tasks.
  return process.env.FFMPEG_PATH ?? "ffmpeg";
}

function run(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin(), ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-2000);
    });
    proc.on("error", (e) => reject(new Error(`ffmpeg could not start: ${e.message}`)));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with ${code}: ${stderr.trim()}`));
    });
  });
}

async function inTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "revoice-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** The video's first audio stream as MP3. Rejects when the video has no audio. */
export async function extractAudio(video: Buffer): Promise<Buffer> {
  return inTempDir(async (dir) => {
    const input = path.join(dir, "in.mp4");
    const output = path.join(dir, "audio.mp3");
    await writeFile(input, video);
    await run(["-i", input, "-map", "0:a:0", "-vn", "-c:a", "libmp3lame", "-q:a", "2", output]);
    return readFile(output);
  });
}

/** Duration of an audio/video buffer in seconds, from ffmpeg's own input probe. */
export async function probeDurationSeconds(media: Buffer, ext: string): Promise<number> {
  return inTempDir(async (dir) => {
    const input = path.join(dir, `in.${ext}`);
    await writeFile(input, media);
    const stderr = await new Promise<string>((resolve, reject) => {
      const proc = spawn(ffmpegBin(), ["-hide_banner", "-i", input], { stdio: ["ignore", "ignore", "pipe"] });
      let out = "";
      proc.stderr.on("data", (d: Buffer) => { out += d.toString(); });
      proc.on("error", (e) => reject(new Error(`ffmpeg could not start: ${e.message}`)));
      proc.on("close", () => resolve(out)); // exits non-zero (no output file) — the probe text is what we want
    });
    const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
    if (!m) throw new Error("ffmpeg could not read the media duration");
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  });
}

/** The same picture (stream-copied) with `audio` as its only audio track. */
export async function replaceAudio(video: Buffer, audio: Buffer): Promise<Buffer> {
  return inTempDir(async (dir) => {
    const videoIn = path.join(dir, "in.mp4");
    const audioIn = path.join(dir, "voice.mp3");
    const output = path.join(dir, "out.mp4");
    await writeFile(videoIn, video);
    await writeFile(audioIn, audio);
    await run([
      "-i", videoIn,
      "-i", audioIn,
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "192k",
      // D282 review fix — the voiced audio can come back shorter than the source (ElevenLabs
      // speech-to-speech doesn't guarantee matching duration). Without padding, `-shortest` cut
      // the OUTPUT to the shorter of the two streams, truncating the video itself. `apad` pads
      // the audio with silence so the video's own (copied, untouched) length always wins;
      // `-shortest` is kept as the safety net for the reverse case (voiced audio longer).
      "-af", "apad",
      "-shortest",
      "-movflags", "+faststart",
      output,
    ]);
    return readFile(output);
  });
}
