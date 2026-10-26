import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DownloadError, ExportFailure } from "../export-run";
import { runEditorRender, type RenderDeps, type RenderJobInput } from "../render-run";
import { planSequence } from "../sequence-plan";
import { CAPTION_PRESETS, DEFAULT_CAPTION_STYLE } from "../caption-style";
import type { Caption, Piece } from "../types";
import { source } from "./fixtures";

const piece: Piece = { id: "1", sourceNodeId: "a", in: 0, out: 2, picture: "original", sound: "original" };
const cap: Caption = { id: "c", pieceId: "1", at: 0.5, duration: 1, text: "Hi" };
const plan = (captions: Caption[]) => {
  const r = planSequence({ v: 2, captionStyle: { ...DEFAULT_CAPTION_STYLE, ...CAPTION_PRESETS.boxed.look }, shape: "9:16", sources: [], pieces: [piece], captions }, [source("a", { handle: "VID-AAAA" })], { name: "Jackfruit 365 · Reel 2" });
  if (!r.ok) throw new Error(r.reason);
  return r.plan;
};
const input = (captions = [cap], o: Partial<RenderJobInput["options"]> = {}): RenderJobInput => ({ canvasId: "cv", nodeId: "ed", clientId: "cl", plan: plan(captions), options: { quality: "full", captions: true, ...o } });

function deps(o: { failUrl?: string; ffmpegFails?: boolean } = {}) {
  const seen: { cwd?: string; args?: string[]; files?: string[] } = {};
  const d: RenderDeps = {
    fetchBytes: vi.fn(async (url: string) => {
      if (url === o.failUrl) throw new DownloadError(404);
      return new Uint8Array([1, 2, 3]);
    }),
    readFonts: vi.fn<RenderDeps["readFonts"]>(async (keys) => keys.flatMap((k) => [{ name: `${k}.ttf`, bytes: new Uint8Array([7]) }, { name: `${k}-OFL.txt`, bytes: new Uint8Array([8]) }])),
    ffmpeg: vi.fn(async (args: string[], cwd: string, onProgress: (s: number) => void) => {
      seen.cwd = cwd;
      seen.args = args;
      seen.files = ["captions.ass", path.join("fonts", "montserrat.ttf"), path.join("fonts", "anton.ttf")].filter((f) => existsSync(path.join(cwd, f)));
      if (o.ffmpegFails) throw new Error("ffmpeg exited with 1: boom");
      onProgress(1);
      await writeFile(path.join(cwd, args[args.length - 1]), new Uint8Array([9, 9]));
    }),
    upload: vi.fn(async (_bytes: Uint8Array, fileName: string) => `https://storage.googleapis.com/b/${fileName}`),
    setPhase: vi.fn<RenderDeps["setPhase"]>(async () => {}),
    now: () => new Date("2026-10-26T09:00:00Z"),
  };
  return { d, seen };
}

describe("runEditorRender", () => {
  it("renders in a temp dir, uploads once under the reel's name, and cleans up", async () => {
    const t = deps();
    const r = await runEditorRender(input(), t.d);
    expect(t.d.upload).toHaveBeenCalledTimes(1);
    expect(t.d.upload).toHaveBeenCalledWith(new Uint8Array([9, 9]), "jackfruit-365-reel-2-2026-10-26.mp4");
    expect(r).toMatchObject({ fileName: "jackfruit-365-reel-2-2026-10-26.mp4", bytes: 2, width: 720, height: 1280 });
    expect(r.durationSeconds).toBeCloseTo(2, 1);
    expect(existsSync(t.seen.cwd!)).toBe(false);
  });

  it("writes the captions file and the caption font when captions are on", async () => {
    const t = deps();
    await runEditorRender(input(), t.d);
    expect(t.seen.files).toContain("captions.ass");
    expect(t.seen.args!.join(" ")).toContain("ass=filename=captions.ass:fontsdir=fonts");
    expect(t.d.readFonts).toHaveBeenCalled();
  });

  it("burns nothing when captions are off or there are none", async () => {
    for (const i of [input([cap], { captions: false }), input([])]) {
      const t = deps();
      await runEditorRender(i, t.d);
      expect(t.seen.files).not.toContain("captions.ass");
      expect(t.seen.args!.join(" ")).not.toContain("ass=");
    }
  });

  it("reports phases in order", async () => {
    const t = deps();
    await runEditorRender(input(), t.d);
    const phases = vi.mocked(t.d.setPhase).mock.calls.map((c) => c[0]);
    expect(phases[0]).toBe("Collecting the media…");
    expect(phases).toContain("Rendering…");
    expect(phases[phases.length - 1]).toBe("Saving the video…");
  });

  it("says which file failed to download, and never renders or uploads", async () => {
    const i = input();
    const t = deps({ failUrl: i.plan.media[0].url });
    await expect(runEditorRender(i, t.d)).rejects.toBeInstanceOf(ExportFailure);
    expect(t.d.ffmpeg).not.toHaveBeenCalled();
    expect(t.d.upload).not.toHaveBeenCalled();
  });

  it("turns a render failure into a plain message", async () => {
    const t = deps({ ffmpegFails: true });
    await expect(runEditorRender(input(), t.d)).rejects.toThrow(new ExportFailure("The video couldn't be rendered. Try again."));
    expect(t.d.upload).not.toHaveBeenCalled();
    expect(existsSync(t.seen.cwd!)).toBe(false);
  });

  it("never lets a slow progress write land after saving starts", async () => {
    const t = deps();
    const landed: string[] = [];
    t.d.ffmpeg = vi.fn(async (args: string[], cwd: string, onProgress: (s: number) => void) => {
      onProgress(1); // 1 of 2 seconds: 50%
      await writeFile(path.join(cwd, args[args.length - 1]), new Uint8Array([9, 9]));
    });
    t.d.setPhase = vi.fn(async (m: string) => {
      if (m.includes("%")) await new Promise((r) => setTimeout(r, 40));
      landed.push(m);
    });
    await runEditorRender(input(), t.d);
    expect(landed[landed.length - 1]).toBe("Saving the video…");
    expect(landed).toContain("Rendering… 50%");
    expect(landed.indexOf("Rendering… 50%")).toBeLessThan(landed.indexOf("Saving the video…"));
  });
});
