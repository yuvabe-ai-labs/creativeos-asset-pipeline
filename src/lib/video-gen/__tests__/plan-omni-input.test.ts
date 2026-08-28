import { describe, it, expect } from "vitest";
import { planOmniInput } from "../plan-omni-input";

const START = "https://x/start.jpg";
const END = "https://x/end.jpg";
const R1 = "https://x/r1.jpg";
const R2 = "https://x/r2.jpg";

describe("planOmniInput", () => {
  it("orders uploads first frame, last frame, then references", () => {
    const plan = planOmniInput({ startFrameUrl: START, endFrameUrl: END, referenceUrls: [R1, R2] });
    expect(plan.uploads).toEqual([
      { url: START, role: "first_frame" },
      { url: END, role: "last_frame" },
      { url: R1, role: "reference" },
      { url: R2, role: "reference" },
    ]);
  });

  // The reason this module exists. @ImageN counts the entire upload array from 1;
  // <IMAGE_REF_N> counts ONLY the references, from 0. Both appear in this one line.
  it("emits @ImageN 1-based over all uploads and <IMAGE_REF_N> 0-based over references", () => {
    const plan = planOmniInput({ startFrameUrl: START, endFrameUrl: END, referenceUrls: [R1, R2] });
    expect(plan.header).toBe(
      "[# Sources <FIRST_FRAME>@Image1 <LAST_FRAME>@Image2] " +
      "[# References <IMAGE_REF_0>@Image3 <IMAGE_REF_1>@Image4]",
    );
  });

  // With no frames the first reference is @Image1 but still <IMAGE_REF_0>.
  it("keeps the bases independent when there are no frames", () => {
    const plan = planOmniInput({ startFrameUrl: undefined, endFrameUrl: undefined, referenceUrls: [R1, R2] });
    expect(plan.header).toBe("[# References <IMAGE_REF_0>@Image1 <IMAGE_REF_1>@Image2]");
    expect(plan.task).toBe("reference_to_video");
  });

  it("omits the References segment entirely when there are no references", () => {
    const plan = planOmniInput({ startFrameUrl: START, endFrameUrl: undefined, referenceUrls: [] });
    expect(plan.header).toBe("[# Sources <FIRST_FRAME>@Image1]");
    expect(plan.task).toBe("image_to_video");
  });

  // The multishot path: no images at all, the shot description is the whole input.
  it("returns empty header and guidance with no images at all", () => {
    const plan = planOmniInput({ startFrameUrl: undefined, endFrameUrl: undefined, referenceUrls: [] });
    expect(plan).toEqual({ uploads: [], header: "", guidance: "", task: "text_to_video" });
  });

  it("names each frame by its upload number in the guidance", () => {
    const plan = planOmniInput({ startFrameUrl: START, endFrameUrl: END, referenceUrls: [R1] });
    expect(plan.guidance).toBe(
      "Use Image1 as the starting frame. Use Image2 as the final frame. " +
      "Use the given images as references for video generation. " +
      "The images should not be used as literal initial frames.",
    );
  });

  // A first frame wins the task hint: the model animates THAT image and the references
  // only steer it.
  it("prefers image_to_video when a first frame and references are both present", () => {
    const plan = planOmniInput({ startFrameUrl: START, endFrameUrl: undefined, referenceUrls: [R1] });
    expect(plan.task).toBe("image_to_video");
  });
});
