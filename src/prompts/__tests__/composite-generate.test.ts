import { describe, it, expect } from "vitest";
import type { CompositeRef } from "@/lib/composite/references";
import { buildCompositePrompt } from "../composite-generate";

const AVATAR: CompositeRef = { nodeId: "a", name: "Riya", role: "avatar", position: 1, image: { url: "https://cdn/f.png" } };
const SHEET: CompositeRef = { nodeId: "a:sheet", name: "Riya sheet", role: "avatar-sheet", position: 2, image: { url: "https://cdn/s.png" } };
const SANDALS: CompositeRef = { nodeId: "f", name: "Sandals.png", role: "image", position: 3, image: { url: "https://cdn/x.png" } };

describe("buildCompositePrompt (D312)", () => {
  const withAvatar = buildCompositePrompt({
    refs: [AVATAR, SHEET, SANDALS],
    instruction: "Riya (image 1) at her desk holding Sandals.png (image 3), in a bright office.",
  });

  it("lists every reference by position and name; the sheet as the same person", () => {
    expect(withAvatar).toContain("Image 1: Riya, the person in this picture");
    expect(withAvatar).toContain("Image 2: Riya's profile sheet");
    expect(withAvatar).toContain("Image 3: Sandals.png");
  });

  it("carries the operator's instruction verbatim", () => {
    expect(withAvatar).toContain("Riya (image 1) at her desk holding Sandals.png (image 3), in a bright office.");
  });

  it("holds both preservation rules and the sheet rule", () => {
    expect(withAvatar).toMatch(/same face/);
    expect(withAvatar).toMatch(/Add no text, logo, label or branding/);
    expect(withAvatar).toMatch(/every panel shows the same place, in the same light/);
  });

  it("states the person rule only when an avatar is wired", () => {
    const noAvatar = buildCompositePrompt({ refs: [SANDALS], instruction: "On a desk." });
    expect(noAvatar).not.toMatch(/same face/);
    expect(noAvatar).toMatch(/Add no text, logo, label or branding/);
  });

  it("works with no references at all — a background from text alone", () => {
    const bare = buildCompositePrompt({ refs: [], instruction: "An empty bedroom, four angles, warm light." });
    expect(bare).toContain("No reference images are attached");
    expect(bare).toContain("An empty bedroom, four angles, warm light.");
  });

  it("adds no styling of its own", () => {
    const plain = buildCompositePrompt({ refs: [SANDALS], instruction: "On a desk." });
    for (const term of ["mm", "f/", "aperture", "depth of field", "bokeh", "golden hour", "softbox", "film", "grain", "grade"]) {
      expect(plain.toLowerCase()).not.toContain(term);
    }
  });
});
