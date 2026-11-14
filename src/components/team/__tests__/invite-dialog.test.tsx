// src/components/team/__tests__/invite-dialog.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/services/people.service", () => ({ peopleService: { list: vi.fn() } }));

import { InviteDialogAddStep } from "../invite-dialog-add-step";
import { InviteDialogEmailStep } from "../invite-dialog-email-step";
import { peopleKeys } from "@/hooks/queries/people";
import type { AgencyPeople, AgencyPerson } from "@/lib/people/types";

const person = (over: Partial<AgencyPerson>): AgencyPerson => ({
  userId: "u", name: "N", email: "n@x.com", status: "member", permissions: [], joinedAt: "t",
  invitedByName: null, invitedClient: null, clientIds: [], ...over,
});
const data: AgencyPeople = {
  people: [
    person({ userId: "o", name: "Asha", status: "owner" }),
    person({ userId: "m", name: "Meera", clientIds: ["c1"] }),
    person({ userId: "w", name: "Ravi", status: "signed_up", clientIds: ["c2"] }),
    person({ userId: "x", name: "Kiran", clientIds: ["c2"] }),
  ],
  invites: [],
};
const client = { id: "c1", name: "Chupps" };
const withPeople = (el: React.ReactElement) => {
  const qc = new QueryClient();
  qc.setQueryData(peopleKeys.list("org-1"), data);
  return renderToStaticMarkup(<QueryClientProvider client={qc}>{el}</QueryClientProvider>);
};
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("invite popup (spec §6.2)", () => {
  it("step 1 lists everyone in the agency not on this client, people waiting included, never the owner", () => {
    const t = text(withPeople(<InviteDialogAddStep orgId="org-1" client={client} onInviteNew={vi.fn()} onDone={vi.fn()} />));
    expect(t).toContain("In your agency");
    expect(t).toContain("Ravi");
    expect(t).toContain("Kiran");
    expect(t).not.toContain("Meera");
    expect(t).not.toContain("Asha");
    expect(t).toContain("Invite someone new");
  });

  it("step 1 has a search field and an Add button that counts the chosen people", () => {
    const html = withPeople(<InviteDialogAddStep orgId="org-1" client={client} onInviteNew={vi.fn()} onDone={vi.fn()} />);
    expect(html).toContain('placeholder="Search people"');
    expect(text(html)).toContain("Add 0 people");
  });

  it("step 2 asks for an email, with Back and Send invite and what happens next", () => {
    const t = text(withPeople(<InviteDialogEmailStep orgId="org-1" client={client} canManage onBack={vi.fn()} />));
    expect(t).toContain("Back");
    expect(t).toContain("Send invite");
    expect(t).toContain("They get an email to sign up. Once they have, you set their permissions on the Team page.");
  });

  it("step 2 tells an Invite holder that the owner sets the permissions", () => {
    const t = text(withPeople(<InviteDialogEmailStep orgId="org-1" client={client} canManage={false} onBack={vi.fn()} />));
    expect(t).toContain("They get an email to sign up. Once they have, the owner sets their permissions on the Team page.");
  });

  it("step 1 is the same for an Invite holder: the agency's people with their statuses, no permissions", () => {
    const t = text(withPeople(<InviteDialogAddStep orgId="org-1" client={client} onInviteNew={vi.fn()} onDone={vi.fn()} />));
    expect(t).toContain("Signed up · Needs permissions");
    expect(t).not.toContain("Choose a permission");
  });
});
