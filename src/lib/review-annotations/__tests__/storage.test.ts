import { describe, it, expect, vi } from "vitest";
import {
  annotationAssetPaths,
  uploadAnnotationAssets,
  signAnnotationAssets,
} from "../storage";
import type { SupabaseStorage } from "../storage";
import type { AnnotationPayload } from "../payload";
import type { AnnotationRow } from "@/lib/db/annotations";

// The stub is typed against the real bucket signature, not `ReturnType<typeof vi.fn>`:
// a bare `vi.fn()` is `Mock<Procedure | Constructable>`, whose call/construct union is
// not assignable to a concrete signature, so overriding widened `upload` past what
// `SupabaseStorage` accepts and broke `tsc` while vitest stayed green.
type StorageBucket = ReturnType<SupabaseStorage["from"]>;

function ann(over: Partial<AnnotationPayload> = {}): AnnotationPayload {
  return {
    seq: 1,
    kind: "image",
    timecodeMs: null,
    overlayBase64: "aGVsbG8=",
    frameBase64: null,
    note: "n",
    ...over,
  };
}

function stubStorage(overrides: {
  upload?: StorageBucket["upload"];
  createSignedUrl?: StorageBucket["createSignedUrl"];
} = {}) {
  const upload = overrides.upload ?? vi.fn(async () => ({ error: null }));
  const createSignedUrl =
    overrides.createSignedUrl ??
    vi.fn(async (path: string) => ({ data: { signedUrl: `https://signed/${path}` }, error: null }));
  return { storage: { from: () => ({ upload, createSignedUrl }) }, upload, createSignedUrl };
}

describe("annotationAssetPaths", () => {
  it("builds spec §5.2 paths", () => {
    expect(annotationAssetPaths("org-1", "d1", 2)).toEqual({
      maskPath: "org-1/d1/2-mask.png",
      framePath: "org-1/d1/2-frame.png",
    });
  });
});

describe("uploadAnnotationAssets", () => {
  it("uploads mask (and frame when present) and returns stored paths", async () => {
    const { storage, upload } = stubStorage();
    const out = await uploadAnnotationAssets(storage, "org-1", "d1", [
      ann({ seq: 1 }),
      ann({ seq: 2, kind: "video-frame", timecodeMs: 4000, frameBase64: "aGVsbG8=" }),
    ]);
    expect(out).toEqual([
      { seq: 1, maskPath: "org-1/d1/1-mask.png", framePath: null },
      { seq: 2, maskPath: "org-1/d1/2-mask.png", framePath: "org-1/d1/2-frame.png" },
    ]);
    expect(upload).toHaveBeenCalledTimes(3); // 2 masks + 1 frame
  });

  it("throws on the first upload failure", async () => {
    const upload = vi.fn(async () => ({ error: { message: "quota" } }));
    const { storage } = stubStorage({ upload });
    await expect(
      uploadAnnotationAssets(storage, "org-1", "d1", [ann()]),
    ).rejects.toThrow(/quota/);
  });
});

describe("signAnnotationAssets", () => {
  it("signs mask and frame per row, keyed by row id", async () => {
    const { storage } = stubStorage();
    const rows = [
      {
        id: "a1", decision_id: "d1", org_id: "org-1", seq: 1, kind: "image",
        timecode_ms: null, frame_path: null, mask_path: "org-1/d1/1-mask.png",
        note: "n", created_at: "t",
      } as AnnotationRow,
    ];
    const out = await signAnnotationAssets(storage, rows);
    expect(out.get("a1")).toEqual({
      maskUrl: "https://signed/org-1/d1/1-mask.png",
      frameUrl: null,
    });
  });

  it("yields null for a URL that fails to sign rather than throwing", async () => {
    const createSignedUrl = vi.fn(async () => ({ data: null, error: { message: "gone" } }));
    const { storage } = stubStorage({ createSignedUrl });
    const rows = [
      {
        id: "a1", decision_id: "d1", org_id: "org-1", seq: 1, kind: "image",
        timecode_ms: null, frame_path: null, mask_path: "p",
        note: "n", created_at: "t",
      } as AnnotationRow,
    ];
    const out = await signAnnotationAssets(storage, rows);
    expect(out.get("a1")).toEqual({ maskUrl: null, frameUrl: null });
  });
});
