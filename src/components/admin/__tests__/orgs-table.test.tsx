// src/components/admin/__tests__/orgs-table.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/actions/admin", () => ({ resendOwnerInviteAction: vi.fn() }));

import { OrgsTable } from "../orgs-table";

const org = (over: Record<string, unknown>) => ({ id: "o1", name: "Acme", slug: "acme", monthly_credit_limit: null, created_at: "2026-11-01T00:00:00Z", client_count: 0, owner_pending: false, ...over });

describe("OrgsTable (spec §6.6)", () => {
  it("marks an agency whose owner hasn't signed up, with Resend", () => {
    const html = renderToStaticMarkup(<OrgsTable orgs={[org({ id: "o1", name: "Acme", owner_pending: true }), org({ id: "o2", name: "Bata" })]} />);
    expect(html).toContain("Owner hasn&#x27;t signed up");
    expect((html.match(/Resend/g) ?? []).length).toBe(1);
  });
});
