// src/components/admin/credit-breakdown-list.tsx
import type { CreditBreakdownRow } from "@/lib/db/organizations";

// Renders one breakdown dimension (by generation type, or by model) as a simple ranked list
// with a lightweight proportional bar per row — reused for both dimensions in the
// Generations tab, same component, different data.
export function CreditBreakdownList({
  label,
  rows,
}: {
  label: string;
  rows: CreditBreakdownRow[];
}) {
  const total = rows.reduce((sum, r) => sum + r.credits, 0);

  return (
    <div>
      <span className="text-eyebrow text-muted-foreground/80">{label}</span>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No usage this month.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {rows.map((row) => {
            const pct = total > 0 ? (row.credits / total) * 100 : 0;
            return (
              <li key={row.key} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="capitalize text-foreground">{row.key}</span>
                  <span className="text-muted-foreground">
                    {row.credits.toLocaleString()} credits
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/60"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
