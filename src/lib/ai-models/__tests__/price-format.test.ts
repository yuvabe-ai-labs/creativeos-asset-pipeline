import { describe, expect, it } from "vitest";
import { displayAmount, formatPriceLine, formatPriceShort, formatPriceSummary, formatUnitPrice, formatUsd, formatUsdShort, isTokenMeter } from "../price-format";
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

describe("formatUsd (full stored precision)", () => {
  it.each([
    [0.069504, "$0.069504"],
    [0.0337925, "$0.0337925"],
    [0.006961122132887822, "$0.006961122"],
    [0.5, "$0.50"],
    [0.1, "$0.10"],
    [3, "$3.00"],
    [0, "$0.00"],
    [1234.5, "$1,234.50"],
    [5e-7, "$0.0000005"],
    [1.23456789e-9, "$0.000000001234568"],
    [-0.25, "−$0.25"],
  ])("formats %d as %s", (n, text) => {
    expect(formatUsd(n)).toBe(text);
  });
  it("shows a dash for no value", () => {
    expect(formatUsd(null)).toBe("–");
    expect(formatUsd(Number.NaN)).toBe("–");
  });
  it("never uses exponent form", () => {
    for (const n of [1e-7, 1.5e-10, 2e21, 7.5e-8]) expect(formatUsd(n)).not.toMatch(/e/i);
  });
});

describe("unit prices", () => {
  it("shows token prices per 1M and others per unit", () => {
    expect(displayAmount("input_token", 0.0000015)).toBe(1.5);
    expect(displayAmount("video_output_token", 0.0000117)).toBe(11.7);
    expect(displayAmount("output_image", 0.134)).toBe(0.134);
    expect(formatUnitPrice("text_output_token", 0.0000045)).toBe("$4.50");
    expect(formatUnitPrice("video_second", 0.023172)).toBe("$0.023172");
    expect(isTokenMeter("thought_token")).toBe(true);
    expect(isTokenMeter("video_second")).toBe(false);
  });
});

describe("formatUsdShort (money rounded for reading)", () => {
  it("rounds to cents with thousands grouped", () => {
    expect(formatUsdShort(15.16145)).toBe("$15.16");
    expect(formatUsdShort(101.0808)).toBe("$101.08");
    expect(formatUsdShort(1234.5)).toBe("$1,234.50");
  });
  it("says under a cent, and $0 for nothing", () => {
    expect(formatUsdShort(0.004111)).toBe("<$0.01");
    expect(formatUsdShort(0)).toBe("$0");
  });
});

describe("formatPriceShort (a unit price rounded for reading)", () => {
  it("keeps cents from $0.10 up", () => {
    expect(formatPriceShort(1.25)).toBe("$1.25");
    expect(formatPriceShort(2)).toBe("$2.00");
    expect(formatPriceShort(0.134)).toBe("$0.13");
  });
  it("keeps 2 significant figures below that, never exponent form", () => {
    expect(formatPriceShort(0.084)).toBe("$0.084");
    expect(formatPriceShort(0.0337925)).toBe("$0.034");
    expect(formatPriceShort(0.006961122)).toBe("$0.007");
    expect(formatPriceShort(0.000000182)).toBe("$0.00000018");
  });
});
