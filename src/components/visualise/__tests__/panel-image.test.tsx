import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PanelImage } from "../panel-image";

// YUV-422 — a new take waits under a skeleton, invisible, until its file has loaded; it never
// shows blank or the previous take in between. (No DOM here: this reads the first render.)
describe("PanelImage", () => {
  it("first renders a skeleton with the image hidden until it loads", () => {
    const html = renderToStaticMarkup(<PanelImage src="https://x/new.png" />);
    expect(html).toContain('data-slot="skeleton"');
    expect(html).toMatch(/<img[^>]*src="https:\/\/x\/new.png"[^>]*class="[^"]*opacity-0/);
  });

  it("keeps a caller's dimming for when it is shown, without overriding the hidden state", () => {
    const html = renderToStaticMarkup(<PanelImage src="https://x/new.png" className="opacity-60" />);
    expect(html).toMatch(/class="[^"]*opacity-0[^"]*"/);
    expect(html).not.toMatch(/class="[^"]*opacity-60[^"]*"/);
  });
});
