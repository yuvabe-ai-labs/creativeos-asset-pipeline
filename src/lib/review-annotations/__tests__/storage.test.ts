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
    frameBase64: null,
    note: "n",
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
    const args = {
      clientId: "c1",
      canvasId: "cv1",
      nodeId: "n1",
      decisionId: "d1",
      seq: 2,
    } as const;
    expect(pathForReviewAnnotation({ ...args, asset: "mask" })).toBe(
      "clients/c1/canvases/cv1/nodes/n1/review-annotations/d1/2-mask.png",
    );
    expect(pathForReviewAnnotation({ ...args, asset: "frame" })).toBe(
      "clients/c1/canvases/cv1/nodes/n1/review-annotations/d1/2-frame.png",
    );
  });
});

describe("uploadAnnotationAssets", () => {
  it("decodes base64 to buffers and hands the batch to lib/storage once", async () => {
    await uploadAnnotationAssets("n1", "d1", [
      ann({ seq: 1 }),
      ann({ seq: 2, kind: "video-frame", timecodeMs: 4000, frameBase64: "aGVsbG8=" }),
    ]);
    // One call for the whole batch: ownership must not be re-resolved per asset.
    expect(mockUpload).toHaveBeenCalledTimes(1);
    const arg = mockUpload.mock.calls[0][0] as {
      nodeId: string;
      decisionId: string;
      assets: { seq: number; mask: Buffer; frame: Buffer | null }[];
    };
    expect(arg.nodeId).toBe("n1");
    expect(arg.decisionId).toBe("d1");
    expect(arg.assets[0].mask.toString("utf8")).toBe("hello");
    expect(arg.assets[0].frame).toBeNull();
    expect(arg.assets[1].frame?.toString("utf8")).toBe("hello");
  });

  it("propagates an upload failure so the caller's whole action aborts", async () => {
    mockUpload.mockRejectedValueOnce(new Error("quota"));
    await expect(uploadAnnotationAssets("n1", "d1", [ann()])).rejects.toThrow(/quota/);
  });
});

describe("annotationAssetUrls", () => {
  it("maps stored paths to public URLs, keyed by row id", () => {
    const out = annotationAssetUrls([row()]);
    expect(out.get("a1")).toEqual({
      maskUrl:
        "https://storage.googleapis.com/test-bucket/clients/c1/canvases/cv1/nodes/n1/review-annotations/d1/1-mask.png",
      frameUrl: null,
    });
  });

  it("carries the frame URL for a video-frame row", () => {
    const out = annotationAssetUrls([
      row({
        id: "a2",
        kind: "video-frame",
        timecode_ms: 4000,
        frame_path: "clients/c1/canvases/cv1/nodes/n1/review-annotations/d1/1-frame.png",
      }),
    ]);
    expect(out.get("a2")?.frameUrl).toBe(
      "https://storage.googleapis.com/test-bucket/clients/c1/canvases/cv1/nodes/n1/review-annotations/d1/1-frame.png",
    );
  });
});
