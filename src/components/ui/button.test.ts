import { describe, it, expect } from "vitest";
import { buttonVariants } from "./button";

// D481 — Tailwind's translate utilities all write the same variables, so a press written as one
// replaces the `-translate-y-1/2` that centres an absolutely positioned Button. The Button jumps
// out from under the pointer on mouse-down, the release lands elsewhere, and no click fires.
describe("Button press", () => {
  it("does not use a translate utility, which would undo a Button's own positioning", () => {
    expect(buttonVariants()).not.toMatch(/active:\S*translate-/);
  });
  it("still nudges on press, through transform, which adds to translate", () => {
    expect(buttonVariants()).toContain("active:not-aria-[haspopup]:[transform:translateY(1px)]");
  });
});
