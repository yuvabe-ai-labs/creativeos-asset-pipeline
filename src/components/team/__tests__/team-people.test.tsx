// src/components/team/__tests__/team-people.test.tsx
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/services/people.service", () => ({ peopleService: { list: vi.fn() } }));
vi.mock("next/navigation", () => ({ usePathname: () => "/team" }));

import { TeamPeople } from "../team-people";
import type { AgencyPeople, AgencyPerson } from "@/lib/people/types";

const person = (over: Partial<AgencyPerson>): AgencyPerson => ({
  userId: "u", name: "N", email: "n@x.com", status: "member", permissions: [], joinedAt: "2026-11-10T00:00:00Z",
  invitedByName: null, invitedClient: null, clientIds: [], ...over,
});
const data: AgencyPeople = {
  people: [
    person({ userId: "o", name: "Asha", email: "asha@x.com", status: "owner" }),
    person({ userId: "m", name: "Meera", email: "meera@x.com", permissions: ["generate", "invite"], clientIds: ["c1"] }),
    person({ userId: "k", name: "Kiran", email: "kiran@x.com", permissions: [], clientIds: ["c1"] }),
    person({ userId: "w", name: "Ravi", email: "ravi@x.com", status: "signed_up", invitedByName: "Asha", invitedClient: { id: "c1", name: "Chupps" }, clientIds: ["c1"] }),
  ],
  invites: [
    { id: "i1", email: "new@x.com", clientId: "c1", clientName: "Chupps", asOwner: false, sentAt: "2026-11-12T00:00:00Z", expiresAt: "2026-11-19T12:00:00Z", invitedByName: "Meera", link: "https://app.example/invite/tok1" },
    { id: "i2", email: "gone@x.com", clientId: "c1", clientName: "Chupps", asOwner: false, sentAt: "2026-11-12T00:00:00Z", expiresAt: "2026-11-19T12:00:00Z", invitedByName: null, link: "https://app.example/invite/tok2" },
  ],
};
const render = (props: Partial<Parameters<typeof TeamPeople>[0]> = {}) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <TeamPeople orgId="org-1" clients={[{ id: "c1", name: "Chupps" }]} initial={data} {...props} />
    </QueryClientProvider>,
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("TeamPeople (spec §6.1)", () => {
  it("has three sections: Waiting for you, Invited, Members", () => {
    const t = text(render());
    expect(t.indexOf("Waiting for you")).toBeLessThan(t.indexOf("Invited"));
    expect(t.indexOf("Invited")).toBeLessThan(t.indexOf("Members"));
  });

  it("shows a signed-up person with where they were invited, an editor and Give access", () => {
    const t = text(render());
    expect(t).toContain("Ravi");
    expect(t).toMatch(/Signed up .* · invited to Chupps by Asha/);
    expect(t).toContain("Give access");
    expect(t).toContain("Choose a permission");
  });

  it("lets the owner give access with no permissions picked (a member who only looks)", () => {
    const html = render();
    expect(html).toMatch(/Give access/);
    // The disabled attribute, not Tailwind's `disabled:` class that every Button carries.
    expect(html).not.toMatch(/<button[^>]*\sdisabled=""[^>]*>[^<]*Give access/);
  });

  it("copies the stored link without a request: Copy link reads invite.link, only Resend calls the server", () => {
    const source = readFileSync("src/components/team/team-invited-row.tsx", "utf8");
    expect(source).toContain("const link = invite.link;");
    expect(source).toContain("navigator.clipboard.writeText(link)");
    expect(source).not.toMatch(/mutateAsync\(\{[^}]*email/);
  });

  it("lists open invites with their client, Copy link, Resend and Cancel", () => {
    const t = text(render());
    expect(t).toContain("new@x.com");
    expect(t).toContain("Copy link");
    expect(t).toContain("Resend");
    expect(t).toContain("Cancel");
  });

  it("shows who sent each invite, and nothing when that login is gone", () => {
    const t = text(render());
    expect(t).toMatch(/new@x\.com Chupps · invited by Meera · Sent /);
    expect(t).toMatch(/gone@x\.com Chupps · Sent /);
  });

  it("shows the expiry as a date (it is in the future)", () => {
    const t = text(render());
    expect(t).toContain("Expires 19 Nov 2026");
    expect(t).not.toContain("Expires just now");
  });

  it("lists the owner first with no actions, then members with their chips, clients, Edit and Remove", () => {
    const t = text(render());
    expect(t.indexOf("Asha")).toBeLessThan(t.indexOf("Meera"));
    expect(t).toMatch(/Meera .*Generate .*Invite .*Chupps/);
    expect(t).toContain("Remove");
  });

  it("shows Can look for a member with no permissions", () => {
    expect(text(render())).toMatch(/Kiran kiran@x\.com Can look/);
  });

  it("offers Make owner only where asked (Admin)", () => {
    expect(text(render())).not.toContain("Make owner");
    expect(text(render({ canMakeOwner: true }))).toContain("Make owner");
  });
});

describe("TeamPeople polish", () => {
  const count = (t: string, word: string) => t.split(word).length - 1;

  it("gives the owner no actions: Remove appears once per other person only", () => {
    const onlyOwner = { people: [data.people[0]], invites: [] };
    expect(count(text(render({ initial: onlyOwner })), "Remove")).toBe(0);
    // Meera, Kiran and Ravi (waiting) each have one.
    expect(count(text(render()), "Remove")).toBe(3);
  });

  it("highlights the ?person target with one style, whether waiting or a member", () => {
    const highlight = "bg-primary/5 ring-1 ring-primary/30";
    expect(render({ focusUserId: "w" })).toContain(highlight);
    expect(render({ focusUserId: "m" })).toContain(highlight);
    expect(render()).not.toContain(highlight);
  });

  it("tells someone still waiting that removing them leaves no work behind", () => {
    const source = readFileSync("src/components/team/team-waiting-card.tsx", "utf8");
    expect(source).toContain("showWorkNote={false}");
  });
});

describe("TeamPeople: Admin's extra actions", () => {
  it("shows them on every person, the owner and people waiting included", () => {
    const t = text(render({ extraMemberActions: () => <span>Reset password</span> }));
    expect(t.split("Reset password").length - 1).toBe(4);
    // The owner still gets no team actions of their own.
    expect(t.split("Remove").length - 1).toBe(3);
  });
});
