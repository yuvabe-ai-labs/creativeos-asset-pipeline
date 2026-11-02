import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PanelTileCaption } from "../panel-tile-caption";

describe("PanelTileCaption (D465: the shot under its frame)", () => {
  it("writes the shot under the frame in storyboard order", () => {
    const html = renderToStaticMarkup(
      <PanelTileCaption label="S1" beat="HOOK" time="0–3s" visual="Shobha lifts the lid." vo="Saturday means idli." />,
    );
    const at = (s: string) => html.indexOf(s);
    expect(at("S1")).toBeGreaterThan(-1);
    expect(at("HOOK")).toBeGreaterThan(at("S1"));
    expect(at("0–3s")).toBeGreaterThan(at("HOOK"));
    expect(at("Shobha lifts the lid.")).toBeGreaterThan(at("0–3s"));
    expect(at("“Saturday means idli.”")).toBeGreaterThan(at("Shobha lifts the lid."));
  });

  it("leaves out an empty spoken line and an empty beat", () => {
    const html = renderToStaticMarkup(<PanelTileCaption label="S4" beat="" time="9–12s" visual="The hall." vo="" />);
    expect(html).not.toContain("“");
    expect(html).not.toContain("text-eyebrow");
  });
});
