// src/components/script-review/review-column.tsx
"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ActivityLine } from "@/lib/script-review/types";
import { ActivityList } from "./activity-list";
import { CommentsColumn } from "./comments-column";
import { useReviewSurface } from "./review-surface-context";

/** The sheet's size: full width on a phone. The `data-[side=right]:` prefix is needed to beat the
 *  sheet's own right-side width (an attribute selector outranks a plain class). */
export const REVIEW_SHEET_CLASS = "gap-8 overflow-y-auto p-4 data-[side=right]:w-full data-[side=right]:sm:max-w-md";

/** Spec 4 §4, §6 (review board, 4.16): Comments and Activity — beside the board from `xl`, and below
 *  that in a sheet over the page, opened by the Comments button or any part's marker. */
export function ReviewColumn({ activity }: { activity: ActivityLine[] }) {
  const { columnOpen, setColumnOpen } = useReviewSurface();
  const body = (
    <>
      <CommentsColumn />
      <ActivityList lines={activity} />
    </>
  );
  return (
    <>
      <aside
        aria-label="Comments and activity"
        className="hidden min-w-0 flex-col gap-8 xl:sticky xl:top-6 xl:flex xl:max-h-[calc(100dvh-3rem)] xl:overflow-y-auto"
      >
        {body}
      </aside>
      <Sheet open={columnOpen} onOpenChange={setColumnOpen}>
        <SheetContent side="right" className={REVIEW_SHEET_CLASS}>
          <SheetHeader className="p-0">
            <SheetTitle>Comments and activity</SheetTitle>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    </>
  );
}
