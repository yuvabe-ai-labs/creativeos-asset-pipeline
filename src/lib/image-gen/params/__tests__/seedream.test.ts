import { describe, it, expect } from "vitest";
import {
  SEEDREAM_LITE_SIZES,
  SEEDREAM_PRO_SIZES,
  seedreamLiteParams,
  seedreamProParams,
  seedreamSize,
} from "../seedream";
import type { ParamSpec } from "../../types";

function options(params: ParamSpec[], name: string): string[] {
  const spec = params.find((p) => p.name === name);
  if (!spec || spec.constraints.type !== "select") throw new Error(`no ${name} select`);
  return spec.constraints.options;
}

function defaultOf(params: ParamSpec[], name: string): unknown {
  return params.find((p) => p.name === name)?.defaultValue;
}

describe("seedream params", () => {
  it("offers each model's own resolutions, from the vendor table", () => {
    expect(options(seedreamLiteParams, "image_size")).toEqual(["2K", "3K", "4K"]);
    expect(options(seedreamProParams, "image_size")).toEqual(["1K", "1.5K", "2K"]);
  });

  it("defaults to a 9:16 reel at 2K", () => {
    for (const params of [seedreamLiteParams, seedreamProParams]) {
      expect(defaultOf(params, "aspect_ratio")).toBe("9:16");
      expect(defaultOf(params, "image_size")).toBe("2K");
    }
  });

  it("has a size for every offered (resolution, ratio) pair", () => {
    for (const [params, sizes] of [
      [seedreamLiteParams, SEEDREAM_LITE_SIZES],
      [seedreamProParams, SEEDREAM_PRO_SIZES],
    ] as const) {
      for (const res of options(params, "image_size")) {
        for (const ratio of options(params, "aspect_ratio")) {
          expect(() => seedreamSize(sizes, res, ratio)).not.toThrow();
        }
      }
    }
  });
});

describe("seedreamSize", () => {
  // Spot checks against ref/byteplus-docs/Image generation API.md.
  it("maps to the vendor's published pixels", () => {
    expect(seedreamSize(SEEDREAM_LITE_SIZES, "2K", "9:16")).toBe("1600x2848");
    expect(seedreamSize(SEEDREAM_LITE_SIZES, "3K", "3:2")).toBe("3744x2496");
    expect(seedreamSize(SEEDREAM_LITE_SIZES, "4K", "16:9")).toBe("5504x3040");
    expect(seedreamSize(SEEDREAM_PRO_SIZES, "1K", "9:16")).toBe("800x1424");
    expect(seedreamSize(SEEDREAM_PRO_SIZES, "1.5K", "21:9")).toBe("2352x1008");
    expect(seedreamSize(SEEDREAM_PRO_SIZES, "2K", "9:16")).toBe("1584x2816");
  });

  it("stays inside each model's documented pixel range", () => {
    const px = (s: string) => s.split("x").map(Number).reduce((a, b) => a * b);
    for (const row of Object.values(SEEDREAM_LITE_SIZES)) {
      for (const s of Object.values(row)) {
        expect(px(s)).toBeGreaterThanOrEqual(3_686_400);
        expect(px(s)).toBeLessThanOrEqual(16_777_216);
      }
    }
    for (const row of Object.values(SEEDREAM_PRO_SIZES)) {
      for (const s of Object.values(row)) {
        expect(px(s)).toBeGreaterThanOrEqual(921_600);
        expect(px(s)).toBeLessThanOrEqual(4_624_220);
      }
    }
  });

  it("throws on a pair the table does not have", () => {
    expect(() => seedreamSize(SEEDREAM_PRO_SIZES, "4K", "9:16")).toThrow(/no size/);
  });
});
