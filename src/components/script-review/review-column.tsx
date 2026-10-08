// src/components/script-review/review-column.tsx
"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ActivityLine } from "@/lib/script-review/types";
import { ActivityList } from "./activity-list";
import { CommentsColumn } from "./comments-column";
import { useReviewSurface } from "./review-surface-context";

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
        <SheetContent side="right" className="w-full gap-8 overflow-y-auto p-4 sm:max-w-md">
          <SheetHeader className="p-0">
            <SheetTitle>Comments and activity</SheetTitle>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    </>
  );
}
