// src/components/admin/__tests__/orgs-table.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/actions/admin", () => ({ resendOwnerInviteAction: vi.fn(), inviteOwnerAction: vi.fn() }));

import { OrgsTable } from "../orgs-table";

const org = (over: Record<string, unknown>) => ({ id: "o1", name: "Acme", slug: "acme", monthly_credit_limit: null, billing_mode: "managed" as const, plan_type: "standard" as const, created_at: "2026-11-01T00:00:00Z", client_count: 0, owner_status: "owned" as const, ...over });

describe("OrgsTable (spec §6.6)", () => {
  it("marks an agency whose invited owner hasn't signed up, with Resend", () => {
    const html = renderToStaticMarkup(<OrgsTable orgs={[org({ id: "o1", name: "Acme", owner_status: "invited" }), org({ id: "o2", name: "Bata" })]} />);
    expect(html).toContain("Owner hasn&#x27;t signed up");
    expect((html.match(/Resend/g) ?? []).length).toBe(1);
    expect(html).not.toContain("Invite an owner");
  });

  it("offers Invite an owner, not Resend, for an agency with no owner and no open owner invite", () => {
    const html = renderToStaticMarkup(<OrgsTable orgs={[org({ id: "o1", name: "Acme", owner_status: "none" }), org({ id: "o2", name: "Bata" })]} />);
    expect(html).toContain("No owner");
    expect(html).not.toContain("Owner hasn&#x27;t signed up");
    expect(html).not.toContain("Resend");
    expect((html.match(/Invite an owner/g) ?? []).length).toBe(1);
  });
});
