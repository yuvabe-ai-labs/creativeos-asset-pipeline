// src/components/script-review/__tests__/comments-column.test.tsx
import { describe, it, expect } from "vitest";
import type { Part } from "@/lib/script-review/types";
import { comment } from "@/lib/script-review/__tests__/fixtures";
import { CommentsColumn } from "../comments-column";
import { renderInSurface, testSurface } from "./surface";

const S4: Part = { kind: "shot", shotId: "s04" };

describe("CommentsColumn (review board)", () => {
  it("opens the composer in place for a part a marker opened, before it has a thread (Review Focus 1)", () => {
    const html = renderInSurface(
      testSurface({ commentable: [S4], focus: { part: S4, compose: true, nonce: 1 } }),
      <CommentsColumn />,
    );
    expect(html).toContain('placeholder="Comment on S4"');
    expect(html).toContain("data-column-part");
  });

  it("only scrolls to a part when the marker was its count, not the comment action", () => {
    const html = renderInSurface(
      testSurface({ comments: [comment({ part: S4 })], commentable: [S4], focus: { part: S4, compose: false, nonce: 1 } }),
      <CommentsColumn />,
    );
    expect(html).not.toContain('placeholder="Comment on S4"');
    expect(html).toContain("ring-client/30");
  });

  it("opens no composer once comments are closed", () => {
    const html = renderInSurface(
      testSurface({ commentable: [], focus: { part: S4, compose: true, nonce: 1 } }),
      <CommentsColumn />,
    );
    expect(html).not.toContain("<textarea");
  });

  it("says a part is gone from the live script in the team's view", () => {
    const html = renderInSurface(
      testSurface({ mode: "team", comments: [comment({ part: { kind: "cast", castId: "gone" } })] }),
      <CommentsColumn />,
    );
    expect(html).toContain("No longer in the script");
  });
});
