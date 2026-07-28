import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { normalizeReferenceImageForOpenAI } from "../providers/openai";

async function makeImage(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 40, b: 40 },
    },
  })
    .png()
    .toBuffer();
}

describe("normalizeReferenceImageForOpenAI", () => {
  it("leaves an already-compliant image's dimensions unchanged", async () => {
    const input = await makeImage(1024, 1024);
    const output = await normalizeReferenceImageForOpenAI(input);
    const meta = await sharp(output).metadata();
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(1024);
  });

  it("center-crops an image wider than 3:1 down to exactly 3:1", async () => {
    const input = await makeImage(4800, 800); // 6:1
    const output = await normalizeReferenceImageForOpenAI(input);
    const meta = await sharp(output).metadata();
    expect(meta.width! / meta.height!).toBeCloseTo(3.0, 1);
  });

  it("downscales an image whose longest edge exceeds 3840px", async () => {
    const input = await makeImage(4000, 4000);
    const output = await normalizeReferenceImageForOpenAI(input);
    const meta = await sharp(output).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(3840);
  });

  it("rounds both dimensions down to the nearest multiple of 16", async () => {
    const input = await makeImage(1025, 1030);
    const output = await normalizeReferenceImageForOpenAI(input);
    const meta = await sharp(output).metadata();
    expect(meta.width! % 16).toBe(0);
    expect(meta.height! % 16).toBe(0);
  });

  it("applies crop, downscale, and multiple-of-16 rounding together in the right order", async () => {
    const input = await makeImage(12000, 2000); // 6:1 AND over max edge
    const output = await normalizeReferenceImageForOpenAI(input);
    const meta = await sharp(output).metadata();
    expect(meta.width! / meta.height!).toBeLessThanOrEqual(3.0);
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(3840);
    expect(meta.width! % 16).toBe(0);
    expect(meta.height! % 16).toBe(0);
  });

  it("keeps the final ratio within 3:1 even when independent 16px rounding would push it over", async () => {
    const input = await makeImage(3000, 1000); // exactly 3:1 pre-rounding — no crop triggers
    const output = await normalizeReferenceImageForOpenAI(input);
    const meta = await sharp(output).metadata();
    expect(meta.width! / meta.height!).toBeLessThanOrEqual(3.0);
    expect(meta.width! % 16).toBe(0);
    expect(meta.height! % 16).toBe(0);
  });

  it("floors tiny dimensions at 16px instead of rounding to 0", async () => {
    const input = await makeImage(10, 10);
    const output = await normalizeReferenceImageForOpenAI(input);
    const meta = await sharp(output).metadata();
    expect(meta.width).toBe(16);
    expect(meta.height).toBe(16);
  });
});
