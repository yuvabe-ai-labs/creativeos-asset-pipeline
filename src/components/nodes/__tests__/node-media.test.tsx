import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NodeMedia } from "../node-media";
import { nodeMediaBox } from "@/lib/canvas/media-fit";

describe("NodeMedia", () => {
  it("sizes the box to the media and never crops", () => {
    const html = renderToStaticMarkup(
      <NodeMedia kind="image" src="https://x/a.png" alt="a" box={nodeMediaBox(9 / 16, "output")} onMeasured={vi.fn()} />,
    );
    expect(html).toContain("width:281px");
    expect(html).toContain("height:500px");
    expect(html).toContain("object-contain");
    expect(html).not.toContain("object-cover");
  });
  it("shows a video as a metadata-only poster frame", () => {
    const html = renderToStaticMarkup(
      <NodeMedia kind="video" src="https://x/a.mp4" alt="a" box={nodeMediaBox(16 / 9, "output")} onMeasured={vi.fn()} />,
    );
    expect(html).toContain('src="https://x/a.mp4#t=0.1"');
    expect(html).toContain('preload="metadata"');
  });
  // D432 — a new output waits under a skeleton, hidden, until it can be drawn.
  it("first renders a skeleton with the media hidden until it loads", () => {
    for (const kind of ["image", "video"] as const) {
      const html = renderToStaticMarkup(
        <NodeMedia kind={kind} src="https://x/a" alt="a" box={nodeMediaBox(1, "output")} onMeasured={vi.fn()} />,
      );
      expect(html).toContain('data-slot="skeleton"');
      expect(html).toMatch(/<(img|video)[^>]*class="[^"]*opacity-0/);
    }
  });
});
