// src/components/admin/usage-trend-chart.tsx
"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonthlyCreditPoint } from "@/lib/db/organizations";

// 6-month credit-usage trend for the admin Generations tab. Neutral bars, current month
// highlighted in the brand purple (used sparingly, per the design system) — the one accent
// on an otherwise quiet chart. No springs/bounce (design system rule) — recharts' default
// transitions are simple opacity/height tweens, not spring physics, so no easing override
// is needed here.
export function UsageTrendChart({ data }: { data: MonthlyCreditPoint[] }) {
  const chartData = data.map((point, i) => ({
    label: new Date(point.month).toLocaleDateString(undefined, {
      month: "short",
      year: "numeric",
    }),
    credits: point.creditsUsed,
    isCurrent: i === data.length - 1,
  }));

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
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
            {chartData.map((point) => (
              <Cell
                key={point.label}
                fill={point.isCurrent ? "var(--primary)" : "var(--muted-foreground)"}
                fillOpacity={point.isCurrent ? 1 : 0.25}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
