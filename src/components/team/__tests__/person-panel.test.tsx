import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/services/people.service", () => ({ peopleService: { list: vi.fn(), addToClient: vi.fn() } }));

import { PersonPanelBody, personHistory } from "../person-panel-body";
import { addPersonToClient } from "../add-to-client";
import type { AgencyPerson } from "@/lib/people/types";
import type { ClientBrief } from "@/lib/db/types";

const person = (over: Partial<AgencyPerson>): AgencyPerson => ({
  userId: "u1", name: "Meera Nair", email: "meera@x.com", status: "member", permissions: ["generate"], joinedAt: new Date().toISOString(),
  invitedByName: null, invitedClient: null, clientIds: [], ...over,
});
const clients: ClientBrief[] = [
  { id: "c1", name: "Chupps", slug: "chupps", logo_url: "https://cdn.example/chupps.png" },
  { id: "c2", name: "Blue Ocean", slug: "blue-ocean", logo_url: null },
];
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const render = (p: AgencyPerson) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <PersonPanelBody orgId="org-1" person={p} clients={clients} clientHref={(c) => `/clients/${c.slug}/members`} />
    </QueryClientProvider>,
  );

describe("person panel (spec §6.1)", () => {
  it("shows who they are, their status and how they joined", () => {
    const waiting = person({ status: "signed_up", invitedByName: "Asha", invitedClient: { id: "c1", name: "Chupps" }, clientIds: ["c1"] });
    const t = text(render(waiting));
    expect(t).toMatch(/^MN Meera Nair meera@x\.com Signed up · Needs permissions Invited to Chupps by Asha · Signed up just now/);
  });

  it("gives someone waiting the editor, starting empty, and Give access", () => {
    const t = text(render(person({ status: "signed_up", permissions: [] })));
    expect(t).toMatch(/Permissions Generate .*Approve .*Share .*Delete .*Invite/);
    expect(t).toContain("Give access");
    expect(t).not.toContain("Save");
  });

  it("gives a member the editor with their permissions, and Save", () => {
    const t = text(render(person({ permissions: ["generate", "approve"] })));
    expect(t).toMatch(/Permissions Generate .*Approve .*Share .*Delete .*Invite .*Save Cancel/);
    expect(t).toContain("Save");
  });

  it("lists their clients with links and Remove, and offers Add to a client", () => {
    const html = render(person({ clientIds: ["c1"] }));
    const t = text(html);
    expect(html).toContain('href="/clients/chupps/members"');
    expect(t).toMatch(/Clients Chupps Remove Add to a client/);
  });

  it("says when they are on no client yet, and when they are on every one", () => {
    expect(text(render(person({ clientIds: [] })))).toContain("Not on any client yet.");
    expect(text(render(person({ clientIds: ["c1", "c2"] })))).toContain("They are on every client.");
  });

  it("shows the owner holding everything, on every client, with nothing to edit", () => {
    const t = text(render(person({ status: "owner", permissions: [] })));
    expect(t).toContain("Everything");
    expect(t).toContain("The owner is on every client.");
    expect(t).not.toContain("Make and change work");
    expect(t).not.toContain("Add to a client");
  });

  it("writes no history for the owner", () => {
    expect(personHistory(person({ status: "owner" }))).toBeNull();
    expect(personHistory(person({ invitedByName: "Asha" }))).toMatch(/^Invited by Asha · Joined /);
  });
});

describe("Add to a client", () => {
  it("makes one request, adding just this person to the chosen client", async () => {
    const add = { mutateAsync: vi.fn().mockResolvedValue({ added: 1 }) };
    await addPersonToClient(add, "u1");
    expect(add.mutateAsync).toHaveBeenCalledTimes(1);
    expect(add.mutateAsync).toHaveBeenCalledWith(["u1"]);
  });

  it("binds the add mutation to the chosen client", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/components/team/add-to-client.tsx", "utf8");
    expect(source).toContain('useAddToClient(orgId, chosen ?? "")');
  });
});
