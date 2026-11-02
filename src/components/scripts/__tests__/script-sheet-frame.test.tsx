// src/components/scripts/__tests__/script-sheet-frame.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ScriptSheetFrame } from "../script-sheet-frame";

describe("ScriptSheetFrame (D465)", () => {
  it("is one column when there is no Comments column", () => {
    const html = renderToStaticMarkup(<ScriptSheetFrame><p>summary</p><p>sheet</p></ScriptSheetFrame>);
    expect(html).toContain("<p>summary</p><p>sheet</p>");
    expect(html).not.toContain("xl:grid-cols");
  });

  it("adds the Comments column at the right from xl, after the board", () => {
    const html = renderToStaticMarkup(<ScriptSheetFrame column={<aside>column</aside>}><p>board</p></ScriptSheetFrame>);
    expect(html).toContain("xl:grid-cols-[minmax(0,1fr)_20rem]");
    expect(html.indexOf("<aside>column</aside>")).toBeGreaterThan(html.indexOf("<p>board</p>"));
  });
});
