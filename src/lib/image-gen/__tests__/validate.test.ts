import { describe, it, expect } from "vitest";
import { validateReferenceImages } from "../validate";
import type { RefImageMeta } from "../validate";

const openaiModel = {
  label: "GPT Image 2",
  maxReferenceSizeBytes: 50 * 1024 * 1024,      // 50 MB
  maxTotalReferenceSizeBytes: undefined,
};

const geminiModel = {
  label: "Nano Banana",
  maxReferenceSizeBytes: 0,
  maxTotalReferenceSizeBytes: 100 * 1024 * 1024, // 100 MB
};

describe("validateReferenceImages", () => {
  it("returns ok for empty image list", () => {
    expect(validateReferenceImages([], openaiModel)).toEqual({ ok: true });
  });

  it("returns ok when all metadata is absent", () => {
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

  it("collects multiple violations across images", () => {
    const images: RefImageMeta[] = [
      { url: "https://example.com/big1.png", filename: "big1.png", fileSizeBytes: 60 * 1024 * 1024 },
      { url: "https://example.com/big2.png", filename: "big2.png", fileSizeBytes: 70 * 1024 * 1024 },
    ];
    const result = validateReferenceImages(images, openaiModel);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toHaveLength(2);
    }
  });
});
