import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { PanelHoverLine } from "../panel-hover-line";

describe("PanelHoverLine (readable over any panel, through tokens)", () => {
  it("uses the scrim tokens, never raw colours", () => {
    const html = renderToStaticMarkup(<PanelHoverLine text="She tilts the bowl towards camera." />);
    expect(html).toContain("from-scrim/85");
    expect(html).toContain("scrim-text");
    expect(html).not.toMatch(/black|white|rgb\(|#[0-9a-f]{3,6}/i);
  });

  it("the tokens are defined once, so dark mode keeps text over imagery white on dark", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain("--color-scrim: var(--scrim);");
    expect(css).toContain("--scrim: var(--neutral-900);");
    expect(css).toContain("--on-scrim: var(--neutral-0);");
    expect(css).toMatch(/\.scrim-text\s*\{/);
  });
});
