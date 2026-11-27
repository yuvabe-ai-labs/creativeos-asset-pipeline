"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchUsageOverview, fetchUsageRuns } from "@/services/billing-usage.service";
import type { UsageBy, UsagePeriod } from "@/lib/billing/usage-period";
import type { UsageOverview } from "@/lib/billing/usage-overview";

// The Usage page (D597). Read-only, so nothing invalidates it; a minute of freshness is plenty for
// a monthly view. This month comes with the page (`initial`), so opening it makes no request.
export const usageKeys = {
  all: ["billing-usage"] as const,
  overview: (period: UsagePeriod) => [...usageKeys.all, "overview", period] as const,
  runs: (by: UsageBy, key: string | null, period: UsagePeriod, page: number) => [...usageKeys.all, "runs", by, key, period, page] as const,
};

export function useUsageOverview(period: UsagePeriod, initial?: UsageOverview) {
  return useQuery({
    queryKey: usageKeys.overview(period),
    queryFn: () => fetchUsageOverview(period),
    staleTime: 60_000,
    initialData: initial && initial.period === period ? initial : undefined,
  });
}

export function useUsageRuns(by: UsageBy, key: string | null, period: UsagePeriod, page: number, enabled: boolean) {
  return useQuery({ queryKey: usageKeys.runs(by, key, period, page), queryFn: () => fetchUsageRuns(by, key, period, page), staleTime: 60_000, enabled, placeholderData: keepPreviousData });
}
