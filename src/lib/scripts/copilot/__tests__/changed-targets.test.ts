import { describe, it, expect } from "vitest";
import { linkedDoc, reel01Doc } from "@/lib/scripts/visualise/__tests__/fixtures";
import { changedTargets } from "../changed-targets";

describe("changedTargets", () => {
  it("names a character whose avatar was cast", () => {
    const before = reel01Doc();
    expect(changedTargets(before, { ...before, cast: linkedDoc().cast })).toEqual(["cast:meenakshi", "cast:husband"]);
  });

  it("names a new shot and a changed one", () => {
    const before = reel01Doc();
    const after = { ...before, shots: [{ ...before.shots[0], vo: "New line." }, ...before.shots.slice(1), { ...before.shots[1], id: "new1" }] };
    expect(changedTargets(before, after)).toEqual(["shot:s01", "shot:new1"]);
  });

  it("names a renamed location and a product with a new picture", () => {
    const before = { ...reel01Doc(), locations: [{ id: "cafe", name: "the café", description: "d", image: null }], products: [{ id: "pouch", name: "the bottle", images: [] }] };
    const after = {
      ...before,
      locations: [{ ...before.locations[0], name: "the rooftop" }],
      products: [{ ...before.products[0], images: [{ url: "https://x/1.png" } as never] }],
    };
    expect(changedTargets(before, after)).toEqual(["location:cafe", "product:pouch"]);
  });

  it("names nothing for something removed", () => {
    const before = { ...reel01Doc(), products: [{ id: "pouch", name: "the bottle", images: [] }] };
    expect(changedTargets(before, { ...before, products: [] })).toEqual([]);
  });
});
