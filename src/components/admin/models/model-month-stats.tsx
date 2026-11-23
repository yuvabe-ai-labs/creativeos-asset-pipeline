import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function Figure({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-eyebrow text-[0.7rem] text-muted-foreground/80">{label}</span>
      <span className={cn("text-lg font-medium", warn && "text-warning-text")}>{value}</span>
    </div>
  );
}

export function ModelMonthStats({
  month,
  runs,
  costUsd,
  credits,
  unpriced,
}: {
  month: string;
  runs: number;
  costUsd: number;
  credits: number;
  unpriced: number;
}) {
  return (
    <Card className="px-6">
      <h2 className="text-eyebrow text-[0.7rem] text-muted-foreground/80">{month}</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Figure label="Runs" value={runs.toLocaleString("en-US")} />
        <Figure label="Provider cost" value={`$${costUsd.toFixed(2)}`} />
        <Figure label="Credits charged" value={credits.toLocaleString("en-US")} />
        <Figure label="Unpriced runs" value={unpriced.toLocaleString("en-US")} warn={unpriced > 0} />
      </div>
    </Card>
  );
}
