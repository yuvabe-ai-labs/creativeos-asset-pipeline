import { describe, it, expect } from "vitest";
import { validateReferenceImages } from "../validate";
import type { RefImageMeta } from "../validate";

const openaiModel = {
  label: "GPT Image 2",
  maxReferenceSizeBytes: 50 * 1024 * 1024,      // 50 MB
  maxTotalReferenceSizeBytes: undefined,
  maxImageEdgePx: 3840,
  maxAspectRatio: 3.0,
  minDimensionMultiple: 16,
};

const geminiModel = {
  label: "Nano Banana",
  maxReferenceSizeBytes: 0,
  maxTotalReferenceSizeBytes: 100 * 1024 * 1024, // 100 MB
  maxImageEdgePx: undefined,
  maxAspectRatio: undefined,
  minDimensionMultiple: undefined,
};

describe("validateReferenceImages", () => {
  it("returns ok for empty image list", () => {
    expect(validateReferenceImages([], openaiModel)).toEqual({ ok: true });
  });

  it("returns ok when all metadata is absent (skip checks)", () => {
    const images: RefImageMeta[] = [{ url: "https://example.com/a.png" }];
    expect(validateReferenceImages(images, openaiModel)).toEqual({ ok: true });
  });

  it("fails per-image size when image exceeds maxReferenceSizeBytes", () => {
    const images: RefImageMeta[] = [
      { url: "https://example.com/big.png", filename: "big.png", fileSizeBytes: 60 * 1024 * 1024 },
    ];
    const result = validateReferenceImages(images, openaiModel);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].message).toMatch(/60 MB/);
      expect(result.violations[0].message).toMatch(/50 MB/);
      expect(result.violations[0].message).toMatch(/big\.png/);
    }
  });

  it("passes per-image size when image is exactly at limit", () => {
    const images: RefImageMeta[] = [
      { url: "https://example.com/ok.png", fileSizeBytes: 50 * 1024 * 1024 },
    ];
    expect(validateReferenceImages(images, openaiModel)).toEqual({ ok: true });
  });

  it("fails aggregate size for Gemini when combined exceeds maxTotalReferenceSizeBytes", () => {
    const images: RefImageMeta[] = [
      { url: "https://example.com/a.png", fileSizeBytes: 60 * 1024 * 1024 },
      { url: "https://example.com/b.png", fileSizeBytes: 60 * 1024 * 1024 },
    ];
    const result = validateReferenceImages(images, geminiModel);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations[0].message).toMatch(/120 MB/);
      expect(result.violations[0].message).toMatch(/100 MB/);
    }
  });

  it("passes aggregate size for Gemini when combined is under limit", () => {
    const images: RefImageMeta[] = [
      { url: "https://example.com/a.png", fileSizeBytes: 40 * 1024 * 1024 },
      { url: "https://example.com/b.png", fileSizeBytes: 40 * 1024 * 1024 },
    ];
    expect(validateReferenceImages(images, geminiModel)).toEqual({ ok: true });
  });

  it("fails max edge when width exceeds maxImageEdgePx", () => {
    const images: RefImageMeta[] = [
      { url: "https://example.com/wide.png", filename: "wide.png", imageWidth: 4000, imageHeight: 800 },
    ];
    const result = validateReferenceImages(images, openaiModel);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations[0].message).toMatch(/4000/);
      expect(result.violations[0].message).toMatch(/3840/);
    }
  });

  it("fails max edge when height exceeds maxImageEdgePx", () => {
    const images: RefImageMeta[] = [
      { url: "https://example.com/tall.png", imageWidth: 800, imageHeight: 4000 },
    ];
    const result = validateReferenceImages(images, openaiModel);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations[0].message).toMatch(/4000/);
    }
  });

  it("fails aspect ratio when long:short exceeds maxAspectRatio", () => {
    const images: RefImageMeta[] = [
      { url: "https://example.com/ratio.png", filename: "ratio.png", imageWidth: 3000, imageHeight: 900 },
    ];
    // 3000/900 = 3.33 > 3.0
    const result = validateReferenceImages(images, openaiModel);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations[0].message).toMatch(/3\.33/);
      expect(result.violations[0].message).toMatch(/3:1/);
    }
  });

  it("passes aspect ratio exactly at 3:1", () => {
    const images: RefImageMeta[] = [
      { url: "https://example.com/ok.png", imageWidth: 3072, imageHeight: 1024 },
    ];
    expect(validateReferenceImages(images, openaiModel)).toEqual({ ok: true });
  });

  it("fails dimension multiple when width is not a multiple of minDimensionMultiple", () => {
    const images: RefImageMeta[] = [
      { url: "https://example.com/bad.png", filename: "bad.png", imageWidth: 1025, imageHeight: 1024 },
    ];
    const result = validateReferenceImages(images, openaiModel);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations[0].message).toMatch(/1025/);
      expect(result.violations[0].message).toMatch(/16/);
    }
  });

  it("collects multiple violations across images", () => {
    const images: RefImageMeta[] = [
      { url: "https://example.com/big.png", filename: "big.png", fileSizeBytes: 60 * 1024 * 1024 },
      { url: "https://example.com/wide.png", filename: "wide.png", imageWidth: 4200, imageHeight: 1000 },
    ];
    const result = validateReferenceImages(images, openaiModel);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toHaveLength(2);
    }
  });

  it("skips dimension checks when metadata is absent", () => {
    const images: RefImageMeta[] = [
      { url: "https://example.com/unknown.png", fileSizeBytes: 10 * 1024 * 1024 },
      // no imageWidth/imageHeight — dimension checks must not run
    ];
    expect(validateReferenceImages(images, openaiModel)).toEqual({ ok: true });
  });
});
