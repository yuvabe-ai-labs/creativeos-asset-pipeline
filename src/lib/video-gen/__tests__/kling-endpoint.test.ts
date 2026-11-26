import { describe, it, expect } from "vitest";
import { klingEndpoint } from "@/lib/video-gen/providers/kling";

describe("klingEndpoint", () => {
  it("takes reference support from the catalog's cap, and the path from the model", () => {
    expect(klingEndpoint("kling-3-0", "kling-3.0", 0)).toMatchObject({
      endpointPath: "/image-to-video/kling-3.0", supportsReferences: false, requiresStartFrame: true,
    });
    expect(klingEndpoint("kling-3-0-omni", "kling-3.0-omni", 5)).toMatchObject({
      endpointPath: "/omni-video/kling-3.0-omni", supportsReferences: true, requiresStartFrame: false,
    });
    // An admin who sets the cap to 0 turns references off without a code change.
    expect(klingEndpoint("kling-o1", "kling-o1", 0)).toMatchObject({ supportsReferences: false, requiresStartFrame: true });
  });
});
