"use client";

import { useState } from "react";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIdentity } from "@/hooks/use-identity";
import { useReviewList } from "@/hooks/use-review-list";
import { ReviewItemThumb } from "@/components/review/review-item-thumb";
import { ReviewListSkeleton } from "@/components/review/review-list-skeleton";
import { InfiniteScrollSentinel } from "@/components/review/infinite-scroll-sentinel";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { cn } from "@/lib/utils";

// D165 — one navbar control, both roles.
//
// R9.6: lives in the app CHROME, because the work it points at spans canvases and clients.
// No single canvas could host it.
//
// R9.5: one control, one meaning — "things waiting on you." For a designer that is their
// own rejected work; for a senior/owner it is what is pending review, plus their own
// rejections. The role split lives server-side, so this component never branches on role —
// which is why there is no role prop here to get wrong.
export function ReviewInbox() {
  const { hydrated } = useIdentity();
  const [open, setOpen] = useState(false);
  // Kept subscribed while closed so the badge count is live — the badge IS the feature
  // (R9.1); a count that only updates when you open the popover would be pointless.
  const { items, loading, loadingMore, hasMore, loadMore } = useReviewList(
    "/api/review/inbox",
    hydrated,
  );

  // Nothing waiting: render nothing at all, matching PendingCountPill's zero rule (R5.1).
  // An empty inbox icon is a small standing reproach for no reason.
  if (!hydrated || (!loading && items.length === 0)) return null;
  // Don't flash an empty badge during the very first load.
  if (loading && items.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="relative"
            aria-label={`${items.length} waiting on you`}
          >
            <Inbox className="size-4 stroke-[1.5]" />
            {/* Amber, matching `pending` everywhere else (R5.8). Never red — that is
                reserved for changes_requested on the node itself (R5.9). */}
            <span
              className={cn(
                "absolute -right-1 -top-1 inline-flex min-w-[1rem] items-center justify-center",
                "rounded-full border border-amber-300 bg-amber-50 px-1 text-[0.6rem] font-semibold",
                "leading-4 tabular-nums text-amber-800",
                "dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
              )}
            >
              {items.length}
              {hasMore ? "+" : ""}
            </span>
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-baseline justify-between border-b border-border px-3 py-2">
          <span className="text-eyebrow !text-[0.65rem]">Waiting on you</span>
          {/* R9.8: this popover is ORG-WIDE; the canvas drawer is scoped to one canvas, so
              the two numbers legitimately disagree and each must say what it counts. */}
          <span className="text-[0.7rem] text-muted-foreground">everywhere</span>
        </div>

        <div className="max-h-96 overflow-y-auto p-1.5">
          {loading ? (
            <ReviewListSkeleton rows={4} />
          ) : (
            <>
              <div className="flex flex-col gap-0.5">
                {items.map((item) => {
                  const label =
                    item.nodeTitle || (item.nodeType === "video-gen" ? "Video" : "Image");
                  return (
                    <Link
                      key={item.versionId}
                      onClick={() => setOpen(false)}
                      // R9.3: land on the node itself — the note is read there, beside the
                      // controls that act on it. ?review=1 so following a pointer never
                      // takes the lock from whoever is editing (R7.2).
                      href={`/clients/${item.clientSlug}/canvases/${item.canvasSlug}?review=1&node=${item.nodeId}`}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted"
                    >
                      <ReviewItemThumb
                        output={item.output}
                        nodeType={item.nodeType}
                        size={32}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-medium">{label}</span>
                          {/* The one thing a pointer must distinguish: work sent BACK to
                              you reads differently from work waiting ON you. */}
                          {item.approvalStatus === "changes_requested" && (
                            <span className="shrink-0 rounded-full bg-destructive/10 px-1.5 text-[0.6rem] font-semibold text-destructive">
                              Sent back
                            </span>
                          )}
                          {/* D170: the maker's approval notification — same row shape,
                              opposite news. Emerald matches STATUS_META.approved in
                              InlineApprovalBar, never the destructive token rejection uses. */}
                          {item.approvalStatus === "approved" && (
                            <span className="shrink-0 rounded-full bg-emerald-500/10 px-1.5 text-[0.6rem] font-semibold text-emerald-700 dark:text-emerald-400">
                              Approved
                            </span>
                          )}
                        </span>
                        {/* R9.2: a POINTER — what it is and where it lives. That is all it
                            owes the reader; the note itself is read on the node. */}
                        <span className="block truncate text-[0.7rem] text-muted-foreground">
                          {item.clientName} · {item.canvasName} ·{" "}
                          {formatRelativeTime(item.createdAt)}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
              {hasMore && (
                <InfiniteScrollSentinel onVisible={loadMore} loading={loadingMore} />
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
