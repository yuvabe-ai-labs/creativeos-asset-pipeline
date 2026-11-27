import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/services/people.service", () => ({ peopleService: { list: vi.fn() } }));
vi.mock("next/navigation", () => ({ usePathname: () => "/team" }));

import { ClientMembers } from "../client-members";
import { TeamPeople } from "../team-people";
import { PageCrumbs } from "@/components/shared/page-crumbs";
import { membersCrumbs, teamCrumbs } from "@/lib/people/nav";
import type { AgencyPeople, AgencyPerson } from "@/lib/people/types";

const person = (over: Partial<AgencyPerson>): AgencyPerson => ({
  userId: "u", name: "N", email: "n@x.com", status: "member", permissions: [], joinedAt: "t",
  invitedByName: null, invitedClient: null, clientIds: [], ...over,
});
const data: AgencyPeople = {
  people: [
    person({ userId: "o", name: "Asha", status: "owner" }),
    person({ userId: "w", name: "Ravi", status: "signed_up", clientIds: ["c1"] }),
  ],
  invites: [],
};
const chupps = { id: "c1", name: "Chupps", slug: "chupps", logo_url: null };
const wrap = (node: React.ReactNode) =>
  renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const read = (p: string) => readFileSync(p, "utf8");

describe("people screens: one header, a trail and a way back", () => {
  it("renders a trail with links, the last crumb being the current page", () => {
    const html = renderToStaticMarkup(<PageCrumbs items={teamCrumbs(chupps)} />);
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/clients/chupps"');
    expect(html).toContain('href="/clients/chupps/members"');
    expect(html).toMatch(/aria-current="page"[^>]*>Team</);
    expect(text(html)).toBe("Clients Chupps Members Team");
  });

  it("heads the Members page and the Team page the same way: trail, then a text-2xl title, then the summary", () => {
    const members = wrap(
      <ClientMembers orgId="org-1" client={chupps} initial={data} canManage headingLevel="h1" breadcrumb={<PageCrumbs items={membersCrumbs(chupps)} />} />,
    );
    const team = wrap(<TeamPeople orgId="org-1" clients={[chupps]} initial={data} title="Team" breadcrumb={<PageCrumbs items={teamCrumbs(null)} />} />);
    for (const html of [members, team]) {
      expect(html).toContain('aria-label="breadcrumb"');
      expect(html).toMatch(/<h1 class="font-display truncate text-2xl font-semibold tracking-tight">/);
      expect(html.indexOf('aria-label="breadcrumb"')).toBeLessThan(html.indexOf("<h1"));
    }
    expect(text(team)).toMatch(/^Clients Team Team 2 people/);
  });

  it("links Set permissions on a Members list to the Team page with the client as ?from", () => {
    const html = wrap(<ClientMembers orgId="org-1" client={chupps} initial={data} canManage />);
    expect(html).toContain('href="/team?person=w&amp;from=chupps"');
  });

  it("closing the person panel drops only ?person, with no history entry", () => {
    const source = read("src/components/team/team-people.tsx");
    expect(source).toContain('url.searchParams.delete("person")');
    expect(source).not.toContain('delete("from")');
    expect(source).toContain("window.history.replaceState(");
    expect(source).not.toContain("pushState");
  });

  it("gives every people screen the same page box and header", () => {
    for (const page of ["src/app/team/page.tsx", "src/app/clients/[id]/members/page.tsx"]) {
      const source = read(page);
      expect(source).toContain("<main className={PAGE_CONTAINER}>");
      expect(source).not.toContain("<Breadcrumb");
    }
    // The agency page sits under the admin tabs, so it takes the admin box (tabs and title line up);
    // its header is the same one.
    const agency = read("src/app/admin/orgs/[id]/page.tsx");
    expect(agency).toContain("<main className={adminPageClass()}>");
    expect(agency).not.toContain("<Breadcrumb");
    expect(read("src/components/team/client-members.tsx")).toContain("<PageHeader");
    expect(read("src/components/team/team-people.tsx")).toContain("<PageHeader");
    expect(read("src/app/admin/orgs/[id]/page.tsx")).toContain("<PageHeader");
  });
});
