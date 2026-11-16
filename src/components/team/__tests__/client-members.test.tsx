// src/components/team/__tests__/client-members.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/services/people.service", () => ({ peopleService: { list: vi.fn() } }));

import { ClientMembers } from "../client-members";
import { ClientMembersButton } from "@/components/clients/client-members-button";
import { TestAccessProvider } from "@/components/permissions/test-access-provider";
import type { Permission } from "@/lib/permissions/model";
import type { AgencyPeople, AgencyPerson } from "@/lib/people/types";

const person = (over: Partial<AgencyPerson>): AgencyPerson => ({
  userId: "u", name: "N", email: "n@x.com", status: "member", permissions: [], joinedAt: "t",
  invitedByName: null, invitedClient: null, clientIds: [], ...over,
});
const data: AgencyPeople = {
  people: [
    person({ userId: "o", name: "Asha", status: "owner" }),
    person({ userId: "m", name: "Meera", permissions: ["approve", "generate"], clientIds: ["c1"] }),
    person({ userId: "k", name: "Kiran", clientIds: ["c1"] }),
    person({ userId: "w", name: "Ravi", status: "signed_up", clientIds: ["c1"] }),
    person({ userId: "x", name: "Elsewhere", clientIds: ["c2"] }),
  ],
  invites: [{ id: "i1", email: "new@x.com", clientId: "c1", clientName: "Chupps", asOwner: false, sentAt: "2026-11-12T00:00:00Z", expiresAt: "2026-11-19T00:00:00Z", invitedByName: null, link: "https://app.example/invite/tok1" }],
};
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const rows = (html: string) => html.match(/<li[\s>][^>]*>/g) ?? [];
const render = (canManage = true, initial: AgencyPeople = data) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ClientMembers orgId="org-1" client={{ id: "c1", name: "Chupps", logo_url: null }} initial={initial} teamHref={(id) => `/team?person=${id}`} canManage={canManage} inviteSlot={<span>Invite</span>} />
    </QueryClientProvider>,
  );
// What an Invite holder receives (inviteHolderView): no permissions, invite links withheld.
const forHolder: AgencyPeople = {
  people: data.people.map((p) => ({ ...p, permissions: [] })),
  invites: data.invites.map((i) => ({ ...i, link: null })),
};

describe("ClientMembers (spec §6.2)", () => {
  it("heads the list with the client's mark and name, and counts the people on it", () => {
    // The owner, members, people waiting and open invites.
    expect(text(render())).toMatch(/^C Members Chupps 5 people on this client/);
  });

  // renderToString marks text-node boundaries with <!-- -->; the count must be one run, or a
  // reader of the accessibility tree sees "5PEOPLE ON THIS CLIENT".
  it("writes the count as one run of text, singular for one", () => {
    const one: AgencyPeople = { people: [person({ userId: "o", name: "Asha", status: "owner" })], invites: [] };
    const html = (initial: AgencyPeople) =>
      renderToString(
        <QueryClientProvider client={new QueryClient()}>
          <ClientMembers orgId="org-1" client={{ id: "c1", name: "Chupps" }} initial={initial} canManage inviteSlot={null} />
        </QueryClientProvider>,
      );
    expect(html(data)).toContain(">5 people on this client<");
    expect(html(one)).toContain(">1 person on this client<");
  });

  it("shows each status and each person's permissions, the owner without actions", () => {
    const html = render();
    const t = text(html);
    expect(t).toMatch(/Person Status Permissions/);
    expect(t).not.toContain("Clients");
    expect(t).toMatch(/Asha n@x\.com Owner Everything/);
    expect(t).toMatch(/Meera n@x\.com Member Generate Approve/);
    expect(t).toMatch(/Kiran n@x\.com Member Can look/);
    expect(t).toMatch(/Ravi n@x\.com Signed up · Needs permissions Can look/);
    // The email and when it was sent, then Invited in Status like the person rows.
    expect(t).toMatch(/new@x\.com Sent .* Invited/);
    expect(t).not.toContain("Elsewhere");
    expect(html).not.toContain('aria-label="More actions for Asha"');
  });

  it("links someone waiting to the Team page, and keeps Remove and the invite's actions in menus", () => {
    const html = render();
    expect(html).toContain('href="/team?person=w"');
    expect(text(html)).toContain("Set permissions");
    expect(html).toContain('aria-label="More actions for Meera"');
    expect(html).toContain('aria-label="More actions for the invite to new@x.com"');
  });

  it("never edits permissions here", () => {
    expect(text(render())).not.toContain("Choose a permission");
  });

  it("shows an Invite holder the list and the Invite button, but no menus, Set permissions or permissions", () => {
    const html = render(false, forHolder);
    const t = text(html);
    expect(t).toContain("5 people on this client");
    expect(t).toMatch(/Ravi n@x\.com Signed up · Needs permissions/);
    expect(t).toContain("Invite");
    expect(t).not.toContain("Set permissions");
    expect(html).not.toContain("More actions");
    // Their read has no permissions: the column is left out, not filled with "Can look".
    expect(t).not.toContain("Permissions");
    expect(t).not.toContain("Can look");
    expect(t).not.toContain("Everything");
  });
});

describe("ClientMembersButton (spec §6.2)", () => {
  const button = (clientId: string, permissions?: readonly Permission[]) =>
    renderToStaticMarkup(
      <TestAccessProvider permissions={permissions}>
        <ClientMembersButton slug="chupps" clientId={clientId} />
      </TestAccessProvider>,
    );

  it("shows the owner Members, linking to the client's Members page", () => {
    const html = button("c1");
    expect(text(html)).toContain("Members");
    expect(html).toContain('href="/clients/chupps/members"');
  });

  it("shows a member with Invite on c1 the button there, and not on c2", () => {
    expect(text(button("c1", ["invite"]))).toContain("Members");
    expect(button("c2", ["invite"])).toBe("");
  });

  it("hides it from a member without Invite", () => {
    expect(button("c1", ["generate", "approve"])).toBe("");
  });
});

describe("ClientMembers polish", () => {
  it("offers Set permissions only to someone Signed up", () => {
    const html = render();
    expect(text(html).split("Set permissions").length - 1).toBe(1);
    expect(html).not.toContain('href="/team?person=m"');
  });

  it("lines up the columns: every row, person or invite, is a row of the shared columns", () => {
    const html = render();
    expect(rows(html)).toHaveLength(5);
    for (const row of rows(html)) expect(row).toContain("sm:grid-cols-subgrid");
  });
});
