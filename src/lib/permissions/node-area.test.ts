import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { approveKeyForNodeType, reviewableNodeTypes } from "./node-area";
import { testAccess } from "./test-fixtures";

// Every component that approves a version, and the node types it is shown for. A new component
// calling setVersionApprovalAction fails the scan below until it is listed here, and every type
// listed must have an approve key, or approving it is refused for everyone.
const APPROVING_COMPONENTS: Record<string, readonly string[]> = {
  "components/nodes/image-gen-focus-view.tsx": ["image-gen"],
  "components/nodes/video-gen-focus-view.tsx": ["video-gen"],
  "components/nodes/prompt-focus-view.tsx": ["prompt"],
  "components/nodes/video-prompt-focus-view.tsx": ["video-prompt"],
  "components/nodes/multishot-prompt-focus-view.tsx": ["multishot-prompt"],
};

const SRC = join(process.cwd(), "src");
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

describe("approval area per node type", () => {
  it("maps media nodes to their area's approve", () => {
    expect(approveKeyForNodeType("image-gen")).toBe("image_generation.approve");
    expect(approveKeyForNodeType("composite")).toBe("image_generation.approve");
    expect(approveKeyForNodeType("video-gen")).toBe("video_generation.approve");
    expect(approveKeyForNodeType("dubbing")).toBe("audio.approve");
  });

  it("maps prompt nodes to the area they feed", () => {
    expect(approveKeyForNodeType("prompt")).toBe("image_generation.approve");
    expect(approveKeyForNodeType("video-prompt")).toBe("video_generation.approve");
    expect(approveKeyForNodeType("multishot-prompt")).toBe("video_generation.approve");
  });

  it("returns null for nodes that are not approved", () => {
    expect(approveKeyForNodeType("text")).toBeNull();
    expect(approveKeyForNodeType("unknown")).toBeNull();
  });

  it("lists every component that approves a version", () => {
    const callers = sourceFiles(join(SRC, "components"))
      .filter((f) => /\bsetVersionApprovalAction\(/.test(readFileSync(f, "utf8")))
      .map((f) => relative(SRC, f).split(sep).join("/"))
      .sort();
    expect(callers).toEqual(Object.keys(APPROVING_COMPONENTS).sort());
  });

  for (const [component, types] of Object.entries(APPROVING_COMPONENTS)) {
    for (const type of types) {
      it(`${type} (approved in ${component}) has an approve key`, () => {
        expect(approveKeyForNodeType(type)).not.toBeNull();
      });
    }
  }

  it("lists the review-queue node types a person can approve somewhere", () => {
    expect(reviewableNodeTypes(testAccess({ keys: ["image_generation.approve"] }))).toEqual(["image-gen"]);
    expect(reviewableNodeTypes(testAccess({ keys: [] }))).toEqual([]);
  });
});
