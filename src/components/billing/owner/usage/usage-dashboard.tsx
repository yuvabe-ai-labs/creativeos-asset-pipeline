"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Inbox, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUsageOverview } from "@/hooks/queries/billing-usage";
import { USAGE_KINDS } from "@/lib/billing/usage-kinds";
import { USAGE_PERIODS, USAGE_PERIOD_LABEL, type UsagePeriod } from "@/lib/billing/usage-period";
import type { UsageGroupBy, UsageOverview } from "@/lib/billing/usage-overview";
import { usageNotice, usageTiles, type UsageNoticeAction, type UsageStanding } from "@/lib/billing/usage-standing";
import type { PriceApproval } from "@/lib/billing/price-approval-copy";
import { BillingNotice } from "../billing-notice";
import { PayNowButton } from "../pay-now-button";
import { PriceApprovalBanner } from "../price-approval-banner";
import { UsageBoard } from "./usage-board";
import { UsageDailyCard } from "./usage-daily-card";
import { UsageSheet, type UsageSheetView } from "./usage-sheet";
import { UsageTiles } from "./usage-tiles";
import { UsageSkeleton } from "./usage-skeleton";

function NoticeAction({ action }: { action: UsageNoticeAction | null }) {
  if (action === "pay") return <PayNowButton />;
  if (action === "plans") return <Button nativeButton={false} render={<Link href="/billing/plans" />}>See plans</Button>;
  if (action === "top_up") return <Button nativeButton={false} render={<a href="#top-up" />}>Top up</Button>;
  return null;
}

// The owner's Usage page, direction B "Overview" (D597): four numbers, at most one notice, daily use
// by kind of work, spend by kind and model, the top members, clients and canvases, and `side` (the
// plan, credits, top-ups and payments, or a managed agency's note) in a column on the right that
// follows the charts on a phone. One read per period; this month comes with the page.
export function UsageDashboard({ initial, standing, approval, side }: { initial: UsageOverview; standing: UsageStanding; approval: PriceApproval | null; side: ReactNode }) {
  const [period, setPeriod] = useState<UsagePeriod>("this_month");
  const [sheet, setSheet] = useState<UsageSheetView | null>(null);
  const thisMonth = useUsageOverview("this_month", initial);
  const picked = useUsageOverview(period, initial);
  const current = thisMonth.data && picked.data ? { month: thisMonth.data, period: picked.data } : null;
  const failed = thisMonth.isError || picked.isError;
  const notice = thisMonth.data ? usageNotice(standing, thisMonth.data) : null;
  const paymentDue = standing.mode === "plans" && standing.plan?.status === "payment_due";
  const open = (by: UsageGroupBy) => (row: UsageOverview["groups"][UsageGroupBy][number]) => setSheet({ view: "runs", by, row, back: null });
  const board = (o: UsageOverview, by: UsageGroupBy, title: string) => (
    <UsageBoard title={title} rows={o.groups[by]} total={o.total} onOpenRow={open(by)} onSeeAll={() => setSheet({ view: "rows", by })} />
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Usage</h1>
          <p className="text-sm text-muted-foreground">Only you can see this page.</p>
        </div>
        <Select value={period} onValueChange={(v) => {
            if (!v) return;
            setPeriod(v as UsagePeriod);
            setSheet(null);
          }}>
          <SelectTrigger className="h-10 bg-card" aria-label="Period">
            <SelectValue>{USAGE_PERIOD_LABEL[period]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {USAGE_PERIODS.map((p) => (
              <SelectItem key={p} value={p}>{USAGE_PERIOD_LABEL[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!paymentDue && approval ? (
        <PriceApprovalBanner approval={approval} />
      ) : notice ? (
        <BillingNotice tone={notice.tone} title={notice.title} action={<NoticeAction action={notice.action} />}>{notice.body}</BillingNotice>
      ) : null}

      {failed ? (
        <Card className="items-center gap-1.5 px-4 py-14 text-center text-sm text-muted-foreground shadow-card" role="alert">
          <h2 className="font-display text-base font-semibold text-foreground">Usage couldn&apos;t be loaded</h2>
          <p>Nothing has changed. Try again in a moment.</p>
          <Button className="mt-2.5" variant="outline" onClick={() => void Promise.all([thisMonth.refetch(), picked.refetch()])}>
            <RefreshCw strokeWidth={1.5} />
            Try again
          </Button>
        </Card>
      ) : current ? (
        <UsageTiles tiles={usageTiles(standing, current.period, current.month)} />
      ) : (
        <UsageSkeleton part="tiles" />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {failed ? null : !current ? (
            <UsageSkeleton part="main" />
          ) : current.period.total === 0 ? (
            <Card className="items-center gap-1.5 px-4 py-14 text-center text-sm text-muted-foreground shadow-card">
              <Inbox className="size-5" strokeWidth={1.5} aria-hidden />
              <h2 className="font-display text-base font-semibold text-foreground">Nothing used {period === "this_month" ? "this month" : "last month"} yet</h2>
              <p>Every AI run your team makes shows here: by kind of work, model, person, client and canvas.</p>
            </Card>
          ) : (
            <>
              <UsageDailyCard days={current.period.days} kinds={USAGE_KINDS.filter((k) => current.period.groups.kind.some((r) => r.key === k))} />
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {board(current.period, "kind", "By kind of work")}
                {board(current.period, "model", "By model")}
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                {board(current.period, "member", "Members")}
                {board(current.period, "client", "Clients")}
                {board(current.period, "canvas", "Canvases")}
              </div>
            </>
          )}
        </div>
        <aside className="flex min-w-0 flex-col gap-4">{side}</aside>
      </div>

      {current && <UsageSheet overview={current.period} view={sheet} onChange={setSheet} />}
    </div>
  );
}
