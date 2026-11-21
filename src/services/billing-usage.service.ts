import { readJson } from "./read-json";
import type { UsageBy, UsagePeriod } from "@/lib/billing/usage-period";
import type { UsageRow, UsageRunsPage } from "@/lib/db/billing-usage";

export type UsageSummary = { rows: UsageRow[]; total: number };

// Who used what (D524): one call per route, typed through readJson.
export async function fetchUsage(by: UsageBy, period: UsagePeriod): Promise<UsageSummary> {
  return readJson<UsageSummary>(await fetch(`/api/billing/usage?by=${by}&period=${period}`), "Could not load usage.");
}

export async function fetchUsageRuns(by: UsageBy, key: string | null, period: UsagePeriod, page: number): Promise<UsageRunsPage> {
  const qs = new URLSearchParams({ by, period, page: String(page) });
  if (key) qs.set("key", key);
  return readJson<UsageRunsPage>(await fetch(`/api/billing/usage/runs?${qs}`), "Could not load the runs.");
}
