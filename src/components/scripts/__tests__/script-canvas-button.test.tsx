import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/actions/canvases", () => ({ createCanvasAction: vi.fn(), createCanvasFromScriptAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { ScriptCanvasButton } from "../script-canvas-button";

const props = { clientId: "c1", clientSlug: "acme", script: { id: "s1", title: "Reel 12 · Golu starts today" } };

describe("ScriptCanvasButton", () => {
  it("offers Create canvas while the script has no canvas", () => {
    const html = renderToStaticMarkup(<ScriptCanvasButton {...props} canvas={null} />);
    expect(html).toContain("Create canvas");
    expect(html).not.toContain("Open canvas");
  });
  it("offers Open canvas, linking to it, once the script has one", () => {
    const html = renderToStaticMarkup(<ScriptCanvasButton {...props} canvas={{ slug: "reel-12" }} />);
    expect(html).toContain("Open canvas");
    expect(html).toContain('href="/clients/acme/canvases/reel-12"');
    expect(html).not.toContain("Create canvas");
  });
});
