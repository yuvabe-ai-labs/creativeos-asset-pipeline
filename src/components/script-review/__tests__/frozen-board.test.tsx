// src/components/script-review/__tests__/frozen-board.test.tsx
import { describe, it, expect } from "vitest";
import { avatarSnapshot, content } from "@/lib/script-review/__tests__/fixtures";
import { FrozenBoard } from "../frozen-board";
import { renderInSurface, testSurface } from "./surface";

const render = (scope: "script" | "avatars" | "panels") =>
  renderInSurface(
    testSurface({ commentable: [{ kind: "context" }, { kind: "shot", shotId: "s01" }, { kind: "panel", shotId: "s01" }] }),
    <FrozenBoard
      version={content({ scope, visuals: { avatars: { meenakshi: avatarSnapshot() }, panels: { s01: { takeId: "t", url: "https://cdn/p.png" } } } })}
      stage="in_review"
      column={<aside>the column</aside>}
    />,
  );

describe("FrozenBoard (review board, 4.14; D465: the idea, the cast and the storyboard only)", () => {
  it("draws a script-only share as one column: the summary with markers, the cast, the shots as text tiles", () => {
    const html = render("script");
    expect(html).toContain('id="script-context"');
    expect(html).toContain('aria-label="Comment on S1"');
    expect(html).toContain('aria-label="Comment on Context"');
    expect(html).toContain('aria-label="Cast"');
    expect(html).not.toContain("four views");
    expect(html).toContain('aria-label="Storyboard"');
    expect(html).not.toContain("aspect-ratio");
    expect(html).toContain("<aside>the column</aside>");
  });

  it("never shows the client the team's notes, locations or products", () => {
    const html = render("panels");
    for (const s of ["Setting and camera", "Watch-outs", "Products", "Locations", "Location:"]) expect(html).not.toContain(s);
  });

  it("adds the four-view sheets on a share with avatars", () => {
    const html = render("avatars");
    expect(html).toContain("Meenakshi: four views");
    expect(html).not.toContain("https://cdn/p.png");
  });

  it("adds the panels on a full share, each tile under its shot anchor once", () => {
    const html = render("panels");
    expect(html).toContain("https://cdn/p.png");
    // One comment action per tile, for the shot and its panel together (D465).
    expect(html).toContain('aria-label="Comment on S1"');
    expect(html).not.toContain('aria-label="Comment on S1 panel"');
    expect(html.match(/id="shot-s01"/g)).toHaveLength(1);
  });
});
