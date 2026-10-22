import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage", () => ({ uploadAvatarGenerated: vi.fn() }));

import { uploadAvatarGenerated } from "@/lib/storage";
import { cutSheetIntoViews } from "../sheet-cut";
import { makeImage, GENERATED } from "./fixtures";

const W = 1536;
const H = 1024;
// Four textured figures, NOT on the quarter lines, with gaps as narrow as Radha's sheet had
// (22 Oct 2026), on a backdrop that is darker at the edges than in the middle: the case where
// matching the edge colour merged two views.
const FIGURES = [[90, 410], [495, 705], [808, 995], [1100, 1440]] as const;

/** A weave a few pixels across, so a figure keeps its texture at the cutter's reduced size, as
 *  fabric, hair and folds do (a pixel-fine grain would average out to flat grey). */
const grain = (x: number, y: number) => ((Math.floor(x / 6) + Math.floor(y / 6)) % 2) * 60;

function backdrop(x: number, y: number): number {
  const dx = (x - W / 2) / (W / 2);
  const dy = (y - H / 2) / (H / 2);
  return Math.round(190 - 40 * Math.min(1, Math.hypot(dx, dy)));
}

async function sheetPng(): Promise<Buffer> {
  const raw = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const figure = FIGURES.some(([a, b]) => x >= a && x < b) && y > 60 && y < 980;
      const v = figure ? 60 + Math.abs(grain(x, y)) : backdrop(x, y);
      raw.fill(v, (y * W + x) * 3, (y * W + x) * 3 + 3);
    }
  }
  return sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
}

beforeEach(() => {
  vi.resetAllMocks();
  let n = 0;
  vi.mocked(uploadAvatarGenerated).mockImplementation(async () => ({ url: `https://s/v${n++}.png` }) as never);
});

describe("cutSheetIntoViews (D395), on a real image", () => {
  it("cuts each figure out whole, in the gaps, onto a seamless 3:4 canvas, in the sheet's order", async () => {
    const png = await sheetPng();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(png))));
    const sheet = { ...makeImage(GENERATED), url: "https://s/sheet.png", width: W, height: H };

    const views = await cutSheetIntoViews({ clientId: "c1", avatarId: "a1", sheet });

    expect(Object.keys(views)).toEqual(["front", "left", "right", "back"]);
    // Uploads run in parallel, so they are matched by name, not by the order they finished in.
    const byName = new Map(vi.mocked(uploadAvatarGenerated).mock.calls.map(([u]) => [u.name, u]));
    for (const [i, view] of (["front", "left", "right", "back"] as const).entries()) {
      const upload = byName.get(`view-${view}`)!;
      const { data, info } = await sharp(Buffer.from(upload.body as Buffer)).raw().toBuffer({ resolveWithObject: true });
      expect(info.width / info.height).toBeCloseTo(3 / 4, 2);
      // The whole figure is in this view and nothing of the next: count its columns at mid-height.
      const y = Math.floor(info.height / 2);
      let figureColumns = 0;
      for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * info.channels] <= 121) figureColumns++;
      const [a, b] = FIGURES[i];
      expect(figureColumns).toBe(b - a);
    }
    expect(views.left.source).toMatchObject({ kind: "generated", untouched: false });
    expect(views.back.height).toBe(H);
    expect(new Set(Object.values(views).map((v) => v.url)).size).toBe(4);
  });
});
