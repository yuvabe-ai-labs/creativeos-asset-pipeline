import { describe, it, expect } from "vitest";
import { veoParams, veoLiteParams, VEO_NEGATIVE_DEFAULT } from "../params/veo";

describe("veoParams", () => {
  it("keeps resolution, duration, aspect_ratio and negative_prompt as primary", () => {
    const primary = veoParams.filter((p) => p.group === "primary");
    expect(primary.map((p) => p.name)).toEqual([
      "resolution",
      "duration",
      "aspect_ratio",
      "negative_prompt",
    ]);
  });

  it("offers 720p/1080p resolution, defaulting to 720p", () => {
    const resolution = veoParams.find((p) => p.name === "resolution");
    expect(resolution?.component).toBe("select");
    expect(resolution?.constraints).toEqual({ type: "select", options: ["720p", "1080p"] });
    expect(resolution?.defaultValue).toBe("720p");
  });

  it("pairs resolution + duration in the top row, same placement as Kling's params", () => {
    const primary = veoParams
      .filter((p) => p.group === "primary")
      .sort((a, b) => a.order - b.order);
    expect(primary.slice(0, 2).map((p) => p.name)).toEqual(["resolution", "duration"]);
  });

  it("has no advanced params, so Veo shows no Advanced accordion", () => {
    expect(veoParams.filter((p) => p.visible && p.group === "advanced")).toEqual([]);
  });

  it("adds negative_prompt as a primary textarea (same shape as Kling)", () => {
    const neg = veoParams.find((p) => p.name === "negative_prompt");
    expect(neg?.group).toBe("primary");
    expect(neg?.component).toBe("textarea");
    expect(neg?.visible).toBe(true);
    expect(neg?.constraints).toEqual({ type: "textarea", maxLength: 2500 });
    expect(neg?.defaultValue).toBe(VEO_NEGATIVE_DEFAULT);
  });

  it("prefills a product-tuned default that preserves the product's real label text/logo", () => {
    const items = VEO_NEGATIVE_DEFAULT.split(",").map((s) => s.trim());
    expect(items).toContain("warped label");
    expect(items).toContain("text distortion");
    expect(items).not.toContain("text"); // never blanket-suppress the label's real text
    expect(items).not.toContain("logo"); // …or the real logo
  });

  it("veoLiteParams shares the same param set", () => {
    expect(veoLiteParams).toEqual(veoParams);
  });
});
