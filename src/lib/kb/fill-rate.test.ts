import { describe, expect, it } from "vitest";
import { computeReadyStatus } from "./fill-rate";
import type { TraceableBrandKB } from "./schema";

type Status = "needs_review" | "approved";
const section = (status: Status) => ({ a: { value: "x", status } });

function kb(documents: Status, imageAnalysis: Status): TraceableBrandKB {
  return {
    brand_profile: section(documents),
    visual_identity: section(documents),
    image_analysis: section(imageAnalysis),
    target_audience: section(documents),
    creative_direction: { image: section(documents), video: section(documents) },
    compliance: section(documents),
  } as unknown as TraceableBrandKB;
}

describe("computeReadyStatus", () => {
  it("is ready once the document sections are reviewed, even with Image Analysis unreviewed (D423)", () => {
    expect(computeReadyStatus(kb("approved", "needs_review"))).toBe(true);
  });

  it("is not ready while a document section needs review", () => {
    expect(computeReadyStatus(kb("needs_review", "approved"))).toBe(false);
  });
});
