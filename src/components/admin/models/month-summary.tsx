import { Check, TriangleAlert } from "lucide-react";
import type { MonthSummary as Summary } from "@/lib/admin/model-page";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-display text-[1.0625rem] font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/** "This month": runs, what we paid and credits charged for this model. */
export function MonthSummary({ month, summary }: { month: string; summary: Summary | null }) {
  return (
    <section aria-labelledby="month-title">
      <h2 id="month-title" className="mb-3 font-display text-base font-semibold tracking-tight">
        This month <span className="font-sans text-xs font-medium text-muted-foreground">{month}</span>
      </h2>
      {summary ? (
        <>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Runs" value={summary.runs} />
            <Stat label="We paid" value={summary.paid} />
            <Stat label="Credits charged" value={summary.credits} />
          </dl>
          <p className={`mt-3 flex items-center gap-1.5 text-xs ${summary.note.tone === "warn" ? "text-warning-text" : "text-muted-foreground"}`}>
            {summary.note.tone === "warn" ? (
              <TriangleAlert aria-hidden strokeWidth={1.5} className="size-3.5 shrink-0" />
            ) : (
              <Check aria-hidden strokeWidth={1.5} className="size-3.5 shrink-0" />
            )}
            {summary.note.text}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No runs yet this month.</p>
      )}
    </section>
  );
}
