"use client";

import { Info, TriangleAlert } from "lucide-react";
import type { CreditReview, ReviewNote } from "@/lib/admin/credits-change";
import { cn } from "@/lib/utils";
import { CreditExampleRuns } from "./credit-example-runs";

function Note({ note }: { note: ReviewNote }) {
  const Icon = note.tone === "warn" ? TriangleAlert : Info;
  return (
    <p className={cn("flex items-start gap-2 text-[0.8125rem]", note.tone === "warn" ? "text-warning-text" : "text-muted-foreground")}>
      <Icon aria-hidden strokeWidth={1.5} className="mt-0.5 size-4 shrink-0" />
      <span>{note.text}</span>
    </p>
  );
}

/**
 * Review, only what a decision needs: what changes and from when, the change it replaces in one
 * line, three example runs, one line on agencies and the credits they hold, and a note only when
 * something is surprising (a margin that looks like a typo, rounding, another scheduled change).
 */
export function CreditReviewStep({ review }: { review: CreditReview }) {
  const replaced = review.replaced;
  const replacedWhat = replaced?.rows
    .map((r) => `${r.label.toLowerCase()} ${r.scheduled}`)
    .join(", ");
  const effect = [review.agencySummary, review.holdNote?.text].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[0.8125rem]">
        <span className="font-semibold">{review.summary}</span>, {review.startText}
      </p>
      {replaced && (
        <Note note={{ tone: "warn", text: `${replaced.title.replace(/\.$/, "")} (${replacedWhat}).` }} />
      )}
      <CreditExampleRuns rows={review.examples} />
      {effect && <p className="text-[0.8125rem] text-muted-foreground">{effect}</p>}
      {review.warnings.map((w) => (
        <Note key={w.text} note={w} />
      ))}
    </div>
  );
}
