// src/components/script-review/__tests__/frozen-board.test.tsx
import { describe, it, expect } from "vitest";
import { avatarSnapshot, content } from "@/lib/script-review/__tests__/fixtures";
import { FrozenBoard } from "../frozen-board";
import { renderInSurface, testSurface } from "./surface";

const render = (scope: "script" | "avatars" | "panels") =>
  renderInSurface(
    testSurface({ commentable: [{ kind: "context" }, { kind: "shot", shotId: "s01" }] }),
    <FrozenBoard
      version={content({ scope, visuals: { avatars: { meenakshi: avatarSnapshot() }, panels: { s01: { takeId: "t", url: "https://cdn/p.png" } } } })}
      stage="in_review"
      column={<aside>the column</aside>}
    />,
  );

describe("FrozenBoard (review board, 4.14)", () => {
  it("draws a script-only share as the board: the script with markers, the cast, no sheets, no storyboard", () => {
    const html = render("script");
    expect(html).toContain('id="script-context"');
    expect(html).toContain("S14");
    expect(html).toContain('aria-label="Comment on S1"');
    expect(html).toContain('aria-label="Comment on Context"');
    expect(html).toContain('aria-label="Cast"');
    expect(html).not.toContain("four views");
    expect(html).not.toContain('aria-label="Storyboard"');
    expect(html).toContain("<aside>the column</aside>");
  });

  it("adds the four-view sheets on a share with avatars", () => {
    const html = render("avatars");
    expect(html).toContain("Meenakshi: four views");
    expect(html).not.toContain('aria-label="Storyboard"');
  });

  it("adds the Storyboard on a full share", () => {
    expect(render("panels")).toContain('aria-label="Storyboard"');
  });
});
