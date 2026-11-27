import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UsageGroupRow } from "@/lib/billing/usage-overview";

const n = (v: number) => Math.round(v).toLocaleString("en-IN");

function share(credits: number, total: number): string {
  if (total <= 0) return "0%";
  const pct = (credits / total) * 100;
  return pct > 0 && pct < 1 ? "under 1%" : `${Math.round(pct)}%`;
}

// One line of a Usage breakdown (D597): a member, client, canvas, model or kind of work, its credits,
// its share and runs, and a bar for the share. Opens its runs; deleted work can't be opened.
export function UsageRow({ row, total, onOpen }: { row: UsageGroupRow; total: number; onOpen?: () => void }) {
  const width = total > 0 ? Math.min(100, (row.credits / total) * 100) : 0;
  const body = (
    <span className="flex w-full min-w-0 flex-col gap-1.5">
      <span className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{row.name}</span>
          {row.detail && <span className="truncate text-xs font-normal text-muted-foreground">{row.detail}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="flex flex-col items-end">
            <span className="text-sm font-medium tabular-nums">{n(row.credits)}</span>
            <span className="text-xs font-normal text-muted-foreground tabular-nums">
              {share(row.credits, total)} · {row.runs === 1 ? "1 run" : `${n(row.runs)} runs`}
            </span>
          </span>
          {onOpen && !row.removed && <ChevronRight className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />}
        </span>
      </span>
      <span className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className="block h-full rounded-full bg-muted-foreground/45" style={{ width: `${width}%` }} />
      </span>
    </span>
  );
  if (!onOpen || row.removed) return <div className="px-5 py-3">{body}</div>;
  return (
    <Button variant="ghost" className="h-auto w-full justify-start rounded-none px-5 py-3 text-left whitespace-normal hover:bg-muted/40" onClick={onOpen}>
      {body}
    </Button>
  );
}
