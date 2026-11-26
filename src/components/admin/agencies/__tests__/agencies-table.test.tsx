import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/actions/admin", () => ({ resendOwnerInviteAction: vi.fn(), inviteOwnerAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

import { AgenciesTable } from "../agencies-table";
import { toAgencyRow, type AgencySource } from "@/lib/admin/agencies-list";

const NOW = new Date("2026-11-26T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const row = (over: Partial<AgencySource>) =>
  toAgencyRow(
    {
      id: "o1",
      name: "Acme",
      billingMode: "managed",
      monthlyLimit: null,
      clientCount: 1,
      hasOwner: true,
      ownerInvite: null,
      activity: { ownerEmail: "owner@acme.in", memberCount: 2, lastRunAt: daysAgo(1) },
      creditsUsedThisMonth: 0,
      grants: [],
      subscription: null,
      ...over,
    },
    NOW,
  );

describe("AgenciesTable (D590)", () => {
  it("lists every agency on one page, its name a link, with the owner under it", () => {
    const rows = Array.from({ length: 30 }, (_, i) => row({ id: `o${i}`, name: `Agency ${i}` }));
    const html = renderToStaticMarkup(<AgenciesTable rows={rows} />);
    expect((html.match(/data-agency-link="true"/g) ?? []).length).toBe(30);
    expect(html).toContain('href="/admin/orgs/o0"');
    expect(html).toContain("owner@acme.in");
    expect(html).toContain("All 30 agencies");
    expect(html).not.toContain("Page 1 of");
  });

  it("puts the fix for each issue on its row, mapped to the app's actions", () => {
    const html = renderToStaticMarkup(
      <AgenciesTable
        rows={[
          row({ id: "pay", billingMode: "plans", subscription: { status: "payment_due", paymentDueSince: daysAgo(3), planName: "Growth", intervalMonths: 1 } }),
          row({ id: "inv", hasOwner: false, ownerInvite: { email: "new@x.in", sentAt: daysAgo(1), expiresAt: daysAgo(-6), link: "https://app/invite/t" } }),
          row({ id: "none", hasOwner: false }),
          row({ id: "quiet", activity: { ownerEmail: "q@x.in", memberCount: 1, lastRunAt: daysAgo(40) } }),
        ]}
      />,
    );
    expect(html).toContain('href="/admin/orgs/pay?tab=billing"');
    expect(html).toContain("Copy invite link");
    expect(html).toContain("Invite an owner");
    expect(html).toContain("Quiet for 30+ days");
    expect(html).toContain('aria-sort="other"');
  });

  it("says when there are no agencies yet, without the search", () => {
    const html = renderToStaticMarkup(<AgenciesTable rows={[]} />);
    expect(html).toContain("No agencies yet");
    expect(html).not.toContain("Search agencies");
  });
});
