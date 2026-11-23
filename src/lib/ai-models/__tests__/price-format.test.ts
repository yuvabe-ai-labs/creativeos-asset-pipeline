import { describe, expect, it } from "vitest";
import { formatPriceLine, formatPriceSummary } from "../price-format";
import type { PriceLine } from "../types";

describe("formatPriceLine", () => {
  it("prices tokens per million", () => {
    expect(formatPriceLine({ meter: "input_token", unit_usd: 0.00000125 })).toBe("$1.25 / 1M input tokens");
    expect(formatPriceLine({ meter: "text_output_token", unit_usd: 5e-7 })).toBe("$0.5 / 1M text output tokens");
  });
  it("prices other meters per unit", () => {
    expect(formatPriceLine({ meter: "output_image", unit_usd: 0.134 })).toBe("$0.134 / output image");
    expect(formatPriceLine({ meter: "video_second", unit_usd: 0.07 })).toBe("$0.07 / video second");
  });
  it("never uses exponent form", () => {
    expect(formatPriceLine({ meter: "character", unit_usd: 5e-7 })).toBe("$0.0000005 / character");
    expect(formatPriceLine({ meter: "input_token", unit_usd: 1e-9 })).toBe("$0.001 / 1M input tokens");
  });
  it("appends conditions with on/off booleans", () => {
    expect(
      formatPriceLine({ meter: "video_second", unit_usd: 0.1, when: { resolution: "1080p", audio: true } }),
    ).toBe("$0.1 / video second (resolution 1080p, audio on)");
    expect(formatPriceLine({ meter: "video_second", unit_usd: 0.1, when: { audio: false } })).toBe(
      "$0.1 / video second (audio off)",
    );
  });
});

describe("formatPriceSummary", () => {
  const line = (n: number): PriceLine => ({ meter: "output_image", unit_usd: n });
  it("shows two lines then +N more", () => {
    expect(formatPriceSummary([line(1), line(2), line(3), line(4)])).toBe(
      "$1 / output image, $2 / output image +2 more",
    );
    expect(formatPriceSummary([line(1), line(2)])).toBe("$1 / output image, $2 / output image");
    expect(formatPriceSummary([])).toBe("");
  });
});
