import "server-only";
// Voice anchor extraction for the UGC bench: any audio or video file → a mono mp3 that
// Seedance accepts as `reference_audio` (wav/mp3, 2–30s, ≤15 MB). Used for both voice
// sources: a finished Seedance clip ("Use this voice") and an uploaded file.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { VOICE_MAX_SECONDS, VOICE_MIN_SECONDS } from "./constants";

const run = promisify(execFile);

export type ExtractedVoice = { mp3: Buffer; seconds: number };

// ffmpeg prints "Duration: 00:00:05.04" for the input; we read the OUTPUT length from the
// final "time=" progress line so the 30s cap is reflected.
function lastTime(stderr: string): number | null {
  const all = [...stderr.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
  const m = all.at(-1);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

export async function extractVoice(input: Buffer): Promise<ExtractedVoice> {
  if (!ffmpegPath) throw new Error("ffmpeg binary not available on this platform");
  const dir = await mkdtemp(path.join(tmpdir(), "ugc-voice-"));
  const src = path.join(dir, "in");
  const out = path.join(dir, "voice.mp3");
  try {
    await writeFile(src, input);
    let stderr: string;
    try {
      ({ stderr } = await run(
        ffmpegPath,
        // -vn: drop video · -ac 1: mono (Seedance output audio is mono anyway) ·
        // -t: Seedance rejects reference audio longer than 30s.
        ["-y", "-i", src, "-vn", "-ac", "1", "-ar", "24000", "-b:a", "96k",
         "-t", String(VOICE_MAX_SECONDS), out],
        { maxBuffer: 10 * 1024 * 1024 },
      ));
    } catch (e) {
      const msg = (e as { stderr?: string }).stderr ?? String(e);
      if (/does not contain any stream|Output file .* does not contain/i.test(msg)) {
        throw new Error("That file has no audio track.");
      }
      throw new Error(`Could not read that file as audio or video (${msg.split("\n").filter(Boolean).at(-1)})`);
    }
    const seconds = lastTime(stderr) ?? 0;
    if (seconds < VOICE_MIN_SECONDS) {
      throw new Error(`Voice clip is ${seconds.toFixed(1)}s — Seedance needs at least ${VOICE_MIN_SECONDS}s.`);
    }
    return { mp3: await readFile(out), seconds };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
