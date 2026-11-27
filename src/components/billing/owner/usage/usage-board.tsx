import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { UsageGroupRow } from "@/lib/billing/usage-overview";
import { UsageRow } from "./usage-row";

// A breakdown card on the Usage page (D597): its biggest rows, and See all when there are more.
export function UsageBoard({
  title,
  rows,
  total,
  limit = 5,
  onOpenRow,
  onSeeAll,
}: {
  title: string;
  rows: UsageGroupRow[];
  total: number;
  limit?: number;
  onOpenRow: (row: UsageGroupRow) => void;
  onSeeAll: () => void;
}) {
  return (
    <Card className="gap-0 py-0 shadow-card">
      <div className="flex min-h-14 items-center justify-between gap-2 px-5 pt-4 pb-2">
        <h2 className="font-display text-base font-semibold tracking-tight">{title}</h2>
        {rows.length > limit && (
          <Button variant="ghost" size="sm" onClick={onSeeAll}>
            See all {rows.length.toLocaleString("en-IN")}
          </Button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">Nothing in this period.</p>
      ) : (
        <ul className="flex flex-col pb-2">
          {rows.slice(0, limit).map((row) => (
            <li key={`${row.removed ? "removed" : row.key ?? "none"}`}>
              <UsageRow row={row} total={total} onOpen={() => onOpenRow(row)} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
