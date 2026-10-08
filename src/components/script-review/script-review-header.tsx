// src/components/script-review/script-review-header.tsx
"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { PublicScriptReview } from "@/lib/script-review/assemble";
import { formatShortDay } from "@/lib/script-review/utils";

/** The board's header: "Yuvabe Studios × Jackfruit365 · for your review", the title, and
 *  "Version 2 · shared 10 Oct · read-only" — or, once approved, the record line. */
export function ScriptReviewHeader({
  review,
  name,
  onChangeName,
  action,
}: {
  review: PublicScriptReview;
  name: string | null;
  onChangeName: () => void;
  action?: ReactNode;
}) {
  const { version, approval } = review;
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex flex-col gap-1">
        <p className="text-eyebrow text-muted-foreground">
          {review.fromName} × {review.forName} · for your review
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{version.doc.header.title}</h1>
        <p className="text-sm text-muted-foreground">
          Version {version.number} · shared {formatShortDay(version.sharedAt)} · read-only
        </p>
        {approval && (
          <p className="text-sm font-medium text-foreground">
            Approved on {formatShortDay(approval.at)} by {approval.byName}. This page is now a record of what was approved.
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          {name && <>{name} · </>}
          <Button variant="link" className="h-auto p-0 text-sm" onClick={onChangeName}>
            change
          </Button>
        </p>
        {action}
      </div>
    </header>
  );
}
