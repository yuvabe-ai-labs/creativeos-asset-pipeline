import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ScriptAssetsProvider } from "@/components/scripts/script-assets-context";
import { avatarMap, linkedDoc, MEENAKSHI_AVATAR, readyAvatar, SCRIPT_ID } from "@/lib/scripts/visualise/__tests__/fixtures";
import { BoardChips } from "../board-chips";

const doc = () => {
  const d = linkedDoc();
  d.cast = d.cast.map((c) => (c.id === "meenakshi" ? c : { ...c, avatarId: null }));
  d.products = [{ id: "P1", name: "Jackfruit365 flour", images: [] }];
  d.locations = [{ id: "L1", name: "Chennai kitchen", description: "Steel vessels.", image: null }];
  return d;
};

const render = () => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}>
    <ScriptAssetsProvider clientId="c1" scriptId={SCRIPT_ID}>
      <BoardChips
        clientId="c1"
        scriptId={SCRIPT_ID}
        doc={doc()}
        avatars={avatarMap(readyAvatar(MEENAKSHI_AVATAR, "m"))}
        faces={{ [MEENAKSHI_AVATAR]: "https://x/m.png" }}
      />
    </ScriptAssetsProvider>
  </QueryClientProvider>,
);

describe("BoardChips (D465: cast, locations and products as chips)", () => {
  it("shows a chip per person with a status, the face, and the lead tag", () => {
    const html = render();
    expect(html).toContain("Meenakshi");
    expect(html).toContain("Lead");
    expect(html).toContain("Ready");
    expect(html).toContain('id="cast-meenakshi"');
    expect(html).toContain("https://x/m.png");
  });

  it("says a person has no avatar yet", () => {
    expect(render()).toContain("No avatar yet");
  });

  it("lists locations and products with add chips, and no add on the cast", () => {
    const html = render();
    expect(html).toContain("Chennai kitchen");
    expect(html).toContain("Jackfruit365 flour");
    expect(html).toContain("Needs a picture");
    expect(html).toContain("Add a location");
    expect(html).toContain("Add a product");
    expect(html.match(/Add a /g)).toHaveLength(2);
  });

  it("draws no dialog until a chip is opened", () => {
    expect(render()).not.toContain('role="dialog"');
  });
});
