import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";
import { KLING_IMAGE_LIMITS, fitKlingImages } from "../providers/kling-images";
import { imageProblems, planImageReencode } from "../providers/provider-images";

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

function compliant(w: number, h: number, format = "jpeg") {
  return imageProblems({ width: w, height: h, format, bytes: 1 }, KLING_IMAGE_LIMITS);
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("KLING_IMAGE_LIMITS", () => {
  it("passes an ordinary still", () => {
    expect(compliant(1920, 1080)).toEqual([]);
  });

  // THE regression: run_06gc6cum56gtdfhlvjfs5a3j01 died with "Image aspect ratio is invalid" on a
  // 414×2048 reference. Reproduced against the live endpoint before this shipped.
  it("flags the 414×2048 image that failed a real run", () => {
    expect(compliant(414, 2048)).toEqual([expect.stringMatching(/aspect ratio 0\.20/)]);
  });

  it("accepts the bounds themselves", () => {
    expect(compliant(2500, 1000)).toEqual([]);
    expect(compliant(400, 1000)).toEqual([]);
  });

  it("flags a side under 300px and a file over 50MB", () => {
    expect(compliant(299, 400)).toEqual([expect.stringMatching(/under 300px/)]);
    expect(
      imageProblems(
        { width: 1000, height: 1000, format: "jpeg", bytes: 50 * 1024 * 1024 },
        KLING_IMAGE_LIMITS,
      ),
    ).toEqual([expect.stringMatching(/50 MB/)]);
  });

  // Kling publishes no maximum dimension, only the 50MB cap — so a huge-but-legal image must NOT be
  // re-encoded. A guessed ceiling here would base64-inline images the vendor would have fetched.
  it("does not flag a large image on dimensions alone", () => {
    expect(compliant(9000, 6000)).toEqual([]);
  });

  // The docs list jpg/jpeg/png, but the live endpoint decodes webp (it answered the aspect-ratio
  // error, not a format error, for an out-of-range webp) and the uploader accepts webp — so a
  // merely-webp reference must stay on its URL rather than being inlined.
  it("accepts webp, and rejects a format no decoder here handles", () => {
    expect(compliant(1920, 1080, "webp")).toEqual([]);
    expect(compliant(1920, 1080, "svg")).toEqual([expect.stringMatching(/format svg/)]);
  });
});

describe("planImageReencode against Kling's limits — the output always lands inside them", () => {
  const sources = [
    [414, 2048], [2620, 1000], [1000, 2620], [3000, 200], [200, 3000],
    [120, 100], [9000, 1000], [301, 752], [2500, 1001],
  ] as const;

  for (const use of ["frame", "reference"] as const) {
    for (const [width, height] of sources) {
      it(`${use} ${width}×${height}`, () => {
        const { crop, content, canvas } = planImageReencode(
          { width, height },
          use,
          KLING_IMAGE_LIMITS,
        );
        expect(compliant(canvas.width, canvas.height)).toEqual([]);
        expect(crop.left + crop.width).toBeLessThanOrEqual(width);
        expect(crop.top + crop.height).toBeLessThanOrEqual(height);
        expect(content.width).toBeLessThanOrEqual(canvas.width);
        expect(content.height).toBeLessThanOrEqual(canvas.height);
      });
    }
  }
});

describe("fitKlingImages", () => {
  function serve(map: Record<string, Buffer>) {
    mockFetch.mockImplementation(async (url: string) => {
      const bytes = map[url];
      if (!bytes) return { ok: false, status: 404 };
      return { ok: true, status: 200, arrayBuffer: async () => bytes };
    });
  }

  it("leaves a compliant image on its URL and re-encodes only the broken one", async () => {
    const good = "https://x.test/good.png";
    const bad = "https://x.test/bad.png";
    serve({ [good]: await solid(1920, 1080), [bad]: await solid(414, 2048) });

    const out = await fitKlingImages({ referenceUrls: [good, bad] });

    expect(out.referenceUrls[0]).toBe(good);
    expect(out.referenceUrls[1]).toMatch(/^data:image\/jpeg;base64,/);

    // The whole point: what we now send is inside the limit that rejected the original.
    const { meta } = await decodeDataUrl(out.referenceUrls[1]);
    expect(compliant(meta.width!, meta.height!)).toEqual([]);
  });

  // A reference is PADDED, never cropped — a tall pack shot is the subject, and a centre crop would
  // cut the pack in half. 414×2048 pads out to 820 wide (2048 × 0.4) with the original intact.
  it("pads a reference rather than cropping it", async () => {
    const bad = "https://x.test/pack.png";
    serve({ [bad]: await solid(414, 2048) });

    const out = await fitKlingImages({ referenceUrls: [bad] });
    const { meta } = await decodeDataUrl(out.referenceUrls[0]);

    expect(meta.height).toBe(2048);
    expect(meta.width).toBe(820);
  });

  // A frame is the literal first picture of the video, so bars would appear IN the clip.
  it("centre-crops a start frame instead of padding it", async () => {
    const bad = "https://x.test/frame.png";
    serve({ [bad]: await solid(414, 2048) });

    const out = await fitKlingImages({ startFrameUrl: bad, referenceUrls: [] });
    const { meta } = await decodeDataUrl(out.startFrameUrl!);

    expect(compliant(meta.width!, meta.height!)).toEqual([]);
    // Cropped to the ratio floor, so the width is the source's and the height was trimmed.
    expect(meta.width! / meta.height!).toBeCloseTo(KLING_IMAGE_LIMITS.minAspect, 2);
  });

  it("fits frames and references in the same request", async () => {
    const frame = "https://x.test/f.png";
    const ref = "https://x.test/r.png";
    serve({ [frame]: await solid(414, 2048), [ref]: await solid(3000, 200) });

    const out = await fitKlingImages({ startFrameUrl: frame, referenceUrls: [ref] });

    expect(out.startFrameUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(out.referenceUrls[0]).toMatch(/^data:image\/jpeg;base64,/);
  });

  // This step exists to remove a failure mode; it must never add one.
  it("passes the URL through when the image cannot be downloaded", async () => {
    const gone = "https://x.test/gone.png";
    serve({});
    const out = await fitKlingImages({ referenceUrls: [gone] });
    expect(out.referenceUrls).toEqual([gone]);
  });

  it("passes the URL through when the bytes cannot be decoded", async () => {
    const junk = "https://x.test/junk.png";
    serve({ [junk]: Buffer.from("not an image") });
    const out = await fitKlingImages({ referenceUrls: [junk] });
    expect(out.referenceUrls).toEqual([junk]);
  });

  it("downloads nothing when the request carries no images", async () => {
    serve({});
    const out = await fitKlingImages({ referenceUrls: [] });
    expect(out).toEqual({ startFrameUrl: undefined, endFrameUrl: undefined, referenceUrls: [] });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
