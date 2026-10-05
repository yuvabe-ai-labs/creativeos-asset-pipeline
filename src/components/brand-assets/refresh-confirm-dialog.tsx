"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  IMPORT_SOURCE_LABELS,
  SOCIAL_POST_LIMIT,
  SOCIAL_WINDOW_MONTHS,
  WEBSITE_MAX_PAGES,
  type ImportSource,
} from "@/lib/asset-import/constants";
import { importTargetLabel, refreshSince } from "@/lib/asset-import/utils";

export type RefreshPlan = { source: ImportSource; target: string; lastSucceededAt: string | null };

type Props = {
  /** The sources about to refresh, or null when closed. */
  plan: RefreshPlan[] | null;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Says exactly what a refresh will fetch before it runs — each source's scrape is paid for. */
export function RefreshConfirmDialog({ plan, onConfirm, onCancel }: Props) {
  const single = plan?.length === 1 ? IMPORT_SOURCE_LABELS[plan[0].source] : null;
  return (
    <AlertDialog open={plan !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{single ? `Refresh ${single}?` : "Refresh all sources?"}</AlertDialogTitle>
          <AlertDialogDescription render={<div />}>
            <ul className="space-y-1.5">
              {plan?.map((p) => (
                <li key={p.source}>
                  <span className="font-medium text-foreground">{IMPORT_SOURCE_LABELS[p.source]}</span>{" "}
                  {describe(p)}
                </li>
              ))}
            </ul>
            <p className="mt-3">Assets you already have are skipped. It runs in the background.</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Refresh</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function describe(p: RefreshPlan): string {
  if (p.source === "website") {
    return `scans ${importTargetLabel(p.target)} again, up to ${WEBSITE_MAX_PAGES} pages. A website has no post dates, so it is checked in full.`;
  }
  const since = refreshSince(p.lastSucceededAt);
  if (since) {
    const date = new Date(`${since}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
    return `checks ${importTargetLabel(p.target)} for posts since ${date}.`;
  }
  return `imports up to ${SOCIAL_POST_LIMIT} posts from the last ${SOCIAL_WINDOW_MONTHS} months of ${importTargetLabel(p.target)}.`;
}
