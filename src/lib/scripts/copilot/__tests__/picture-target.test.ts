import { describe, it, expect } from "vitest";
import { linkedDoc } from "@/lib/scripts/visualise/__tests__/fixtures";
import type { ScriptDoc } from "@/lib/scripts/schema";
import { pictureTarget, pictureUrl, targetName } from "../picture-target";

const img = { url: "https://x/cafe.png", name: "cafe.png" };
const doc = (over: Partial<ScriptDoc> = {}): ScriptDoc => ({
  ...linkedDoc(),
  locations: [
    { id: "cafe", name: "the café", description: "d", image: null },
    { id: "park", name: "the park", description: "d", image: img as never },
  ],
  products: [{ id: "pouch", name: "the bottle", images: [] }],
  ...over,
});

describe("pictureTarget", () => {
  it("uses the item the person pressed Attach a picture on", () => {
    expect(pictureTarget(doc(), "", "location:park")).toEqual({ target: "location:park" });
  });
  it("uses the one item the message names, with or without its 'the'", () => {
    expect(pictureTarget(doc(), "this is the café", null)).toEqual({ target: "location:cafe" });
    expect(pictureTarget(doc(), "Bottle shot", null)).toEqual({ target: "product:pouch" });
  });
  it("uses the only item still without a picture", () => {
    const one = doc({ products: [{ id: "pouch", name: "the bottle", images: [img as never] }] });
    expect(pictureTarget(one, "", null)).toEqual({ target: "location:cafe" });
  });
  it("asks, with every product and location, when nothing makes it clear", () => {
    expect(pictureTarget(doc(), "here you go", null)).toEqual({
      ask: [{ id: "product:pouch", name: "the bottle" }, { id: "location:cafe", name: "the café" }, { id: "location:park", name: "the park" }],
    });
  });
  it("says there is nothing to attach it to when the script has no products or locations", () => {
    expect(pictureTarget(doc({ locations: [], products: [] }), "the café", null)).toEqual({ none: true });
  });
});

describe("pictureUrl and targetName", () => {
  it("reads a location's picture, a product's newest one, and the item's name", () => {
    const d = doc({ products: [{ id: "pouch", name: "the bottle", images: [{ url: "https://x/1.png" } as never, { url: "https://x/2.png" } as never] }] });
    expect(pictureUrl(d, "location:park")).toBe("https://x/cafe.png");
    expect(pictureUrl(d, "product:pouch")).toBe("https://x/2.png");
    expect(pictureUrl(d, "location:cafe")).toBeNull();
    expect(targetName(d, "product:pouch")).toBe("the bottle");
  });
});
