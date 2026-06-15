import { describe, it, expect } from "vitest";
import { mapRecentCanvas, type RawRecentCanvasRow } from "./recent-canvas";

const base: RawRecentCanvasRow = {
  id: "cv1",
  client_id: "cl1",
  slug: "hero-reel",
  name: "Hero reel",
  viewport: { x: 0, y: 0, zoom: 1 },
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-14T00:00:00Z",
  clients: { slug: "acme", name: "Acme", logo_url: "http://logo/acme.png" },
};

describe("mapRecentCanvas", () => {
  it("flattens the embedded client relation onto the canvas", () => {
    const out = mapRecentCanvas(base);
    expect(out.client_slug).toBe("acme");
    expect(out.client_name).toBe("Acme");
    expect(out.client_logo_url).toBe("http://logo/acme.png");
  });

  it("preserves the canvas fields and drops the nested object", () => {
    const out = mapRecentCanvas(base);
    expect(out.slug).toBe("hero-reel");
    expect(out.updated_at).toBe("2026-06-14T00:00:00Z");
    expect("clients" in out).toBe(false);
  });

  it("tolerates a missing/null client relation", () => {
    const out = mapRecentCanvas({ ...base, clients: null });
    expect(out.client_slug).toBe("");
    expect(out.client_name).toBe("");
    expect(out.client_logo_url).toBeNull();
  });

  it("accepts the relation as a single-element array (PostgREST shape)", () => {
    const out = mapRecentCanvas({
      ...base,
      clients: [{ slug: "globex", name: "Globex", logo_url: null }],
    });
    expect(out.client_slug).toBe("globex");
    expect(out.client_logo_url).toBeNull();
  });
});
