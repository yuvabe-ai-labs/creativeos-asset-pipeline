import { describe, it, expect } from "vitest";
import { veoParams, veoLiteParams, VEO_NEGATIVE_DEFAULT } from "../params/veo";

describe("veoParams", () => {
  it("keeps aspect_ratio and duration as primary", () => {
    const primary = veoParams.filter((p) => p.group === "primary");
    expect(primary.map((p) => p.name)).toEqual(["aspect_ratio", "duration"]);
  });

  it("adds negative_prompt as an advanced textarea (same shape as Kling)", () => {
    const neg = veoParams.find((p) => p.name === "negative_prompt");
    expect(neg?.group).toBe("advanced");
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
