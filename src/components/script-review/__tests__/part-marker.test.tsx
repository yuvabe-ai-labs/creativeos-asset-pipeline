// src/components/script-review/__tests__/part-marker.test.tsx
import { describe, it, expect } from "vitest";
import type { Part } from "@/lib/script-review/types";
import { comment } from "@/lib/script-review/__tests__/fixtures";
import { PartMarker } from "../part-marker";
import { renderInSurface, testSurface } from "./surface";

const S4: Part = { kind: "shot", shotId: "s04" };
const FRONT: Part = { kind: "view", castId: "meenakshi", view: "front" };

describe("PartMarker (review board)", () => {
  it("counts a part's threads in the client-feedback amber and marks the part", () => {
    const html = renderInSurface(
      testSurface({ comments: [comment({ part: S4 }), comment({ id: "c2", part: S4 })], commentable: [S4] }),
      <PartMarker part={S4} />,
    );
    expect(html).toContain("data-part-commented");
    expect(html).toContain("bg-client/15");
    expect(html).toContain('aria-label="2 comments on S4"');
    expect(html).toContain('aria-label="Comment on S4"');
  });

  it("offers only the comment action on a part with no thread", () => {
    const html = renderInSurface(testSurface({ commentable: [S4] }), <PartMarker part={S4} />);
    expect(html).not.toContain("data-part-commented");
    expect(html).toContain('aria-label="Comment on S4"');
  });

  it("names a view in full", () => {
    const html = renderInSurface(testSurface({ commentable: [FRONT] }), <PartMarker part={FRONT} />);
    expect(html).toContain('aria-label="Comment on Meenakshi · Front view"');
  });

  it("renders nothing where no one can comment and nothing was said (the team; after approval)", () => {
    expect(renderInSurface(testSurface({ mode: "team" }), <PartMarker part={S4} />)).toBe("");
  });

  it("never draws the threads themselves", () => {
    const html = renderInSurface(testSurface({ comments: [comment({ part: S4, body: "Make it seven steps" })] }), <PartMarker part={S4} />);
    expect(html).not.toContain("Make it seven steps");
  });
});
