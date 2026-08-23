"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIdentity } from "@/hooks/use-identity";
import { subscribeToOrgVersionUpdates } from "@/lib/realtime/org-version-updates";
import { authFetch } from "@/lib/supabase/session-ready";
import { formatRelativeTime } from "@/lib/format/relative-time";
import type { InboxItem } from "@/lib/review/queue";

// D165 — one navbar control, both roles.
//
// R9.6: lives in the app CHROME, because the work it points at spans canvases and clients.
// No single canvas could host it.
//
// R9.5: one control, one meaning — "things waiting on you." For a designer that is their
// own rejected work; for a senior/owner it is what is pending review, plus their own
// rejections. The role split lives server-side in selectInboxFor, so this component never
// branches on role at all — which is why there is no role prop here to get wrong.
export function ReviewInbox() {
  const { orgId, hydrated } = useIdentity();
  const [items, setItems] = useState<InboxItem[]>([]);

  // Pure fetch; returns null when the list should be left as it is (R8.5).
  const fetchItems = useCallback(async (): Promise<InboxItem[] | null> => {
    try {
      const res = await authFetch("/api/review/inbox", { cache: "no-store" });
      if (!res.ok) return null;
      const data = (await res.json()) as { items: InboxItem[] };
      return data.items;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!hydrated || !orgId) return;
    let cancelled = false;

    const refresh = () => {
      void (async () => {
        const next = await fetchItems();
        if (!cancelled && next) setItems(next);
      })();
    };

    refresh();
    const unsubscribe = subscribeToOrgVersionUpdates(orgId, refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [hydrated, orgId, fetchItems]);

  // Nothing waiting: render nothing at all, matching PendingCountPill's zero rule (R5.1).
  // An empty inbox icon is a small standing reproach for no reason.
  if (items.length === 0) return null;

  return (
    <Popover>
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
            <span className="absolute -right-1 -top-1 inline-flex min-w-[1rem] items-center justify-center rounded-full border border-amber-300 bg-amber-50 px-1 text-[0.6rem] font-semibold leading-4 tabular-nums text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
              {items.length}
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

        <div className="flex max-h-96 flex-col gap-1 overflow-y-auto p-1.5">
          {items.map((item) => (
            <Link
              key={item.versionId}
              // R9.3: land on the node itself — the note is read there, beside the controls
              // that act on it. ?review=1 so following a pointer never takes the lock from
              // whoever is editing (R7.2).
              href={`/clients/${item.clientSlug}/canvases/${item.canvasSlug}?review=1&node=${item.nodeId}`}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted"
            >
              {item.output ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.output}
                  alt=""
                  className="size-8 shrink-0 rounded-md border border-border object-cover"
                />
              ) : (
                <span className="size-8 shrink-0 rounded-md border border-border bg-muted" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">
                  {item.nodeTitle || (item.nodeType === "video-gen" ? "Video" : "Image")}
                </span>
                {/* R9.2: a POINTER — what it is and where it lives. That is all it owes the
                    reader; the note itself is read on the node. */}
                <span className="block truncate text-[0.7rem] text-muted-foreground">
                  {item.clientName} · {item.canvasName} · {formatRelativeTime(item.createdAt)}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
