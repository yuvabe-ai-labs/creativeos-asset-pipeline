import { describe, it, expect } from "vitest";
import { assignImageRoles } from "../assign-image-roles";

const A = { nodeId: "a", url: "https://x/a.jpg" };
const B = { nodeId: "b", url: "https://x/b.jpg" };
const C = { nodeId: "c", url: "https://x/c.jpg" };

describe("assignImageRoles", () => {
  // The defect: the route defaulted every unassigned upstream image to "reference", while the
  // focus view shows no role chip for it and counts it in nothing. A node with one image marked
  // Start plus a product still feeding the video-prompt reached Veo as start frame + 1 reference,
  // which trips `refs-lock-duration-disable-frames` — "Reference images selected → duration
  // locked to 8s, start/end frames unavailable" on a shot the operator only gave a start frame.
  it("ignores an image with no assigned role instead of making it a reference", () => {
    const out = assignImageRoles([A, B], { a: "start_frame" });
    expect(out.startFrameUrl).toBe(A.url);
    expect(out.referenceUrls).toEqual([]);
    expect(out.endFrameUrl).toBeUndefined();
  });

  it("sends nothing when no role is assigned at all", () => {
    expect(assignImageRoles([A, B], {})).toEqual({
      startFrameUrl: undefined,
      endFrameUrl: undefined,
      referenceUrls: [],
    });
  });

  it("routes each assigned role to its own slot", () => {
    const out = assignImageRoles([A, B, C], {
      a: "start_frame",
      b: "end_frame",
      c: "reference",
    });
    expect(out).toEqual({
      startFrameUrl: A.url,
      endFrameUrl: B.url,
      referenceUrls: [C.url],
    });
  });

  // Only one image can be the first frame; a second start_frame assignment is surplus, and
  // silently promoting it to a reference would resurrect the same divergence this fixes.
  it("keeps the first start/end frame and drops surplus assignments of that role", () => {
    const out = assignImageRoles([A, B], { a: "start_frame", b: "start_frame" });
    expect(out.startFrameUrl).toBe(A.url);
    expect(out.referenceUrls).toEqual([]);
  });

  it("preserves reference order", () => {
    const out = assignImageRoles([A, B, C], {
      a: "reference",
      b: "start_frame",
      c: "reference",
    });
    expect(out.referenceUrls).toEqual([A.url, C.url]);
  });

  // Roles outlive the edge that produced them (the focus view prunes on read for the same
  // reason); an id with no image in this batch must not invent one.
  it("ignores a role whose image is not connected", () => {
    const out = assignImageRoles([A], { a: "start_frame", gone: "reference" });
    expect(out.referenceUrls).toEqual([]);
  });
});
