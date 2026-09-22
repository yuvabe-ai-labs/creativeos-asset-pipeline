import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";
import {
  SEEDANCE_IMAGE_LIMITS,
  seedanceImageProblems,
  planSeedanceReencode,
  fitImageForSeedance,
  fitSeedanceImages,
} from "../providers/seedance-images";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

/** A real encoded image — the tests exercise sharp, not a stub of it. */
function solid(width: number, height: number, colour = { r: 255, g: 255, b: 255 }) {
  return sharp({ create: { width, height, channels: 3, background: colour } }).png().toBuffer();
}

async function decodeDataUrl(dataUrl: string) {
  const [prefix, b64] = dataUrl.split(",");
  const bytes = Buffer.from(b64, "base64");
  return { prefix, bytes, meta: await sharp(bytes).metadata() };
}

function compliant(w: number, h: number) {
  return seedanceImageProblems({ width: w, height: h, format: "jpeg", bytes: 1 });
}

describe("seedanceImageProblems", () => {
  it("passes an ordinary still", () => {
    expect(compliant(1920, 1080)).toEqual([]);
  });

  // The generation this exists for died with "expected the aspect ratio to be between 0.40 and
  // 2.50, but received image with aspect ratio: 2.62".
  it("flags the 2.62 image that failed a real request", () => {
    expect(compliant(2620, 1000)).toEqual([expect.stringMatching(/aspect ratio 2\.62/)]);
  });

  it("flags too-small, too-large, too-heavy and unaccepted formats", () => {
    expect(compliant(299, 400)).toEqual([expect.stringMatching(/under 300px/)]);
    expect(compliant(6001, 4000)).toEqual([expect.stringMatching(/over 6000px/)]);
    expect(
      seedanceImageProblems({ width: 1000, height: 1000, format: "jpeg", bytes: 30 * 1024 * 1024 }),
    ).toEqual([expect.stringMatching(/30 MB/)]);
    expect(seedanceImageProblems({ width: 1000, height: 1000, format: "svg", bytes: 1 })).toEqual([
      expect.stringMatching(/format svg/),
    ]);
  });

  it("accepts the bounds themselves", () => {
    expect(compliant(2500, 1000)).toEqual([]);
    expect(compliant(400, 1000)).toEqual([]);
  });
});

describe("planSeedanceReencode — the output always lands inside the limits", () => {
  // Every shape of trouble: slightly and wildly too wide/tall, tiny, huge, and the real 2.62 case.
  const sources = [
    [2620, 1000], [1000, 2620], [3000, 200], [200, 3000], [8000, 1000], [1000, 8000],
    [120, 100], [7000, 6500], [6001, 2500], [2500, 1001], [301, 752],
  ] as const;

  for (const use of ["frame", "reference"] as const) {
    for (const [width, height] of sources) {
      it(`${use} ${width}×${height}`, () => {
        const { crop, content, canvas } = planSeedanceReencode({ width, height }, use);
        expect(compliant(canvas.width, canvas.height)).toEqual([]);
        // The crop stays inside the source and the content inside the canvas.
        expect(crop.left + crop.width).toBeLessThanOrEqual(width);
        expect(crop.top + crop.height).toBeLessThanOrEqual(height);
        expect(content.width).toBeLessThanOrEqual(canvas.width);
        expect(content.height).toBeLessThanOrEqual(canvas.height);
      });
    }
  }

  it("a frame is cropped, never padded — bars would be IN the video", () => {
    const { crop, content, canvas } = planSeedanceReencode({ width: 2620, height: 1000 }, "frame");
    expect(crop.width).toBeLessThan(2620);
    expect(content).toEqual(canvas);
  });

  it("a reference is padded, never cropped — a wide character sheet keeps its outer views", () => {
    const { crop, content, canvas } = planSeedanceReencode({ width: 2620, height: 1000 }, "reference");
    expect(crop).toEqual({ left: 0, top: 0, width: 2620, height: 1000 });
    expect(canvas.height).toBeGreaterThan(content.height);
    // The picture itself keeps its proportions (to within a pixel of rounding).
    expect(content.width / content.height).toBeCloseTo(2.62, 1);
  });

  it("only upscales a too-small image as far as the minimum, not to the re-encode edge", () => {
    const { canvas } = planSeedanceReencode({ width: 120, height: 100 }, "reference");
    expect(Math.min(canvas.width, canvas.height)).toBe(SEEDANCE_IMAGE_LIMITS.minPx);
  });
});

