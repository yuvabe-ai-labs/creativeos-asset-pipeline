"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The one pager for billing's history lists (D588): who used what, the billing log, payments.
// Newest first, so the steps read Newer / Older. Nothing shows when everything fits on one page.
export function HistoryPager({
  page,
  pages,
  busy = false,
  onChange,
  className,
}: {
  page: number;
  pages: number;
  busy?: boolean;
  onChange: (page: number) => void;
  className?: string;
}) {
  if (pages <= 1) return null;
  return (
    <div className={cn("flex items-center justify-between text-xs text-muted-foreground", className)}>
      <span>
        Page {page} of {pages}
      </span>
      <span className="flex gap-1">
        <Button variant="ghost" size="sm" disabled={page <= 1 || busy} onClick={() => onChange(page - 1)}>Newer</Button>
        <Button variant="ghost" size="sm" disabled={page >= pages || busy} onClick={() => onChange(page + 1)}>Older</Button>
      </span>
    </div>
  );
}
