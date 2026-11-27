import { readJson } from "./read-json";
import type { UsageBy, UsagePeriod } from "@/lib/billing/usage-period";
import type { UsageOverview } from "@/lib/billing/usage-overview";
import type { UsageRunsPage } from "@/lib/db/billing-usage";

// The Usage page (D597): one call per route, typed through readJson.
export async function fetchUsageOverview(period: UsagePeriod): Promise<UsageOverview> {
  return readJson<UsageOverview>(await fetch(`/api/billing/usage?period=${period}`), "Could not load usage.");
}

export async function fetchUsageRuns(by: UsageBy, key: string | null, period: UsagePeriod, page: number): Promise<UsageRunsPage> {
  const qs = new URLSearchParams({ by, period, page: String(page) });
  if (key) qs.set("key", key);
  return readJson<UsageRunsPage>(await fetch(`/api/billing/usage/runs?${qs}`), "Could not load the runs.");
}
