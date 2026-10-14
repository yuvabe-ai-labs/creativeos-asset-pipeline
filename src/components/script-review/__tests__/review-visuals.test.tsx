// src/components/script-review/__tests__/review-visuals.test.tsx
import { describe, it, expect } from "vitest";
import { avatarSnapshot, comment, reelDoc } from "@/lib/script-review/__tests__/fixtures";
import type { Part } from "@/lib/script-review/types";
import { ReviewCastCard } from "../review-cast-card";
import { ReviewStoryboard } from "../review-storyboard";
import { renderInSurface, testSurface } from "./surface";

const meenakshi = reelDoc().cast[0];
const CAST: Part = { kind: "cast", castId: "meenakshi" };

describe("ReviewCastCard", () => {
  it("shows the four-view sheet on a share with avatars, with one comment box for the whole avatar and none per view (D359)", () => {
    const html = renderInSurface(
      testSurface({ commentable: [CAST] }),
      <ReviewCastCard member={meenakshi} avatar={avatarSnapshot({ front: "https://cdn/f.png" })} showAvatar />,
    );
    expect(html).toContain("Meenakshi: four views");
    expect(html).not.toMatch(/aria-label="Comment on [^"]*view"/);
    expect(html.match(/<textarea/g)).toHaveLength(1);
    expect(html).toContain('placeholder="Comment on Meenakshi&#x27;s avatar"');
    // The box is the card's one way to comment: the header drops its comment button.
    expect(html).not.toContain('aria-label="Comment on Meenakshi"');
    expect(html).toContain('id="cast-meenakshi"');
    // Card draws its outline with a ring (no border width), so the commented edge must be a ring.
    expect(html).toContain("has-[[data-part-commented]]:ring-client/40");
  });

  it("keeps the person's comment count in the header beside the box", () => {
    const html = renderInSurface(
      testSurface({ comments: [comment({ part: CAST })], commentable: [CAST] }),
      <ReviewCastCard member={meenakshi} avatar={avatarSnapshot({ front: "https://cdn/f.png" })} showAvatar />,
    );
    expect(html).toContain('aria-label="1 comment on Meenakshi"');
    expect(html).not.toContain('aria-label="Comment on Meenakshi"');
  });

  it("has no comment box where the client cannot comment: the team's view, or after approval", () => {
    const html = renderInSurface(
      testSurface({ mode: "team" }),
      <ReviewCastCard member={meenakshi} avatar={avatarSnapshot({ front: "https://cdn/f.png" })} showAvatar />,
    );
    expect(html).toContain("Meenakshi: four views");
    expect(html).not.toContain("<textarea");
  });

  it("shows the person without a sheet on a script-only share, commented on from the header (no box without an avatar)", () => {
    const html = renderInSurface(testSurface({ commentable: [CAST] }), <ReviewCastCard member={meenakshi} showAvatar={false} />);
    expect(html).toContain(meenakshi.description);
    expect(html).not.toContain("four views");
    expect(html).not.toContain("<textarea");
    expect(html).toContain('aria-label="Comment on Meenakshi"');
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
