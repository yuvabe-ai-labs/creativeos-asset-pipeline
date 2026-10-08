// src/components/scripts/__tests__/script-board-frame.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ScriptBoardFrame } from "../script-board-frame";

describe("ScriptBoardFrame", () => {
  it("is spec 3's two panes when there is no column (Review Focus 4)", () => {
    const html = renderToStaticMarkup(<ScriptBoardFrame script={<p>script</p>} visuals={<p>visuals</p>} />);
    expect(html).toContain('aria-label="Visuals"');
    expect(html).not.toContain("xl:grid-cols");
  });

  it("adds the Comments column at the right from xl", () => {
    const html = renderToStaticMarkup(<ScriptBoardFrame script={<p>s</p>} visuals={<p>v</p>} column={<aside>column</aside>} />);
    expect(html).toContain("xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_20rem]");
    expect(html).toContain("<aside>column</aside>");
  });
});
