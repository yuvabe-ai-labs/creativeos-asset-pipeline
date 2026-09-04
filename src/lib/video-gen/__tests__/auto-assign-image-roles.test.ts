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

  // A generated still reads as "animate THIS" — the one type worth promoting. Guessing it wrong
  // changes the request's whole shape, so it is promoted once and never over an explicit role.
  it("promotes the first image-gen still to the start frame", () => {
    expect(autoAssignImageRoles([img("a", "image-gen"), img("b", "image-gen")], {})).toEqual({
      a: "start_frame",
      b: "reference",
    });
  });

  it("does not promote when a start frame is already assigned", () => {
    expect(autoAssignImageRoles([img("a", "image-gen")], { z: "start_frame" }).a).toBe("reference");
  });

  it("does not promote on a model with no start frame", () => {
    expect(
      autoAssignImageRoles([img("a", "image-gen")], {}, { supportsStartFrame: false }).a,
    ).toBe("reference");
  });

  it("keeps roles for images that are no longer connected", () => {
    // Pruning is the focus view's job and is scoped to what it can see; dropping here would
    // discard an assignment while its node was merely still loading.
    expect(autoAssignImageRoles([], { gone: "reference" })).toEqual({ gone: "reference" });
  });

  it("produces roles assignImageRoles then turns into real inputs", () => {
    const roles = autoAssignImageRoles([img("a", "image-gen"), img("b"), img("c")], {});
    const assigned = assignImageRoles([img("a", "image-gen"), img("b"), img("c")], roles);
    expect(assigned.startFrameUrl).toContain("a.jpg");
    expect(assigned.referenceUrls).toHaveLength(2);
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
