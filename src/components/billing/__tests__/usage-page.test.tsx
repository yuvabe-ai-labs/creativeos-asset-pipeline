import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/billing" }));
vi.mock("@/hooks/queries/billing", () => {
  const m = () => ({ mutateAsync: vi.fn(), isPending: false });
  return { useSubscribe: m, useConfirmSubscription: m, useStartTopUp: m, useConfirmTopUp: m, useCancelPlan: m, useChangePlan: m, usePayNow: m, useApproveNewPrice: m };
});

import { UsageDashboard } from "../owner/usage/usage-dashboard";
import { UsageRow } from "../owner/usage/usage-row";
import { UsageBoard } from "../owner/usage/usage-board";
import { TopUpSection } from "../owner/top-up-section";
import { ManagedCreditsCard } from "../owner/managed-credits-card";
import { usageRange } from "@/lib/billing/usage-period";
import type { UsageGroupRow, UsageOverview } from "@/lib/billing/usage-overview";

const range = usageRange("this_month");
const overview = (over: Partial<UsageOverview> = {}): UsageOverview => ({
  period: "this_month",
  ...range,
  total: 0,
  runs: 0,
  previousTotal: 0,
  last7: 0,
  prev7: 0,
  days: [],
  groups: { kind: [], model: [], member: [], client: [], canvas: [] },
  ...over,
});
const row = (over: Partial<UsageGroupRow>): UsageGroupRow => ({ key: "a", name: "Asha", detail: null, credits: 100, runs: 2, removed: false, ...over });
const render = (node: React.ReactNode) => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);

describe("the Usage page (D597)", () => {
  it("says nothing was used yet instead of empty charts, and keeps the side column", () => {
    const html = render(<UsageDashboard initial={overview()} standing={{ mode: "managed", limit: 500_000 }} approval={null} side={<ManagedCreditsCard limit={500_000} />} />);
    expect(html).toContain("Usage");
    expect(html).toContain("Nothing used this month yet");
    expect(html).toContain("Left this month");
    expect(html).toContain("5,00,000 a month");
    expect(html).not.toContain("Daily use");
  });

  it("shows the chart and the five breakdowns once something is used", () => {
    const used = overview({
      total: 300,
      runs: 3,
      groups: { kind: [row({ key: "video", name: "Video" })], model: [row({ key: "m" })], member: [row({})], client: [row({})], canvas: [row({})] },
    });
    const html = render(<UsageDashboard initial={used} standing={{ mode: "managed", limit: null }} approval={null} side={null} />);
    for (const title of ["Daily use", "By kind of work", "By model", "Members", "Clients", "Canvases"]) expect(html).toContain(title);
    expect(html).not.toMatch(/export|download/i);
  });

  it("opens a row's runs, but deleted work only reads", () => {
    expect(renderToStaticMarkup(<UsageRow row={row({})} total={400} onOpen={() => {}} />)).toContain("<button");
    const removed = renderToStaticMarkup(<UsageRow row={row({ key: null, name: "Deleted work", removed: true })} total={400} onOpen={() => {}} />);
    expect(removed).not.toContain("<button");
    expect(removed).toContain("25% · 2 runs");
  });

  it("shows the top five and See all for the rest", () => {
    const rows = Array.from({ length: 7 }, (_, i) => row({ key: `k${i}`, name: `Person ${i}` }));
    const html = renderToStaticMarkup(<UsageBoard title="Members" rows={rows} total={700} onOpenRow={() => {}} onSeeAll={() => {}} />);
    expect(html).toContain("See all 7");
    expect(html).toContain("Person 4");
    expect(html).not.toContain("Person 5");
  });

  it("offers top-ups only while a plan is running", () => {
    const packs = [{ priceId: "t", productId: "p", name: "Small", description: null, amountMinor: 1_250_000, credits: 100_000 }];
    expect(render(<TopUpSection packs={packs} planRunning={false} planEndsAt={null} />)).toBe("");
    const html = render(<TopUpSection packs={packs} planRunning planEndsAt="2026-12-05T04:00:00Z" />);
    expect(html).toContain('id="top-up"');
    expect(html).toContain("1,00,000 credits");
    expect(html).toContain("₹12,500 + GST");
  });
});
