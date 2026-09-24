import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { extractAudio, replaceAudio } from "../ffmpeg";

const bin = process.env.FFMPEG_PATH ?? "ffmpeg";
const hasFfmpeg = spawnSync(bin, ["-version"]).status === 0;

// D282 review fix — ffprobe ships next to ffmpeg in every distribution used here (including the
// WinGet Gyan build named in the task's verification command), so it's derived from FFMPEG_PATH
// the same way trigger/video-revoice.ts's ffmpeg build extension expects, rather than adding a
// second env var.
const ffprobeBin = bin.replace(/ffmpeg(\.exe)?$/i, (m) => (m.toLowerCase() === "ffmpeg.exe" ? "ffprobe.exe" : "ffprobe"));
const hasFfprobe = hasFfmpeg && spawnSync(ffprobeBin, ["-version"]).status === 0;

// Build a 2-second clip with a test pattern and a tone, using ffmpeg itself — no binary fixture
// in the repo.
function makeClip(withAudio: boolean): Buffer {
  const dir = mkdtempSync(path.join(tmpdir(), "ffmpeg-fixture-"));
  const out = path.join(dir, "clip.mp4");
  const args = ["-y", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=2"];
  if (withAudio) args.push("-f", "lavfi", "-i", "sine=frequency=440:duration=2");
  args.push("-pix_fmt", "yuv420p", "-shortest", out);
  spawnSync(bin, args);
  const bytes = readFileSync(out);
  rmSync(dir, { recursive: true, force: true });
  return bytes;
}

/** A video-only clip (no audio track) of the given duration — the "source video" side of the
 * padding test, so its length is unambiguously what `-shortest` should preserve. */
function makeVideoOnly(durationSeconds: number): Buffer {
  const dir = mkdtempSync(path.join(tmpdir(), "ffmpeg-fixture-"));
  const out = path.join(dir, "clip.mp4");
  spawnSync(bin, [
    "-y", "-f", "lavfi", "-i", `testsrc=size=160x120:rate=10:duration=${durationSeconds}`,
    "-pix_fmt", "yuv420p", out,
  ]);
  const bytes = readFileSync(out);
  rmSync(dir, { recursive: true, force: true });
  return bytes;
}

/** A standalone tone, shorter than the video above — stands in for ElevenLabs' voiced audio
 * coming back shorter than the source. */
function makeTone(durationSeconds: number): Buffer {
  const dir = mkdtempSync(path.join(tmpdir(), "ffmpeg-fixture-"));
  const out = path.join(dir, "tone.mp3");
  spawnSync(bin, ["-y", "-f", "lavfi", "-i", `sine=frequency=440:duration=${durationSeconds}`, out]);
  const bytes = readFileSync(out);
  rmSync(dir, { recursive: true, force: true });
  return bytes;
}

/** ffprobe's own read of a buffer's container duration, in seconds. */
function probeDurationSeconds(buf: Buffer): number {
  const dir = mkdtempSync(path.join(tmpdir(), "ffprobe-fixture-"));
  const file = path.join(dir, "probe.mp4");
  writeFileSync(file, buf);
  const res = spawnSync(ffprobeBin, [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "csv=p=0",
    file,
  ]);
  rmSync(dir, { recursive: true, force: true });
  return parseFloat(res.stdout.toString().trim());
}

describe.skipIf(!hasFfmpeg)("ffmpeg helpers (needs ffmpeg on PATH)", () => {
  it("extracts an MP3 from a clip with sound", async () => {
    const audio = await extractAudio(makeClip(true));
    expect(audio.length).toBeGreaterThan(1000);
  });

  it("rejects a silent clip", async () => {
    await expect(extractAudio(makeClip(false))).rejects.toThrow(/ffmpeg/);
  });

  it("replaces the audio and keeps a playable MP4 with sound", async () => {
    const clip = makeClip(true);
    const audio = await extractAudio(clip);
    const out = await replaceAudio(clip, audio);
    expect(out.subarray(4, 8).toString("ascii")).toBe("ftyp");
    expect((await extractAudio(out)).length).toBeGreaterThan(1000);
  });

  it.skipIf(!hasFfprobe)(
    "pads shorter voiced audio with silence so the video's own length wins, not -shortest's",
    async () => {
      const video = makeVideoOnly(2);
      const shortTone = makeTone(1);
      const out = await replaceAudio(video, shortTone);
      const duration = probeDurationSeconds(out);
      // Without `-af apad`, `-shortest` would cut this to ~1s (the tone's length). The video
      // stream is stream-copied and untouched, so the output should still read as ~2s.
      expect(duration).toBeGreaterThan(1.8);
      expect(duration).toBeLessThan(2.3);
    },
  );
});
