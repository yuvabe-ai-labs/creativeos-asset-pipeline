import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PanelHoverLine } from "../panel-hover-line";

describe("PanelHoverLine (readable over any panel)", () => {
  it("is white, medium-weight text with a shadow, on a fixed dark scrim that does not flip with the theme", () => {
    const html = renderToStaticMarkup(<PanelHoverLine text="She tilts the bowl towards camera." />);
    expect(html).toContain("text-white");
    expect(html).toContain("font-medium");
    expect(html).toContain("from-black/85");
    expect(html).not.toContain("text-background");
  });
});
