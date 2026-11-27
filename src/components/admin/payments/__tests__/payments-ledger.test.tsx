import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { PaymentsLedger } from "../payments-ledger";
import { PaymentsStatLine } from "../payments-stat-line";
import type { AdminPaymentsPage } from "@/lib/db/billing-admin-payments";

const totals = (over: Partial<AdminPaymentsPage["totals"]["counts"]> = {}) => ({
  counts: { all: 3, paid: 1, failed: 1, refunded: 0, created: 1, ...over },
  amounts: { paid: 1_416_000, failed: 342_200, refunded: 0, created: 14_750 },
});
const page: AdminPaymentsPage = {
  total: 3,
  totals: totals(),
  payments: [
    { id: "a", orgId: "o1", orgName: "Kite & Co", kind: "renewal", status: "paid", totalMinor: 1_416_000, beforeGstMinor: 1_200_000, name: "Studio", at: "2026-11-25T05:30:00Z" },
    { id: "b", orgId: "o2", orgName: "Northwind", kind: "renewal", status: "failed", totalMinor: 342_200, beforeGstMinor: 290_000, name: "Growth", at: "2026-11-23T00:30:00Z" },
    { id: "c", orgId: "o3", orgName: "Saffron", kind: "topup", status: "created", totalMinor: 14_750, beforeGstMinor: 12_500, name: "Small top-up", at: "2026-11-26T03:45:00Z" },
  ],
};

const render = (initial: AdminPaymentsPage) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <PaymentsLedger initial={initial} />
    </QueryClientProvider>,
  );

describe("Payments ledger", () => {
  it("has tabs by status with counts, Not finished included", () => {
    const html = render(page);
    for (const label of ["All", "Paid", "Failed", "Refunded", "Not finished"]) expect(html).toContain(label);
    expect(html).toContain("When:");
    expect(html).toContain("This month");
    expect(html).toContain("Search by agency");
  });

  it("says every amount includes GST, with the amount before it, and links each agency's billing", () => {
    const html = render(page);
    expect(html).toContain("Amount, with GST");
    expect(html).toContain("₹14,160");
    expect(html).toContain("₹12,000 + GST");
    expect(html).toContain('href="/admin/orgs/o2?tab=billing"');
    expect(html).toContain("Failed");
    expect(html).toContain("Renewal · Growth");
    expect(html).toContain("25 Nov 2026");
    expect(html).toContain("11:00 IST");
  });

  it("sums what was paid in the footer", () => {
    expect(render(page)).toContain("3 payments · ₹14,160 paid");
  });

  it("says nothing matched, with a way to widen the range", () => {
    const html = render({ total: 0, payments: [], totals: totals({ all: 0, paid: 0, failed: 0, created: 0 }) });
    expect(html).toContain("No payments match");
    expect(html).toContain("Nothing in this month.");
    expect(html).toContain("Show all time");
  });
});

describe("Payments stat line", () => {
  it("puts this month in one line", () => {
    const html = renderToStaticMarkup(<PaymentsStatLine paidMinor={1_416_000} paidCount={1} plansMonthlyMinor={2_832_000} renewing={2} failed={1} refundedMinor={0} />);
    expect(html).toContain("paid this month, 1 payment");
    expect(html).toContain("₹28,320");
    expect(html).toContain("a month from plans");
    expect(html).toContain("2 plans renew in 7 days");
    expect(html).toContain("1 failed payment · ₹0 refunded");
  });
});
