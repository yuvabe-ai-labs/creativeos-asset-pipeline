import { describe, it, expect } from "vitest";
import type { CompositeRef } from "@/lib/composite/references";
import { buildCompositePrompt, buildCompositeEditPrompt } from "../composite-generate";

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

  // The 2026-10-06 kitchen composite: the avatar pasted in at portrait scale, studio-lit, sitting
  // in front of the room rather than in it. These rules are how a person is put into a scene.
  describe("placing a person into a scene", () => {
    it("asks for believable scale, standing on real surfaces at the camera's eye level", () => {
      expect(withAvatar).toMatch(/realistic scale for the space/);
      expect(withAvatar).toMatch(/rest on real surfaces/);
    });

    it("lights the person with the scene's own light, with contact shadows", () => {
      expect(withAvatar).toMatch(/lit by the scene's own light/);
      expect(withAvatar).toMatch(/contact shadows/);
    });

    it("forbids the cut-out look", () => {
      expect(withAvatar).toMatch(/no cut-out edges, halo or pasted-on look/);
    });

    it("puts the person in the space, never in the avatar portrait's crop or studio framing", () => {
      expect(withAvatar).toMatch(/inside the space, not posed in front of it/);
      expect(withAvatar).toMatch(/never the portrait's crop or studio framing/);
    });

    it("states the person-placement rules only when an avatar is wired", () => {
      const noAvatar = buildCompositePrompt({ refs: [SANDALS], instruction: "On a desk." });
      expect(noAvatar).not.toMatch(/inside the space, not posed in front of it/);
    });
  });

  // The composite is the UGC clip's reference: when the operator names no camera, frame it so the
  // video model can read the person and the room.
  describe("default UGC framing", () => {
    it("defaults to a clear, eye-level phone frame — the person facing camera, face and hands visible, room readable", () => {
      expect(withAvatar).toMatch(/Unless the description sets the camera or framing/);
      expect(withAvatar).toMatch(/eye-level phone video/);
      expect(withAvatar).toMatch(/face and hands clearly visible/);
    });

    it("yields to the operator's camera words", () => {
      expect(withAvatar).toMatch(/the description's camera and framing win/);
    });
  });
});

// D312 — Edit: Image Gen's edit templates, on the composite's current picture, with the composite's
// preservation rules so an edit cannot drift the face or the product.
describe("buildCompositeEditPrompt", () => {
  const EXTRA: CompositeRef = { nodeId: "f", name: "Sandals.png", role: "image", position: 2, image: { url: "https://cdn/x.png" } };

  it("uses the intent's template on the provided picture", () => {
    const p = buildCompositeEditPrompt({ instruction: "the cup on the counter", intent: "remove", extras: [], hasAvatar: false });
    expect(p).toMatch(/^Using the provided image, remove the cup on the counter\./);
  });

  it("names image 1 as the picture being edited and lists the extras by position", () => {
    const p = buildCompositeEditPrompt({ instruction: "Sandals.png (image 2) in her hand", intent: "add", extras: [EXTRA], hasAvatar: false });
    expect(p).toContain("Image 1 is the picture being edited.");
    expect(p).toContain("Image 2: Sandals.png.");
  });

  it("keeps the person only when an avatar is wired; always keeps the product", () => {
    const withPerson = buildCompositeEditPrompt({ instruction: "x", intent: "modify", extras: [], hasAvatar: true });
    const without = buildCompositeEditPrompt({ instruction: "x", intent: "modify", extras: [], hasAvatar: false });
    expect(withPerson).toMatch(/same face/);
    expect(without).not.toMatch(/same face/);
    expect(without).toMatch(/Add no text, logo, label or branding/);
  });
});

