import { describe, it, expect } from "vitest";
import {
  autoAssignImageRoles,
  orderImagesForPromptTokens,
  assignImageRoles,
  type UpstreamImageRef,
} from "../assign-image-roles";

const img = (nodeId: string, type = "file"): UpstreamImageRef => ({
  nodeId,
  url: `https://x/${nodeId}.jpg`,
  type,
});

describe("autoAssignImageRoles", () => {
  it("defaults an untagged image to reference", () => {
    expect(autoAssignImageRoles([img("a"), img("b")], {})).toEqual({
      a: "reference",
      b: "reference",
    });
  });

  it("never overrides an explicit assignment", () => {
    expect(autoAssignImageRoles([img("a"), img("b")], { a: "end_frame" })).toEqual({
      a: "end_frame",
      b: "reference",
    });
  });

  // Operator request 2026-09-09 — every unassigned image defaults to `reference` on any model
  // that can take one. The old rule promoted the first generated still to `start_frame`, which
  // gave two identical-looking stills different roles based on traversal order the operator never
  // sees. On Seedance it was worse than surprising: frames and references are mutually exclusive
  // task types there, so a promoted still silently discarded every reference the prompt cited.
  it("defaults every still to a reference on a model that takes references", () => {
    expect(autoAssignImageRoles([img("a", "image-gen"), img("b", "image-gen")], {})).toEqual({
      a: "reference",
      b: "reference",
    });
  });

  // The one surviving promotion. Veo Lite and Kling 3.0 both declare maxReferenceImages: 0, and
  // Kling 3.0 refuses to generate without a start frame — defaulting their images to `reference`
  // would splice them away to nothing, silently downgrading one model to text-to-video and making
  // the other ungenerateable.
  it("promotes the first still ONLY when the model takes no references at all", () => {
    expect(
      autoAssignImageRoles([img("a", "image-gen"), img("b", "image-gen")], {}, {
        supportsStartFrame: true,
        supportsReferences: false,
      }),
    ).toEqual({ a: "start_frame", b: "reference" });
  });

  it("does not promote when a start frame is already assigned", () => {
    expect(
      autoAssignImageRoles([img("a", "image-gen")], { z: "start_frame" }, {
        supportsStartFrame: true,
        supportsReferences: false,
      }).a,
    ).toBe("reference");
  });

  it("does not promote on a model with no start frame", () => {
    expect(
      autoAssignImageRoles([img("a", "image-gen")], {}, {
        supportsStartFrame: false,
        supportsReferences: false,
      }).a,
    ).toBe("reference");
  });

  // The Seedance case that motivated the change: a promoted start frame makes buildSeedanceContent
  // return early, discarding every reference while the prompt still cites @Image 1, @Image 2.
  it("leaves no start frame for a reference-capable model, so nothing can be discarded", () => {
    const roles = autoAssignImageRoles([img("a", "image-gen"), img("b", "image-gen")], {}, {
      supportsStartFrame: true,
      supportsReferences: true,
    });
    expect(Object.values(roles)).not.toContain("start_frame");
  });

  it("keeps roles for images that are no longer connected", () => {
    // Pruning is the focus view's job and is scoped to what it can see; dropping here would
    // discard an assignment while its node was merely still loading.
    expect(autoAssignImageRoles([], { gone: "reference" })).toEqual({ gone: "reference" });
  });

  it("produces roles assignImageRoles then turns into real inputs", () => {
    const images = [img("a", "image-gen"), img("b"), img("c")];
    // Reference-capable model: all three become references, no start frame.
    const roles = autoAssignImageRoles(images, {});
    const assigned = assignImageRoles(images, roles);
    expect(assigned.startFrameUrl).toBeUndefined();
    expect(assigned.referenceUrls).toHaveLength(3);

    // No-reference model: the still leads as the start frame and the other two are dropped by the
    // route's cap, which is what keeps Veo Lite and Kling 3.0 working.
    const framesOnly = autoAssignImageRoles(images, {}, {
      supportsStartFrame: true,
      supportsReferences: false,
    });
    expect(assignImageRoles(images, framesOnly).startFrameUrl).toContain("a.jpg");
  });
});

/**
 * `<IMAGE_REF_N>` is numbered at the VIDEO-PROMPT node over its own upstream. Video Gen reaches
 * images by a traversal that leads with its OWN direct upstream, so an image attached straight to
 * it used to take slot 0 and shift every token onto the wrong picture — no error, just the wrong
 * product in a clip already paid for.
 */
describe("orderImagesForPromptTokens", () => {
  it("puts prompt-visible images first, in the prompt's order", () => {
    const ordered = orderImagesForPromptTokens(
      [img("direct"), img("second"), img("first")],
      ["first", "second"],
    );
    expect(ordered.map((i) => i.nodeId)).toEqual(["first", "second", "direct"]);
  });

  it("keeps images the prompt cannot see, after the ones it can", () => {
    const ordered = orderImagesForPromptTokens([img("x"), img("a"), img("y")], ["a"]);
    expect(ordered.map((i) => i.nodeId)).toEqual(["a", "x", "y"]);
  });

  it("is stable among images with no prompt rank", () => {
    const ordered = orderImagesForPromptTokens([img("x"), img("y"), img("z")], []);
    expect(ordered.map((i) => i.nodeId)).toEqual(["x", "y", "z"]);
  });

  it("is a no-op when the order already matches", () => {
    const ordered = orderImagesForPromptTokens([img("a"), img("b")], ["a", "b"]);
    expect(ordered.map((i) => i.nodeId)).toEqual(["a", "b"]);
  });

  // The end-to-end guarantee: reference N in the request is the image the prompt called REF N.
  it("makes reference order match the prompt's token order", () => {
    const promptOrder = ["v-strap", "sandal"];
    const traversal = [img("direct-extra"), img("sandal"), img("v-strap")];
    const ordered = orderImagesForPromptTokens(traversal, promptOrder);
    const assigned = assignImageRoles(ordered, autoAssignImageRoles(ordered, {}));
    expect(assigned.referenceUrls[0]).toContain("v-strap");
    expect(assigned.referenceUrls[1]).toContain("sandal");
  });
});
