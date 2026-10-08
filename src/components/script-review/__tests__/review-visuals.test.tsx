// src/components/script-review/__tests__/review-visuals.test.tsx
import { describe, it, expect } from "vitest";
import { avatarSnapshot, reelDoc } from "@/lib/script-review/__tests__/fixtures";
import type { Part } from "@/lib/script-review/types";
import { ReviewCastCard } from "../review-cast-card";
import { ReviewStoryboard } from "../review-storyboard";
import { renderInSurface, testSurface } from "./surface";

const meenakshi = reelDoc().cast[0];
const view = (v: "front" | "left"): Part => ({ kind: "view", castId: "meenakshi", view: v });

describe("ReviewCastCard", () => {
  it("shows the four-view sheet on a share with avatars, with a comment action only on views that have an image (Review Focus 2)", () => {
    const html = renderInSurface(
      testSurface({ commentable: [{ kind: "cast", castId: "meenakshi" }, view("front")] }),
      <ReviewCastCard member={meenakshi} avatar={avatarSnapshot({ front: "https://cdn/f.png" })} showAvatar />,
    );
    expect(html).toContain("Meenakshi: four views");
    expect(html).toContain('aria-label="Comment on Meenakshi · Front view"');
    expect(html).not.toContain("Left view");
    expect(html).toContain('aria-label="Comment on Meenakshi"');
    expect(html).toContain('id="cast-meenakshi"');
  });

  it("shows the person without a sheet on a script-only share", () => {
    const html = renderInSurface(testSurface(), <ReviewCastCard member={meenakshi} showAvatar={false} />);
    expect(html).toContain(meenakshi.description);
    expect(html).not.toContain("four views");
    expect(html).not.toContain("No avatar in this version");
  });

  it("says so when a share with avatars left this person's avatar out", () => {
    const html = renderInSurface(testSurface(), <ReviewCastCard member={meenakshi} showAvatar />);
    expect(html).toContain("No avatar in this version");
  });
});

describe("ReviewStoryboard", () => {
  it("draws each shot's frozen panel with no Generate button, and an empty frame where there is none (Review Focus 3)", () => {
    const html = renderInSurface(
      testSurface({ commentable: [{ kind: "panel", shotId: "s01" }] }),
      <ReviewStoryboard doc={reelDoc()} panels={{ s01: { takeId: "t1", url: "https://cdn/s01.png" } }} />,
    );
    expect(html).toContain("Storyboard");
    expect(html).toContain('aria-label="Open the S1 panel"');
    expect(html).toContain('aria-label="Comment on S1 panel"');
    expect(html).toContain("No panel");
    expect(html).not.toContain("Generate");
    expect(html).not.toContain("Comment on S2 panel");
  });
});
