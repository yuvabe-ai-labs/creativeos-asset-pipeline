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
    person({ userId: "m", name: "Meera", clientIds: ["c1"] }),
    person({ userId: "w", name: "Ravi", status: "signed_up", clientIds: ["c1"] }),
    person({ userId: "x", name: "Elsewhere", clientIds: ["c2"] }),
  ],
  invites: [{ id: "i1", email: "new@x.com", clientId: "c1", clientName: "Chupps", asOwner: false, sentAt: "2026-11-12T00:00:00Z", expiresAt: "2026-11-19T00:00:00Z", invitedByName: null, link: "https://app.example/invite/tok1" }],
};
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const render = (canManage = true, initial: AgencyPeople = data) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ClientMembers orgId="org-1" client={{ id: "c1", name: "Chupps" }} initial={initial} teamHref={(id) => `/team?person=${id}`} canManage={canManage} inviteSlot={<span>Invite</span>} />
    </QueryClientProvider>,
  );
// What an Invite holder receives: the same people, invite links withheld (hideInviteLinks).
const forHolder: AgencyPeople = { ...data, invites: data.invites.map((i) => ({ ...i, link: null })) };

describe("ClientMembers (spec §6.2)", () => {
  it("counts the people on this client: the owner, members, people waiting and open invites", () => {
    expect(text(render())).toContain("4 people on this client");
  });

  // renderToString marks text-node boundaries with <!-- -->; the heading must be one run, or a
  // reader of the accessibility tree sees "4PEOPLE ON THIS CLIENT".
  it("writes the count heading as one run of text, singular for one", () => {
    const one: AgencyPeople = { people: [person({ userId: "o", name: "Asha", status: "owner" })], invites: [] };
    const html = (initial: AgencyPeople) =>
      renderToString(
        <QueryClientProvider client={new QueryClient()}>
          <ClientMembers orgId="org-1" client={{ id: "c1", name: "Chupps" }} initial={initial} canManage inviteSlot={null} />
        </QueryClientProvider>,
      );
    expect(html(data)).toContain(">4 people on this client<");
    expect(html(one)).toContain(">1 person on this client<");
  });

  it("shows each status, the owner without actions", () => {
    const t = text(render());
    expect(t).toMatch(/Asha n@x\.com Owner/);
    expect(t).toMatch(/Meera n@x\.com Member/);
    expect(t).toMatch(/Ravi n@x\.com Signed up · Needs permissions/);
    // Email and when it was sent in Name, then Invited in Status like the person rows.
    expect(t).toMatch(/new@x\.com Sent .* Invited/);
    expect(t).not.toContain("Elsewhere");
  });

  it("links someone waiting to the Team page, and offers Remove on people", () => {
    const html = render();
    expect(html).toContain('href="/team?person=w"');
    expect(text(html)).toContain("Set permissions");
    expect(text(html)).toContain("Remove");
    expect(text(html)).toContain("Resend");
  });

  it("never edits permissions here", () => {
    expect(text(render())).not.toContain("Choose a permission");
  });

  it("shows an Invite holder the list and the Invite button, but no Remove, Resend, Cancel, Copy link or Set permissions", () => {
    const t = text(render(false, forHolder));
    expect(t).toContain("4 people on this client");
    expect(t).toMatch(/Ravi n@x\.com Signed up · Needs permissions/);
    expect(t).toContain("Invite");
    for (const owners of ["Remove", "Resend", "Cancel", "Copy link", "Set permissions"]) expect(t).not.toContain(owners);
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

  it("lines up Name, Status and Actions: every row, person or invite, is a row of the shared columns", () => {
    const html = render();
    const rows = html.match(/<li[^>]*>/g) ?? [];
    expect(rows).toHaveLength(4);
    for (const row of rows) expect(row).toContain("sm:grid-cols-subgrid");
  });
});
