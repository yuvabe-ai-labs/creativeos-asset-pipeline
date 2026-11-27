import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProfileCredits } from "../profile-credits";

describe("ProfileCredits", () => {
  it("shows 0 and an empty bar when a paid pack pushes usage below zero", () => {
    const html = renderToStaticMarkup(<ProfileCredits used={-800} monthlyCreditLimit={5000} />);
    expect(html).toContain("width:0%");
    expect(html).not.toContain("800 ");
    expect(html).toContain(">0<");
  });

  it("fills the bar in proportion to usage", () => {
    expect(renderToStaticMarkup(<ProfileCredits used={2500} monthlyCreditLimit={5000} />)).toContain("width:50%");
  });
});
