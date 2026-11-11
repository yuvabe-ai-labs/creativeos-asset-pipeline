import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PermissionKey } from "@/lib/permissions/catalogue";
import { TestAbilityProvider } from "@/components/permissions/test-ability-provider";
import { ClientSectionLinks } from "../client-section-links";
import { useClientSections } from "../use-client-sections";

function Labels() {
  return <p>{useClientSections("c1").map((s) => s.label).join(",")}</p>;
}
const render = (keys: readonly PermissionKey[], el = <Labels />) =>
  renderToStaticMarkup(<TestAbilityProvider keys={keys}>{el}</TestAbilityProvider>);

describe("client sections", () => {
  it("lists only the sections whose area the person can view", () => {
    expect(render(["scripts.view", "market.view"])).toContain("Scripts,Market");
  });

  it("lists every section with every view", () => {
    expect(render(["scripts.view", "brand_knowledge.view", "brand_assets.view", "market.view", "avatars.view"]))
      .toContain("Scripts,Brand KB,Brand assets,Market,Avatars");
  });

  it("the tile's pinned links drop a section the person can't view", () => {
    const html = render(["avatars.view"], <ClientSectionLinks clientId="c1" slug="acme" clientName="Acme" />);
    expect(html).toContain("Avatars");
    expect(html).not.toContain("Scripts");
  });
});
