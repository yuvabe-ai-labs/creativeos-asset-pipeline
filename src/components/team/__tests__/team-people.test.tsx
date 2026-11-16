import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/services/people.service", () => ({ peopleService: { list: vi.fn() } }));
vi.mock("next/navigation", () => ({ usePathname: () => "/team" }));

import { TeamPeople } from "../team-people";
import type { AgencyPeople, AgencyPerson } from "@/lib/people/types";
import type { ClientBrief } from "@/lib/db/types";

const person = (over: Partial<AgencyPerson>): AgencyPerson => ({
  userId: "u", name: "N", email: "n@x.com", status: "member", permissions: [], joinedAt: "2026-11-10T00:00:00Z",
  invitedByName: null, invitedClient: null, clientIds: [], ...over,
});
const data: AgencyPeople = {
  people: [
    person({ userId: "m", name: "Meera", email: "meera@x.com", permissions: ["invite", "generate"], clientIds: ["c1"] }),
    person({ userId: "o", name: "Asha", email: "asha@x.com", status: "owner" }),
    person({ userId: "k", name: "Kiran", email: "kiran@x.com", permissions: [], clientIds: ["c1"] }),
    person({ userId: "w", name: "Ravi", email: "ravi@x.com", status: "signed_up", invitedByName: "Asha", invitedClient: { id: "c1", name: "Chupps" }, clientIds: ["c1"] }),
  ],
  invites: [
    { id: "i1", email: "new@x.com", clientId: "c1", clientName: "Chupps", asOwner: false, sentAt: "2026-11-12T00:00:00Z", expiresAt: "2026-11-19T12:00:00Z", invitedByName: "Meera", link: "https://app.example/invite/tok1" },
    { id: "i2", email: "gone@x.com", clientId: "c1", clientName: "Chupps", asOwner: false, sentAt: "2026-11-12T00:00:00Z", expiresAt: "2026-11-19T12:00:00Z", invitedByName: null, link: "https://app.example/invite/tok2" },
  ],
};
const clients: ClientBrief[] = [{ id: "c1", name: "Chupps", slug: "chupps", logo_url: "https://cdn.example/chupps.png" }];
const render = (props: Partial<Parameters<typeof TeamPeople>[0]> = {}) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <TeamPeople orgId="org-1" clients={clients} initial={data} title="Team" {...props} />
    </QueryClientProvider>,
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const rows = (html: string) => html.match(/<li[\s>][^>]*>/g) ?? [];

describe("TeamPeople (spec §6.1)", () => {
  it("heads the page with Team and a one-line summary", () => {
    expect(text(render())).toMatch(/^Team 4 people · 1 waiting · 2 invited/);
  });

  it("offers search, a client filter and All / Waiting / Invited / Members", () => {
    const t = text(render());
    expect(render()).toContain('aria-label="Search people"');
    expect(render()).toContain('aria-label="Filter by client"');
    expect(t).toMatch(/All Waiting \(1\) Invited \(2\) Members/);
  });

  it("shows one list: people waiting first, then invites, then members with the owner first", () => {
    const t = text(render());
    const order = ["Ravi", "new@x.com", "gone@x.com", "Asha", "meera@x.com", "Kiran"].map((s) => t.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(rows(render())).toHaveLength(6);
  });

  it("gives each row its status, permissions and clients, in one set of columns", () => {
    const html = render();
    const t = text(html);
    expect(t).toMatch(/Person Status Permissions Clients/);
    expect(t).toMatch(/Ravi ravi@x\.com Signed up · Needs permissions Can look/);
    expect(t).toMatch(/Asha asha@x\.com Owner Everything Every client/);
    expect(t).toMatch(/Meera meera@x\.com Member Generate Invite/);
    expect(t).toMatch(/Kiran kiran@x\.com Member Can look/);
    expect(t).toMatch(/new@x\.com Invited by Meera · Sent .* · Expires 19 Nov 2026 Invited/);
    expect(t).toMatch(/gone@x\.com Sent /);
    // The client's logo, not its name as text.
    expect(html).toContain('src="https://cdn.example/chupps.png"');
    expect(t).not.toContain("Clients: Chupps");
    for (const row of rows(html)) expect(row).toContain("sm:grid-cols-subgrid");
  });

  it("shows Set permissions on someone waiting, and keeps the rest in each row's menu", () => {
    const html = render();
    expect(text(html).split("Set permissions").length - 1).toBe(1);
    expect(html).toContain('aria-label="More actions for Ravi"');
    expect(html).toContain('aria-label="More actions for Meera"');
    expect(html).toContain('aria-label="More actions for the invite to new@x.com"');
    // The owner has no team actions.
    expect(html).not.toContain('aria-label="More actions for Asha"');
  });

  it("gives the owner a menu only for Admin's extras (reset password)", () => {
    const html = render({ extras: [{ id: "reset_password", label: "Reset password", render: () => null }] });
    expect(html).toContain('aria-label="More actions for Asha"');
  });

  it("lets a row open the person panel", () => {
    expect(render()).toContain('aria-label="Open Meera"');
    // Invites have no panel.
    expect(render()).not.toContain('aria-label="Open new@x.com"');
  });

  it("highlights the ?person target with one style, whether waiting or a member", () => {
    const highlight = "bg-primary/5 ring-1 ring-primary/30";
    expect(render({ focusUserId: "w" })).toContain(highlight);
    expect(render({ focusUserId: "m" })).toContain(highlight);
    expect(render()).not.toContain(highlight);
  });

  it("copies the stored link without a request: Copy link reads invite.link, only Resend calls the server", () => {
    const source = readFileSync("src/components/team/invite-entry-row.tsx", "utf8");
    expect(source).toContain("const link = invite.link;");
    expect(source).toContain("navigator.clipboard.writeText(link)");
    expect(source).not.toMatch(/mutateAsync\(\{[^}]*email/);
  });

  it("tells someone still waiting that removing them leaves no work behind", () => {
    const source = readFileSync("src/components/team/person-entry-row.tsx", "utf8");
    expect(source).toContain('showWorkNote={person.status !== "signed_up"}');
  });

  it("makes no request per row: clients come from the page's one read", () => {
    for (const file of ["person-entry-row.tsx", "invite-entry-row.tsx", "person-row.tsx", "../shared/client-stack.tsx"]) {
      const source = readFileSync(`src/components/team/${file}`, "utf8");
      expect(source).not.toMatch(/useQuery\(|usePeople\(|fetch\(/);
    }
  });
});
