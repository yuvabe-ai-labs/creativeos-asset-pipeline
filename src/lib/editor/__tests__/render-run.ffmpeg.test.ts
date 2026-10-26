// A real render with this machine's ffmpeg (skipped when it has none): two synthetic clips, one
// boxed word-by-word caption. Set EDITOR_RENDER_OUT=<dir> to keep the MP4 and a frame to look at.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readCaptionFontFiles } from "../font-files";
import { runFfmpegWithProgress } from "@/lib/media/ffmpeg";
import { runEditorRender } from "../render-run";
import { planSequence } from "../sequence-plan";
import { CAPTION_PRESETS, DEFAULT_CAPTION_STYLE } from "../caption-style";
import { source } from "./fixtures";

const bin = process.env.FFMPEG_PATH ?? "ffmpeg";
const hasFfmpeg = spawnSync(bin, ["-hide_banner", "-filters"]).stdout?.toString().includes(" ass ") ?? false;

describe.skipIf(!hasFfmpeg)("runEditorRender with real ffmpeg", () => {
  it("renders a playable MP4 of the reel's length and frame, captions burned in", { timeout: 120_000 }, async () => {
    const work = mkdtempSync(path.join(tmpdir(), "render-it-"));
    try {
      const clip = path.join(work, "clip.mp4");
      spawnSync(bin, ["-hide_banner", "-y", "-f", "lavfi", "-i", "testsrc2=size=720x1280:rate=24", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "5.1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", clip]);
      const a = source("a", { handle: "VID-AAAA" });
      const r = planSequence({
        v: 2, captionStyle: { ...DEFAULT_CAPTION_STYLE, ...CAPTION_PRESETS.boxed.look }, shape: "9:16", sources: [],
        pieces: [{ id: "1", sourceNodeId: "a", in: 0, out: 2, picture: "original", sound: "original" }, { id: "2", sourceNodeId: "a", in: 1, out: 3, picture: "original", sound: "original" }],
        captions: [{ id: "c", pieceId: "1", at: 0.2, duration: 1.6, text: "make dosa today", words: [{ text: "make", at: 0.2, duration: 0.5 }, { text: "dosa", at: 0.7, duration: 0.5 }, { text: "today", at: 1.2, duration: 0.6 }] }],
      }, [a], { name: "Render Test" });
      if (!r.ok) throw new Error(r.reason);
      const uploaded: Uint8Array[] = [];
      const result = await runEditorRender({ canvasId: "cv", nodeId: "ed", clientId: "cl", plan: r.plan, options: { quality: "full", captions: true } }, {
        fetchBytes: async () => new Uint8Array(readFileSync(clip)),
        readFonts: readCaptionFontFiles,
        ffmpeg: runFfmpegWithProgress,
        upload: async (bytes) => {
          uploaded.push(bytes);
          return "https://example/out.mp4";
        },
        setPhase: async () => {},
        now: () => new Date("2026-10-26T00:00:00Z"),
      });
      const out = path.join(work, "out.mp4");
      writeFileSync(out, uploaded[0]);
      const probe = spawnSync(bin, ["-hide_banner", "-i", out]).stderr.toString();
      expect(probe).toMatch(/Video: h264.*720x1280/);
      expect(probe).toMatch(/Audio: aac.*48000 Hz, stereo/);
      const m = /Duration: 00:00:(\d+\.\d+)/.exec(probe)!;
      expect(Number(m[1])).toBeCloseTo(4, 0);
      expect(result.fileName).toBe("render-test-2026-10-26.mp4");

      const keep = process.env.EDITOR_RENDER_OUT;
      if (keep) {
        copyFileSync(out, path.join(keep, "render-test.mp4"));
        spawnSync(bin, ["-hide_banner", "-y", "-ss", "0.9", "-i", out, "-frames:v", "1", path.join(keep, "render-test-frame.png")]);
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
