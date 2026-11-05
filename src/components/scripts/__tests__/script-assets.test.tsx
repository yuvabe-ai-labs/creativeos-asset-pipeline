import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ScriptView } from "../script-view";
import { ScriptAssetsProvider } from "../script-assets-context";
import { reelDoc } from "@/lib/script-review/__tests__/fixtures";
import type { ScriptDoc } from "@/lib/scripts/schema";

// D446 — the script page shows a script's products, locations and each shot's picks; it can change
// them only where an assets context is given (Generate, Visualise), never on the review page.

function withAssets(): ScriptDoc {
  const doc = reelDoc();
  return {
    ...doc,
    products: [
      { id: "pouch", name: "Jackfruit365 pouch", images: [{ url: "https://x/pouch.png", source: "upload" }] },
      { id: "jar", name: "Jar", images: [] },
    ],
    locations: [{ id: "kitchen", name: "Home kitchen", description: "Teal walls.", image: null }],
    shots: doc.shots.map((s, i) => (i === 0 ? { ...s, products: ["pouch"], location: "kitchen" } : s)),
  };
}

const view = (doc: ScriptDoc) => <ScriptView script={{ doc, stage: "visualise" }} avatarFaces={{}} />;

describe("products and locations on the script page", () => {
  it("shows them read-only, with what still needs a picture", () => {
    const html = renderToStaticMarkup(view(withAssets()));
    expect(html).toContain("Jackfruit365 pouch");
    expect(html).toContain("Home kitchen");
    expect(html).toContain("Needs a picture");
    expect(html).toContain("Products: Jackfruit365 pouch · Location: Home kitchen");
    expect(html).not.toContain("Add a product");
    expect(html).not.toContain('aria-label="Products in this shot"');
  });

  it("leaves the section out of a read-only script that has none", () => {
    const html = renderToStaticMarkup(view(reelDoc()));
    expect(html).not.toContain('aria-label="Products"');
    expect(html).not.toContain("Location:");
  });

  it("offers adding, pictures and per-shot pickers where the page can edit", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <ScriptAssetsProvider clientId="c1" scriptId="s1">{view(withAssets())}</ScriptAssetsProvider>
      </QueryClientProvider>,
    );
    expect(html).toContain("Add a product");
    expect(html).toContain("Add a location");
    expect(html).toContain("Add angles");
    expect(html).toContain("Add pictures");
    expect(html).toContain("Generate");
    expect(html).toContain('aria-label="Products in this shot"');
    expect(html).toContain('aria-label="Location of this shot"');
  });
});
