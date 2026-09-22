import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractVoice } from "./voice";

const run = promisify(execFile);
let dir: string;

// Synthesise small test media with the same ffmpeg binary — no fixtures in the repo.
async function make(name: string, args: string[]): Promise<Buffer> {
  const out = path.join(dir, name);
  await run(ffmpegPath!, ["-y", ...args, out]);
  return readFile(out);
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "ugc-voice-test-"));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("extractVoice", () => {
  it("pulls a mono mp3 of the right length out of an mp4 with audio", async () => {
    const mp4 = await make("clip.mp4", [
      "-f", "lavfi", "-i", "testsrc=size=160x284:rate=24:duration=5",
      "-f", "lavfi", "-i", "sine=frequency=220:duration=5",
      "-shortest", "-c:v", "libx264", "-c:a", "aac",
    ]);
    const { mp3, seconds } = await extractVoice(mp4);
    expect(seconds).toBeGreaterThan(4.5);
    expect(seconds).toBeLessThan(5.5);
    // MPEG audio frame sync or an ID3 tag at the start of the file.
    const head = mp3.subarray(0, 3).toString("latin1");
    expect(head === "ID3" || (mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0)).toBe(true);
  }, 30_000);

  it("caps the voice at 30 seconds", async () => {
    const wav = await make("long.wav", ["-f", "lavfi", "-i", "sine=frequency=300:duration=40"]);
    const { seconds } = await extractVoice(wav);
    expect(seconds).toBeLessThanOrEqual(30.1);
    expect(seconds).toBeGreaterThan(29);
  }, 30_000);

  it("rejects a clip shorter than 2 seconds", async () => {
    const wav = await make("short.wav", ["-f", "lavfi", "-i", "sine=frequency=300:duration=1"]);
    await expect(extractVoice(wav)).rejects.toThrow(/at least 2s/);
  }, 30_000);

  it("rejects a video with no audio track", async () => {
    const silent = await make("silent.mp4", [
      "-f", "lavfi", "-i", "testsrc=size=160x284:rate=24:duration=3", "-c:v", "libx264",
    ]);
    await expect(extractVoice(silent)).rejects.toThrow(/no audio track/);
  }, 30_000);
});
