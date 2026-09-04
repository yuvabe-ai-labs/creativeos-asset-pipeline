import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpload = vi.fn();
vi.mock("@/lib/storage", () => ({
  uploadReviewAnnotationAssets: (args: unknown) => mockUpload(args),
  publicUrlFor: (path: string) => `https://storage.googleapis.com/test-bucket/${path}`,
}));

import { uploadAnnotationAssets, annotationAssetUrls } from "../storage";
import { pathForReviewAnnotation } from "@/lib/storage/paths";
import type { AnnotationPayload } from "../payload";
import type { AnnotationRow } from "@/lib/db/annotations";

function ann(over: Partial<AnnotationPayload> = {}): AnnotationPayload {
  return {
    seq: 1,
    kind: "image",
    timecodeMs: null,
    overlayBase64: "aGVsbG8=", // "hello"
    note: "n",
    bounds: null,
    ...over,
  };
}

function row(over: Partial<AnnotationRow> = {}): AnnotationRow {
  return {
    id: "a1",
    decision_id: "d1",
    org_id: "org-1",
    seq: 1,
    kind: "image",
    timecode_ms: null,
    frame_path: null,
    mask_path: "clients/c1/canvases/cv1/nodes/n1/review-annotations/d1/1-mask.png",
    note: "n",
    bounds: null,
    created_at: "t",
    ...over,
  };
}

beforeEach(() => {
  mockUpload.mockReset();
  mockUpload.mockResolvedValue([]);
});

describe("pathForReviewAnnotation", () => {
  it("puts assets under the node they annotate, keyed by decision and seq", () => {
    expect(
      pathForReviewAnnotation({
        clientId: "c1",
        canvasId: "cv1",
        nodeId: "n1",
        decisionId: "d1",
        seq: 2,
      }),
    ).toBe("clients/c1/canvases/cv1/nodes/n1/review-annotations/d1/2-mask.png");
  });
});

describe("uploadAnnotationAssets", () => {
  it("decodes base64 to buffers and hands the batch to lib/storage once", async () => {
    await uploadAnnotationAssets("n1", "d1", [
      ann({ seq: 1 }),
      ann({ seq: 2, kind: "video-frame", timecodeMs: 4000 }),
    ]);
    // One call for the whole batch: ownership must not be re-resolved per asset.
    expect(mockUpload).toHaveBeenCalledTimes(1);
    const arg = mockUpload.mock.calls[0][0] as {
      nodeId: string;
      decisionId: string;
      assets: { seq: number; mask: Buffer }[];
    };
    expect(arg.nodeId).toBe("n1");
    expect(arg.decisionId).toBe("d1");
    expect(arg.assets[0].mask.toString("utf8")).toBe("hello");
    // D219: a video annotation uploads exactly what an image one does — the mask. No
    // captured still, which is what used to blow the Server Action body limit.
    expect(arg.assets).toHaveLength(2);
    expect(Object.keys(arg.assets[1])).toEqual(["seq", "mask"]);
  });

  it("propagates an upload failure so the caller's whole action aborts", async () => {
    mockUpload.mockRejectedValueOnce(new Error("quota"));
    await expect(uploadAnnotationAssets("n1", "d1", [ann()])).rejects.toThrow(/quota/);
  });
});

describe("annotationAssetUrls", () => {
  it("maps stored mask paths to public URLs, keyed by row id", () => {
    const out = annotationAssetUrls([row()]);
    expect(out.get("a1")).toBe(
      "https://storage.googleapis.com/test-bucket/clients/c1/canvases/cv1/nodes/n1/review-annotations/d1/1-mask.png",
    );
  });

  it("gives a video-frame row the same single mask URL — no stored still (D219)", () => {
    const out = annotationAssetUrls([
      row({ id: "a2", kind: "video-frame", timecode_ms: 4000 }),
    ]);
    expect(out.get("a2")).toBe(
      "https://storage.googleapis.com/test-bucket/clients/c1/canvases/cv1/nodes/n1/review-annotations/d1/1-mask.png",
    );
  });
});
