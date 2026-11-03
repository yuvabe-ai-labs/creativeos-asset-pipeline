import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { reel01Doc } from "@/lib/scripts/visualise/__tests__/fixtures";
import { PanelShotDetails } from "../panel-shot-details";

const shot = { ...reel01Doc().shots[0], onScreenText: "Saturday idli!" };

describe("PanelShotDetails (D465: the whole shot in the panel view)", () => {
  it("lists the on-screen text and who is on screen", () => {
    const html = renderToStaticMarkup(<PanelShotDetails shot={shot} castNames={["Meenakshi", "Raghu"]} />);
    expect(html).toContain(shot.visual);
    expect(html).toContain("Saturday idli!");
    expect(html).toContain("Meenakshi, Raghu");
  });

  it("says nobody for a B-roll shot and leaves out empty on-screen text", () => {
    const html = renderToStaticMarkup(<PanelShotDetails shot={{ ...shot, onScreenText: "" }} castNames={[]} />);
    expect(html).toContain("Nobody (B-roll)");
    expect(html).not.toContain("On-screen text");
  });
});
