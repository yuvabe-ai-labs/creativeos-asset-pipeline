import { describe, it, expect } from "vitest";
import { approveKeyForNodeType, reviewableNodeTypes } from "./node-area";
import { testAccess } from "./test-fixtures";

describe("approval area per node type", () => {
  it("maps media nodes to their area's approve", () => {
    expect(approveKeyForNodeType("image-gen")).toBe("image_generation.approve");
    expect(approveKeyForNodeType("composite")).toBe("image_generation.approve");
    expect(approveKeyForNodeType("video-gen")).toBe("video_generation.approve");
    expect(approveKeyForNodeType("dubbing")).toBe("audio.approve");
  });

  it("returns null for nodes that are not approved", () => {
    expect(approveKeyForNodeType("prompt")).toBeNull();
    expect(approveKeyForNodeType("unknown")).toBeNull();
  });

  it("lists the review-queue node types a person can approve somewhere", () => {
    expect(reviewableNodeTypes(testAccess({ keys: ["image_generation.approve"] }))).toEqual(["image-gen"]);
    expect(reviewableNodeTypes(testAccess({ keys: [] }))).toEqual([]);
  });
});
