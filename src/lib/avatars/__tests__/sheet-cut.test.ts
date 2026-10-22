import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage", () => ({ uploadAvatarGenerated: vi.fn() }));

import { uploadAvatarGenerated } from "@/lib/storage";
import { cutSheetIntoViews } from "../sheet-cut";
import { makeImage, GENERATED } from "./fixtures";

const W = 1600;
const H = 900;
const GREY = { r: 238, g: 238, b: 238 };
// Four figures, deliberately NOT on the quarters, and a dark floor shadow running under all of
// them: the cuts must follow the figures and ignore the shadow.
const FIGURES = [[90, 260], [520, 680], [860, 1020], [1260, 1430]] as const;

async function sheetPng(): Promise<Buffer> {
  const rect = (left: number, width: number, top: number, height: number, c: number) => ({
    input: { create: { width, height, channels: 3 as const, background: { r: c, g: c / 2, b: c / 3 } } },
    left, top,
  });
  return sharp({ create: { width: W, height: H, channels: 3, background: GREY } })
    .composite([
      ...FIGURES.map(([a, b]) => rect(a, b - a, 60, 800, 120)),
      rect(40, W - 80, 850, 30, 60), // the floor shadow, below the band the profile reads
    ])
    .png()
    .toBuffer();
}

beforeEach(() => {
  vi.resetAllMocks();
  let n = 0;
  vi.mocked(uploadAvatarGenerated).mockImplementation(async () => ({ url: `https://s/v${n++}.png` }) as never);
});

describe("cutSheetIntoViews (D395), on a real image", () => {
  it("cuts each figure out whole, at the gaps, onto a 3:4 backdrop, in the sheet's order", async () => {
    const png = await sheetPng();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(png))));
    const sheet = { ...makeImage(GENERATED), url: "https://s/sheet.png", width: W, height: H };

    const views = await cutSheetIntoViews({ clientId: "c1", avatarId: "a1", sheet });

    expect(Object.keys(views)).toEqual(["front", "left", "right", "back"]);
    // Uploads run in parallel, so they are matched by name, not by the order they finished in.
    const uploads = vi.mocked(uploadAvatarGenerated).mock.calls.map((c) => c[0]);
    const byName = new Map(uploads.map((u) => [u.name, u]));
    expect([...byName.keys()].sort()).toEqual(["view-back", "view-front", "view-left", "view-right"]);

    for (const [i, view] of (["front", "left", "right", "back"] as const).entries()) {
      const upload = byName.get(`view-${view}`)!;
      const { data, info } = await sharp(Buffer.from(upload.body as Buffer)).raw().toBuffer({ resolveWithObject: true });
      expect(info.width / info.height).toBeCloseTo(3 / 4, 2);
      // The figure is all there: count its columns at mid-height, where only figure is dark.
      const y = Math.floor(info.height / 2);
      let figureColumns = 0;
      for (let x = 0; x < info.width; x++) {
        const p = (y * info.width + x) * info.channels;
        if (data[p] < 200) figureColumns++;
      }
      const [a, b] = FIGURES[i];
      expect(figureColumns).toBe(b - a);
      // Each view has only its own figure: the edges are backdrop.
      expect(data[(y * info.width) * info.channels]).toBe(GREY.r);
      expect(data[(y * info.width + info.width - 1) * info.channels]).toBe(GREY.r);
    }
    expect(views.left.source).toMatchObject({ kind: "generated", untouched: false });
    expect(views.back.height).toBe(H);
    expect(new Set(Object.values(views).map((v) => v.url)).size).toBe(4);
  });
});
