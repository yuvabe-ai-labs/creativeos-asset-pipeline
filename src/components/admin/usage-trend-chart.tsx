// src/components/admin/usage-trend-chart.tsx
"use client";

import { useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CreditHistoryPoint } from "@/lib/db/organizations";

type Granularity = "day" | "month" | "year";

const GRANULARITY_LABEL: Record<Granularity, string> = {
  day: "By day",
  month: "By month",
  year: "By year",
};

function formatLabel(period: string, granularity: Granularity): string {
  const date = new Date(period);
  if (granularity === "day") {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  if (granularity === "year") {
    return date.toLocaleDateString(undefined, { year: "numeric" });
  }
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

// Credit-usage trend for the admin Generations tab, switchable between day (trailing 30
// days), month (trailing 6 months — the original view), and year (trailing 5 years) via the
// dropdown. All three datasets are fetched once, server-side, on page load — they're cheap
// aggregate queries, not worth an on-demand API route like the generations table's
// pagination — so switching granularity here is a pure client-side re-render, no network call.
// Neutral bars, most-recent period highlighted in the brand purple (used sparingly, per the
// design system) — the one accent on an otherwise quiet chart. No springs/bounce (design
// system rule) — recharts' default transitions are simple opacity/height tweens, not spring
// physics, so no easing override is needed here.
export function UsageTrendChart({
  daily,
  monthly,
  yearly,
}: {
  daily: CreditHistoryPoint[];
  monthly: CreditHistoryPoint[];
  yearly: CreditHistoryPoint[];
}) {
  const [granularity, setGranularity] = useState<Granularity>("month");

  const data =
    granularity === "day" ? daily : granularity === "year" ? yearly : monthly;

  const chartData = data.map((point, i) => ({
    label: formatLabel(point.period, granularity),
    credits: point.creditsUsed,
    isCurrent: i === data.length - 1,
  }));

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Select
          value={granularity}
          onValueChange={(v) => v && setGranularity(v as Granularity)}
        >
          <SelectTrigger size="sm" className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(GRANULARITY_LABEL) as Granularity[]).map((g) => (
              <SelectItem key={g} value={g}>
                {GRANULARITY_LABEL[g]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              interval={granularity === "day" ? 4 : 0}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={40}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid var(--border)",
                fontSize: 12,
              }}
              formatter={(value) => [`${Number(value).toLocaleString()} credits`, "Used"]}
            />
            <Bar dataKey="credits" radius={[4, 4, 0, 0]}>
              {chartData.map((point, i) => (
                <Cell
                  key={`${point.label}-${i}`}
                  fill={point.isCurrent ? "var(--primary)" : "var(--muted-foreground)"}
                  fillOpacity={point.isCurrent ? 1 : 0.25}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
