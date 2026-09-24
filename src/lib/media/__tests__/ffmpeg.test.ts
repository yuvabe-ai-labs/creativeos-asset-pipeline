import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { extractAudio, replaceAudio } from "../ffmpeg";

const bin = process.env.FFMPEG_PATH ?? "ffmpeg";
const hasFfmpeg = spawnSync(bin, ["-version"]).status === 0;

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
});
