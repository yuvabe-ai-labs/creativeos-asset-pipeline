import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ClientStack } from "../client-stack";
import { ClientMark } from "../client-mark";
import { PersonAvatar } from "../person-avatar";
import type { ClientBrief } from "@/lib/db/types";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const client = (id: string, name: string, logo_url: string | null = null): ClientBrief => ({ id, name, slug: id, logo_url });
const href = (c: ClientBrief) => `/clients/${c.slug}/members`;

describe("ClientMark", () => {
  it("shows the logo when there is one, else the initials", () => {
    expect(renderToStaticMarkup(<ClientMark name="Chupps" logoUrl="https://cdn.example/c.png" />)).toContain('src="https://cdn.example/c.png"');
    const html = renderToStaticMarkup(<ClientMark name="Blue Ocean" logoUrl={null} />);
    expect(html).not.toContain("<img");
    expect(text(html)).toBe("BO");
  });
});

describe("ClientStack", () => {
  it("shows up to three marks, then +n for the rest", () => {
    const five = [client("a", "Alpha"), client("b", "Beta"), client("c", "Gamma", "https://cdn.example/g.png"), client("d", "Delta"), client("e", "Echo")];
    const html = renderToStaticMarkup(<ClientStack clients={five} href={href} />);
    expect(html.match(/title="/g)).toHaveLength(3);
    expect(text(html)).toContain("+2");
    expect(html).toContain('aria-label="Clients: Alpha, Beta, Gamma, Delta, Echo"');
  });

  it("has no +n at three or fewer", () => {
    const html = renderToStaticMarkup(<ClientStack clients={[client("a", "Alpha"), client("b", "Beta")]} href={href} />);
    expect(html.match(/title="/g)).toHaveLength(2);
    expect(text(html)).not.toMatch(/\+\d/);
  });

  it("says No clients when empty, and Every client for the owner", () => {
    expect(text(renderToStaticMarkup(<ClientStack clients={[]} href={href} />))).toBe("No clients");
    expect(text(renderToStaticMarkup(<ClientStack clients={[]} href={href} everyClient />))).toBe("Every client");
  });
});

describe("PersonAvatar", () => {
  it("shows initials, with a ring for the owner only", () => {
    expect(text(renderToStaticMarkup(<PersonAvatar name="Meera Nair" />))).toBe("MN");
    expect(renderToStaticMarkup(<PersonAvatar name="Asha" owner />)).toContain("ring-primary/35");
    expect(renderToStaticMarkup(<PersonAvatar name="Meera" />)).not.toContain("ring-primary");
  });
});
