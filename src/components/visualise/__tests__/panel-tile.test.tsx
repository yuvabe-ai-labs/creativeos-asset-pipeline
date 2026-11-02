import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PanelView } from "@/lib/scripts/visualise/state";
import { makeTake, reel01Doc } from "@/lib/scripts/visualise/__tests__/fixtures";
import { PanelTile } from "../panel-tile";

const doc = reel01Doc();
const shot = doc.shots[0];
const view = (over: Partial<PanelView> = {}): PanelView => ({
  status: "ready", pick: makeTake(), takes: [makeTake()], failure: null, staleBecause: [], waitingFor: [], canGenerate: true, ...over,
});
const render = (v: PanelView, label = "S1") => renderToStaticMarkup(
  <PanelTile shot={shot} doc={doc} label={label} time="0–3s" view={v} aspect="9:16" credits={40}
    onDraw={() => {}} onRedraw={() => {}} onOpen={() => {}} />,
);

describe("PanelTile (D465: the panel carries its shot)", () => {
  it("puts the shot under a drawn panel and Redraw on the frame, with no button below", () => {
    const html = render(view());
    expect(html).toContain(shot.visual);
    expect(html).toContain(`“${shot.vo}”`);
    expect(html).toContain("Redraw");
    expect(html).not.toContain(">Generate");
  });

  it("keeps Redraw visible where there is no hover", () => {
    const html = render(view());
    expect(html).toContain("[@media(hover:hover)]:opacity-0");
    expect(html).toMatch(/class="[^"]*opacity-100[^"]*\[@media\(hover:hover\)\]:opacity-0/);
  });

  it("offers Generate on a shot with no panel, and the empty frame still opens", () => {
    const html = render(view({ status: "not_yet", pick: null, takes: [] }), "S8");
    expect(html).toContain("Generate");
    expect(html).toContain('aria-label="Open S8"');
    expect(html).toContain("Not drawn yet");
    expect(html).not.toContain("Redraw");
  });

  it("anchors the tile to its shot", () => {
    expect(render(view())).toContain(`id="shot-${shot.id}"`);
  });
});