describe("fitImageForSeedance", () => {
  it("keeps a compliant image untouched", async () => {
    expect(await fitImageForSeedance(await solid(1080, 1920), "reference")).toEqual({ kind: "keep" });
  });

  it("re-encodes the 2.62 reference into range as a lowercase jpeg data URL", async () => {
    const fit = await fitImageForSeedance(await solid(2620, 1000), "reference");
    if (fit.kind !== "reencoded") throw new Error("expected a re-encode");

    const { prefix, meta } = await decodeDataUrl(fit.dataUrl);
    expect(prefix).toBe("data:image/jpeg;base64");
    expect(compliant(meta.width!, meta.height!)).toEqual([]);
    expect({ width: meta.width, height: meta.height }).toEqual(fit.to);
  });

  it("pads a reference with its own edge colour, not black", async () => {
    const fit = await fitImageForSeedance(await solid(2620, 1000, { r: 240, g: 240, b: 240 }), "reference");
    if (fit.kind !== "reencoded") throw new Error("expected a re-encode");

    const { bytes } = await decodeDataUrl(fit.dataUrl);
    // Top-left pixel sits in the added bar.
    const { data } = await sharp(bytes).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    for (const channel of data) expect(Math.abs(channel - 240)).toBeLessThanOrEqual(3);
  });

  it("crops a too-wide frame to the bound", async () => {
    const fit = await fitImageForSeedance(await solid(2620, 1000), "frame");
    if (fit.kind !== "reencoded") throw new Error("expected a re-encode");
    const { meta } = await decodeDataUrl(fit.dataUrl);
    expect(meta.width! / meta.height!).toBeLessThanOrEqual(SEEDANCE_IMAGE_LIMITS.maxAspect);
    expect(meta.width! / meta.height!).toBeGreaterThan(2.45);
  });

  // Flattened onto white, the way it looked on screen. A transparent cut-out's hidden RGB is
  // commonly black, and JPEG has no alpha to hide it behind.
  it("flattens transparency onto white", async () => {
    // 200px — under the 300px minimum, which is what makes this one re-encode at all.
    const png = await sharp({
      create: { width: 200, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer();
    const fit = await fitImageForSeedance(png, "reference");
    if (fit.kind !== "reencoded") throw new Error("expected a re-encode");
    const { bytes } = await decodeDataUrl(fit.dataUrl);
    const { data } = await sharp(bytes).extract({ left: 150, top: 150, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    for (const channel of data) expect(channel).toBeGreaterThan(250);
  });
});

describe("fitSeedanceImages", () => {
  beforeEach(() => vi.resetAllMocks());

  const ok = (bytes: Buffer) => ({ ok: true, status: 200, arrayBuffer: async () => bytes });

  it("swaps only the non-compliant reference for a data URL", async () => {
    const good = await solid(1080, 1920);
    const wide = await solid(2620, 1000);
    mockFetch.mockImplementation(async (url: string) => ok(url.endsWith("wide.png") ? wide : good));

    const out = await fitSeedanceImages(
      { prompt: "p", referenceUrls: ["https://s/good.png", "https://s/wide.png"], params: {} },
      30,
    );
    expect(out.referenceUrls[0]).toBe("https://s/good.png");
    expect(out.referenceUrls[1]).toMatch(/^data:image\/jpeg;base64,/);
  });

  // This step exists to remove a failure mode; it must never add one.
  it("sends the URL as-is when the image cannot be downloaded", async () => {
    mockFetch.mockRejectedValue(new TypeError("fetch failed"));
    const out = await fitSeedanceImages(
      { prompt: "p", referenceUrls: ["https://s/a.png"], params: {} },
      30,
    );
    expect(out.referenceUrls).toEqual(["https://s/a.png"]);
  });

  it("sends the URL as-is when the bytes are not an image", async () => {
    mockFetch.mockResolvedValue(ok(Buffer.from("<html>not an image</html>")));
    const out = await fitSeedanceImages(
      { prompt: "p", referenceUrls: ["https://s/a.png"], params: {} },
      30,
    );
    expect(out.referenceUrls).toEqual(["https://s/a.png"]);
  });

  // Frames and references are mutually exclusive on the wire, so with a start frame the
  // references are never sent — and never worth downloading.
  it("checks only the frames when a start frame is set", async () => {
    mockFetch.mockImplementation(async () => ok(await solid(1080, 1920)));
    await fitSeedanceImages(
      {
        prompt: "p",
        startFrameUrl: "https://s/start.png",
        endFrameUrl: "https://s/end.png",
        referenceUrls: ["https://s/r1.png", "https://s/r2.png"],
        params: {},
      },
      30,
    );
    expect(mockFetch.mock.calls.map(([u]) => u).sort()).toEqual([
      "https://s/end.png",
      "https://s/start.png",
    ]);
  });

  it("does not download references past the cap", async () => {
    mockFetch.mockImplementation(async () => ok(await solid(1080, 1920)));
    const out = await fitSeedanceImages(
      { prompt: "p", referenceUrls: ["https://s/1.png", "https://s/2.png", "https://s/3.png"], params: {} },
      2,
    );
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(out.referenceUrls).toHaveLength(2);
  });
});
