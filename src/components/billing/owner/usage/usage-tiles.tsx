import { Card } from "@/components/ui/card";
import type { Tone, UsageTile } from "@/lib/billing/usage-standing";
import { cn } from "@/lib/utils";

const VALUE: Record<"warn" | "bad", string> = { warn: "text-warning-text", bad: "text-destructive-text" };
// The credit bar's colours from Admin's agencies list: grey until it is close.
const BAR = { normal: "bg-muted-foreground/45", warn: "bg-warning", bad: "bg-destructive" } as const;
const bar = (tone: Tone) => BAR[tone ?? "normal"];

// The four numbers at the top of the Usage page (D597): two by two on a phone, a row of four wider.
export function UsageTiles({ tiles }: { tiles: UsageTile[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {tiles.map((t) => (
        <Card key={t.label} className="min-w-0 gap-1.5 p-5 shadow-card">
          <span className="text-sm text-muted-foreground">{t.label}</span>
          <span className={cn("font-display text-2xl font-semibold tracking-tight tabular-nums", t.tone && VALUE[t.tone])}>{t.value}</span>
          {t.meter && (
            <div
              role="meter"
              aria-label={`${t.label}: share used`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(t.meter.share * 100)}
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            >
              <div className={cn("h-full rounded-full", bar(t.meter.tone))} style={{ width: `${Math.min(100, t.meter.share * 100)}%` }} />
            </div>
          )}
          <span className="text-xs text-muted-foreground">{t.sub}</span>
        </Card>
      ))}
    </div>
  );
}
