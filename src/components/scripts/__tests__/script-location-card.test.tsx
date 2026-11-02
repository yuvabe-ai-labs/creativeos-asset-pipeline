import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ScriptAssetsProvider } from "../script-assets-context";
import { ScriptLocationCard } from "../script-location-card";
import type { ScriptLocation } from "@/lib/scripts/schema";

const kitchen: ScriptLocation = {
  id: "kitchen", name: "Home kitchen", description: "Teal walls.", image: { url: "https://x/plate.png", source: "plate" },
};
const render = (large?: boolean) => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}>
    <ScriptAssetsProvider clientId="c1" scriptId="s1">
      <ul><ScriptLocationCard location={kitchen} large={large} /></ul>
    </ScriptAssetsProvider>
  </QueryClientProvider>,
);

describe("ScriptLocationCard (D465)", () => {
  it("redraws straight from the description, with no question first", () => {
    const html = render();
    expect(html).toContain("Redraw");
    expect(html).not.toContain("aria-haspopup");
  });

  it("shows the plate large, and lets the plate set the popup's width", () => {
    const html = render(true);
    expect(html).toMatch(/<img[^>]*src="https:\/\/x\/plate.png"[^>]*class="[^"]*h-\[60vh\][^"]*w-auto/);
    // The words take the plate's width rather than widening the popup.
    expect(html).toContain("w-0 min-w-full");
    expect(render()).not.toContain("h-[60vh]");
  });
});
