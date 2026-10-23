import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { BufferSource } from "mediabunny";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MediaReadError, probeMedia } from "../probe";

// Fixtures are made with ffmpeg at test time (no binaries in the repo). ffmpeg-static is a
// dependency, so this never skips.
const bin = process.env.FFMPEG_PATH ?? (ffmpegStatic as unknown as string);
let dir = "";
let clip: Buffer;
let wav: Buffer;

function make(name: string, args: string[]): Buffer {
  const out = path.join(dir, name);
  const r = spawnSync(bin, ["-y", "-hide_banner", "-loglevel", "error", ...args, out]);
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
  return readFileSync(out);
}

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "editor-probe-"));
  // A CreativeOS-shaped clip: 24 fps, 121 frames, 720×1280, stereo AAC at 32 kHz.
  clip = make("clip.mp4", [
    "-f", "lavfi", "-i", "testsrc=size=720x1280:rate=24",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=32000",
    "-ac", "2", "-frames:v", "121", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
  ]);
  wav = make("dub.wav", ["-f", "lavfi", "-i", "sine=frequency=330:sample_rate=44100", "-ac", "2", "-t", "5"]);
}, 60_000);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("probeMedia", () => {
  it("reads a clip's real frame rate, frame count, size and audio", async () => {
    const facts = await probeMedia(new BufferSource(clip));
    expect(facts.video).toEqual({ fps: 24, frames: 121, width: 720, height: 1280 });
    expect(facts.audio).toEqual({ channels: 2, sampleRate: 32000 });
    expect(facts.durationSeconds).toBeCloseTo(121 / 24, 2);
  });

  it("reads an audio-only dub", async () => {
    const facts = await probeMedia(new BufferSource(wav));
    expect(facts.video).toBeNull();
    expect(facts.audio).toEqual({ channels: 2, sampleRate: 44100 });
    expect(facts.durationSeconds).toBeCloseTo(5, 2);
  });

  it("fails plainly on bytes that aren't media", async () => {
    await expect(probeMedia(new BufferSource(new Uint8Array(4096).fill(7)))).rejects.toBeInstanceOf(MediaReadError);
  });
});
