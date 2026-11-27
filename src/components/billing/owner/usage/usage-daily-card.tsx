"use client";

import { useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatShortDay } from "@/lib/billing/dates";
import { USAGE_KINDS, USAGE_KIND_LABEL, type UsageKind } from "@/lib/billing/usage-kinds";
import { REMOVED_NAME, type UsageDay } from "@/lib/billing/usage-overview";

const n = (v: number) => Math.round(v).toLocaleString("en-IN");
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const longDay = (day: string) => `${WEEKDAY[new Date(`${day}T00:00:00Z`).getUTCDay()]} ${formatShortDay(day)}`;

// Neutral shades of one token, darkest for the kind that usually costs most; the picked kind takes
// the brand colour, the one accent on the chart (as the admin usage chart).
const SHADE: Record<UsageKind | "removed", number> = { video: 0.8, image: 0.55, voice: 0.35, text: 0.2, removed: 0.1 };
const SERIES = [...USAGE_KINDS, "removed"] as const;
const label = (k: (typeof SERIES)[number]) => (k === "removed" ? REMOVED_NAME : USAGE_KIND_LABEL[k]);

// Daily use on the Usage page (D597): a bar a day, split by kind of work. Pick a kind to pick it out;
// pick a day for its numbers (the latest day with runs to start with). Recharts' default tweens
// have no spring, so no easing override.
export function UsageDailyCard({ days, kinds }: { days: UsageDay[]; kinds: UsageKind[] }) {
  const [focus, setFocus] = useState<UsageKind | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const latest = [...days].reverse().find((d) => d.total > 0)?.day ?? null;
  const day = days.find((d) => d.day === (picked ?? latest)) ?? null;
  const data = days.map((d) => ({ day: d.day, ...d.kinds, removed: d.removed }));
  const hasRemoved = days.some((d) => d.removed > 0);
  const series = SERIES.filter((k) => (k === "removed" ? hasRemoved : kinds.includes(k)));

  return (
    <Card className="gap-3 p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold tracking-tight">Daily use</h2>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pick out a kind of work">
          {[null, ...kinds].map((k) => (
            <Button
              key={k ?? "all"}
              variant="outline"
              size="sm"
              aria-pressed={focus === k}
              className="rounded-full bg-card aria-pressed:border-primary aria-pressed:bg-primary/5 aria-pressed:text-primary"
              onClick={() => setFocus(k)}
            >
              {k && (
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ background: focus === k ? "var(--primary)" : "var(--muted-foreground)", opacity: focus === k ? 1 : SHADE[k] }}
                />
              )}
              {k ? USAGE_KIND_LABEL[k] : "All kinds"}
            </Button>
          ))}
        </div>
      </div>
      <div className="h-48 w-full" role="img" aria-label="Credits used each day, by kind of work">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 0, left: 0, bottom: 0 }}
            onClick={(state) => {
              const i = Number(state?.activeTooltipIndex);
              if (Number.isInteger(i) && days[i] && days[i].total > 0) setPicked(days[i].day);
            }}
          >
            <XAxis dataKey="day" tickLine={false} axisLine={false} minTickGap={24} tickFormatter={formatShortDay} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => n(v)} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}
              labelFormatter={(d) => longDay(String(d))}
              formatter={(value, name) => [`${n(Number(value))} credits`, name]}
            />
            {series.map((k, i) => (
              <Bar
                key={k}
                dataKey={k}
                name={label(k)}
                stackId="day"
                fill={focus === k ? "var(--primary)" : "var(--muted-foreground)"}
                fillOpacity={focus === k ? 1 : focus ? SHADE[k] * 0.5 : SHADE[k]}
                radius={i === series.length - 1 ? [3, 3, 0, 0] : 0}
                cursor="pointer"
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {day && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{longDay(day.day)}</span>
          <span>
            <span className="text-foreground tabular-nums">{n(day.total)}</span> credits · {day.runs === 1 ? "1 run" : `${n(day.runs)} runs`}
          </span>
          {series.map((k) => {
            const v = k === "removed" ? day.removed : day.kinds[k];
            return v > 0 ? <span key={k}>{label(k)} <span className="tabular-nums">{n(v)}</span></span> : null;
          })}
        </p>
      )}
    </Card>
  );
}
