"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchUsage, fetchUsageRuns } from "@/services/billing-usage.service";
import type { UsageBy, UsagePeriod } from "@/lib/billing/usage-period";

// Who used what (D583). Read-only, so nothing invalidates it; a minute of freshness is plenty for
// a monthly view, and switching groups keeps the last table on screen while the next loads.
export const usageKeys = {
  all: ["billing-usage"] as const,
  summary: (by: UsageBy, period: UsagePeriod) => [...usageKeys.all, "summary", by, period] as const,
  runs: (by: UsageBy, key: string | null, period: UsagePeriod, page: number) => [...usageKeys.all, "runs", by, key, period, page] as const,
};

export function useUsage(by: UsageBy, period: UsagePeriod) {
  return useQuery({ queryKey: usageKeys.summary(by, period), queryFn: () => fetchUsage(by, period), staleTime: 60_000, placeholderData: keepPreviousData });
}

export function useUsageRuns(by: UsageBy, key: string | null, period: UsagePeriod, page: number, enabled: boolean) {
  return useQuery({ queryKey: usageKeys.runs(by, key, period, page), queryFn: () => fetchUsageRuns(by, key, period, page), staleTime: 60_000, enabled, placeholderData: keepPreviousData });
}
