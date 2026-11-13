import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CLIENT_SECTIONS } from "../client-sections";
import { ClientSectionLinks } from "../client-section-links";

describe("client sections", () => {
  it("are the same for everyone who can see the client (D507: View covers every section)", () => {
    expect(CLIENT_SECTIONS.map((s) => s.label)).toEqual(["Scripts", "Brand KB", "Brand assets", "Market", "Avatars"]);
    expect(CLIENT_SECTIONS.some((s) => "need" in s)).toBe(false);
  });

  it("the tile's links are the pinned sections", () => {
    const html = renderToStaticMarkup(<ClientSectionLinks slug="acme" clientName="Acme" />);
    expect(html).toContain("Scripts");
    expect(html).toContain("Avatars");
    expect(html).not.toContain("Brand KB");
  });
});
