"use client";

import { useState } from "react";
import { Building2, ChevronDown, Info, TriangleAlert, Wallet } from "lucide-react";
import type { CreditReview, ReviewNote } from "@/lib/admin/credits-change";
import { AgenciesBlock } from "@/components/admin/models/change-prices/agencies-block";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CreditExampleRuns } from "./credit-example-runs";
import { TypicalRunsTable } from "./typical-runs-table";

function Note({ note, icon }: { note: ReviewNote; icon?: "wallet" | "agencies" }) {
  const Icon = icon === "wallet" ? Wallet : icon === "agencies" ? Building2 : note.tone === "warn" ? TriangleAlert : Info;
  return (
    <div className={cn("flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[0.8125rem]", note.tone === "warn" ? "border-warning/50 bg-warning/10" : "border-primary/25 bg-primary/5")}>
      <Icon aria-hidden strokeWidth={1.5} className={cn("mt-0.5 size-4 shrink-0", note.tone === "warn" ? "text-warning-text" : "text-primary")} />
      <span>{note.text}</span>
    </div>
  );
}

/**
 * Review: what changes and from when, the change it replaces, three example runs, the agencies' month
 * and what held credits buy, the warnings, and every typical run and agency behind a disclosure.
 */
export function CreditReviewStep({ review }: { review: CreditReview }) {
  const [details, setDetails] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.8125rem]">
        <span className="font-semibold">{review.summary}</span>, {review.startText}
      </p>
      {review.replaced && (
        <div className="rounded-xl border border-warning/50 bg-warning/10 px-4 py-3 text-[0.8125rem]">
          <p className="flex items-start gap-2.5">
            <TriangleAlert aria-hidden strokeWidth={1.5} className="mt-0.5 size-4 shrink-0 text-warning-text" />
            <span className="font-semibold">{review.replaced.title}</span>
          </p>
          <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 gap-y-1 border-t border-warning/40 pt-2 tabular-nums">
            <dt className="text-xs text-muted-foreground">Setting</dt>
            <dd className="text-xs text-muted-foreground">Scheduled</dd>
            <dd className="text-xs text-muted-foreground">Saved instead</dd>
            {review.replaced.rows.map((r) => (
              <div key={r.label} className="contents">
                <dt>{r.label}</dt>
                <dd>{r.scheduled}</dd>
                <dd className={cn(r.saved === "Same" ? "text-muted-foreground" : "font-semibold")}>{r.saved}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <CreditExampleRuns rows={review.examples} />
      {review.agencySummary && <Note note={{ tone: "info", text: review.agencySummary }} icon="agencies" />}
      {review.holdNote && <Note note={review.holdNote} icon="wallet" />}
      {review.warnings.map((w) => (
        <Note key={w.text} note={w} />
      ))}
      <div>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={details}
          aria-controls="credits-review-details"
          onClick={() => setDetails((d) => !d)}
          className="-ml-2 text-muted-foreground aria-expanded:text-foreground"
        >
          Every model and agency
          <ChevronDown aria-hidden strokeWidth={1.5} className={cn("transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]", details && "rotate-180")} />
        </Button>
        {details && (
          <div id="credits-review-details" className="mt-2 flex flex-col gap-4">
            <TypicalRunsTable rows={review.rows} />
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Agencies affected</h3>
              <AgenciesBlock label="a model" rows={review.agencies} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
