import { unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { DownloadError, ExportFailure, MAX_PACKAGE_MEDIA_BYTES, runEditorExport, type ExportJobInput } from "../export-run";
import { planSequence, type SequencePlan } from "../sequence-plan";
import type { Caption, Piece } from "../types";
import { source } from "./fixtures";
import { DEFAULT_CAPTION_STYLE } from "../caption-style";

const piece = (id: string, src: string, o: Partial<Piece> = {}): Piece => ({ id, sourceNodeId: src, in: 0, out: 2, picture: "original", sound: "original", ...o });
const cap: Caption = { id: "c", pieceId: "2", at: 0.5, duration: 1, text: "Hi" };
const plan: SequencePlan = (() => {
  const r = planSequence({ v: 2, captionStyle: { ...DEFAULT_CAPTION_STYLE, font: "anton" }, shape: "9:16", sources: [], captions: [cap], pieces: [
    piece("1", "a"), piece("2", "d", { picture: "lipSynced", sound: "dubbed" }),
  ] }, [source("a", { handle: "VID-AAAA" }), source("d", { kind: "dubbing", handle: "DUB-DDDD" })], { name: "Jackfruit 365 · Reel 2" });
  if (!r.ok) throw new Error(r.reason);
  return r.plan;
})();
const input: ExportJobInput = { canvasId: "cv", nodeId: "ed", clientId: "cl", plan };

function deps(o: { fail?: { url: string; status: number }; size?: number } = {}) {
  const uploaded: Uint8Array[] = [];
  return {
    uploaded,
    phases: [] as string[],
    d: {
      fetchBytes: vi.fn(async (url: string) => {
        if (o.fail?.url === url) throw new DownloadError(o.fail.status);
        return new Uint8Array(o.size ?? 8).fill(1);
      }),
      readFonts: vi.fn(async (keys: string[]) => keys.flatMap((k) => [{ name: `${k}.ttf`, bytes: new Uint8Array([1]) }])),
      upload: vi.fn(async (zip: Uint8Array, fileName: string) => {
        uploaded.push(zip);
        return `https://storage.googleapis.com/b/${fileName}`;
      }),
      setPhase: vi.fn(async (_message: string) => {}),
      now: () => new Date("2026-10-20T12:00:00Z"),
    },
  };
}

describe("runEditorExport", () => {
  it("zips exactly the layout and uploads once", async () => {
    const t = deps();
    const result = await runEditorExport(input, t.d);
    expect(t.uploaded).toHaveLength(1);
    const files = Object.keys(unzipSync(t.uploaded[0])).filter((n) => !n.endsWith("/")).sort();
    expect(files).toEqual([
      "jackfruit-365-reel-2-2026-10-20/README.txt",
      "jackfruit-365-reel-2-2026-10-20/captions.srt",
      "jackfruit-365-reel-2-2026-10-20/jackfruit-365-reel-2.xml",
      "jackfruit-365-reel-2-2026-10-20/fonts/anton.ttf",
      "jackfruit-365-reel-2-2026-10-20/manifest.json",
      "jackfruit-365-reel-2-2026-10-20/media/001_VID-AAAA_take.mp4",
      "jackfruit-365-reel-2-2026-10-20/media/002_DUB-DDDD_lip-synced.mp4",
      "jackfruit-365-reel-2-2026-10-20/media/003_DUB-DDDD_take.mp4",
      "jackfruit-365-reel-2-2026-10-20/media/004_DUB-DDDD_dub-audio.wav",
      "jackfruit-365-reel-2-2026-10-20/timeline.otio",
    ].sort());
    expect(result).toMatchObject({
      url: "https://storage.googleapis.com/b/jackfruit-365-reel-2-2026-10-20.zip",
      fileName: "jackfruit-365-reel-2-2026-10-20.zip",
      sequenceName: "Jackfruit 365 · Reel 2",
      xmlName: "jackfruit-365-reel-2.xml",
      bytes: t.uploaded[0].byteLength,
    });
    expect(t.d.upload).toHaveBeenCalledWith(expect.any(Uint8Array), "jackfruit-365-reel-2-2026-10-20.zip");
  });

  it("sets the three phases in order", async () => {
    const t = deps();
    await runEditorExport(input, t.d);
    expect(t.d.setPhase.mock.calls.map((c) => c[0])).toEqual([
      "Collecting the media…",
      "Writing the sequence…",
      "Packaging jackfruit-365-reel-2-2026-10-20.zip…",
    ]);
  });

  it("names the file that failed to download, and never uploads", async () => {
    const t = deps({ fail: { url: "https://storage.googleapis.com/b/d-lip.mp4", status: 404 } });
    await expect(runEditorExport(input, t.d)).rejects.toThrow(new ExportFailure("Couldn't download 002_DUB-DDDD_lip-synced.mp4 (HTTP 404)."));
    expect(t.d.upload).not.toHaveBeenCalled();
  });

  it("refuses a package over 700 MB", async () => {
    const t = deps({ size: Math.ceil(MAX_PACKAGE_MEDIA_BYTES / 3) });
    await expect(runEditorExport(input, t.d)).rejects.toBeInstanceOf(ExportFailure);
    await expect(runEditorExport(input, deps({ size: Math.ceil(MAX_PACKAGE_MEDIA_BYTES / 3) }).d)).rejects.toThrow(/more than the 700 MB a package can hold/);
    expect(t.d.upload).not.toHaveBeenCalled();
  });

  it("summarises clips, lip-synced videos, dubs, captions and fonts", async () => {
    const { summary } = await runEditorExport(input, deps().d);
    expect(summary).toEqual({ clips: 2, lipSynced: 1, dubs: 1, captions: 1, fonts: 1, durationSeconds: 4, shape: "9:16", fps: 24 });
  });
});
