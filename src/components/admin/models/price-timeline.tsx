"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { cancelAiModelPriceAction, undoAiModelPriceAction } from "@/lib/actions/ai-models";
import type { PriceTimeline as Timeline, TimelineItem } from "@/lib/admin/price-sheet";
import { ModelStatusBadge } from "@/components/admin/models/model-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

const SAVE_ERROR = "Could not save. Try again.";

function ItemBadge({ item }: { item: TimelineItem }) {
  if (item.broken) return <Badge variant="destructive">{item.badge}</Badge>;
  if (item.state === "now") return <ModelStatusBadge status="live" text={item.badge} />;
  if (item.state === "next") return <Badge variant="outline" className="border-primary/30 bg-primary/5 font-medium text-primary">{item.badge}</Badge>;
  return <Badge variant="outline" className="font-medium text-muted-foreground">{item.badge}</Badge>;
}

const NODE = {
  now: "border-success bg-success ring-3 ring-success/20",
  next: "border-primary bg-card ring-3 ring-primary/10",
  past: "border-border bg-card",
} as const;

/** "Price history": every price row, newest first, with Cancel on a scheduled change and Undo on a fresh one. */
export function PriceTimeline({ modelId, timeline }: { modelId: string; timeline: Timeline }) {
  // The change to cancel or undo, waiting for the admin to confirm.
  const [confirming, setConfirming] = useState<{ item: TimelineItem; action: "cancel" | "undo" } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(call: () => Promise<{ error?: string }>, done: string) {
    setBusy(true);
    let error: string | undefined;
    try {
      error = (await call()).error;
    } catch {
      error = SAVE_ERROR;
    }
    setBusy(false);
    if (error) toast.error(error);
    else toast.success(done);
  }

  async function confirm() {
    if (!confirming) return;
    const { item, action } = confirming;
    if (action === "cancel") await run(() => cancelAiModelPriceAction(item.id, modelId), `Cancelled ${item.name}.`);
    else await run(() => undoAiModelPriceAction(modelId, item.id), "Undone. The earlier prices are live again.");
    setConfirming(null);
  }
  const undoing = confirming?.action === "undo";

  if (!timeline.items.length) return <p className="text-sm text-muted-foreground">No prices yet.</p>;

  return (
    <>
      <ul className="flex flex-col">
        {timeline.items.map((item) => (
          <li key={item.id} className="relative pb-4 pl-[22px] last:pb-0 [&:not(:last-child)]:before:absolute [&:not(:last-child)]:before:top-3.5 [&:not(:last-child)]:before:-bottom-0.5 [&:not(:last-child)]:before:left-[5px] [&:not(:last-child)]:before:w-px [&:not(:last-child)]:before:bg-border">
            <span aria-hidden className={cn("absolute top-1 left-0 size-[11px] rounded-full border-2", NODE[item.state])} />
            <div className={cn("flex flex-wrap items-center gap-2 text-sm", item.state === "past" ? "font-medium text-muted-foreground" : "font-semibold")}>
              {item.when}
              <ItemBadge item={item} />
            </div>
            {item.utc && <div className="text-xs text-muted-foreground">{item.utc}</div>}
            {(item.summary || item.note) && (
              <p className={cn("mt-0.5 text-[0.8125rem]", item.state === "past" && "text-muted-foreground")}>
                {item.summary}
                {item.note && <span className="text-muted-foreground"> {item.note.replace(/\.?$/, ".")}</span>}
              </p>
            )}
            {item.problems.length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-xs text-destructive-text">
                {item.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
              <span>{item.who}</span>
              {item.canCancel && (
                <Button variant="link" size="xs" className="h-auto px-0" disabled={busy} onClick={() => setConfirming({ item, action: "cancel" })}>
                  Cancel this change
                </Button>
              )}
              {item.canUndo && (
                <Button
                  variant="link"
                  size="xs"
                  className="h-auto px-0"
                  disabled={busy}
                  onClick={() => setConfirming({ item, action: "undo" })}
                >
                  Undo this change
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {timeline.source && (
        <p className="mt-3 text-xs">
          <a
            href={timeline.source.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary underline underline-offset-4 hover:decoration-2"
          >
            {timeline.source.text}
            <ExternalLink aria-hidden strokeWidth={1.5} className="size-3" />
          </a>
        </p>
      )}
      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && !busy && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {undoing ? "Undo" : "Cancel"} {confirming?.item.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {undoing
                ? "The prices before it go live again now. Runs already charged keep their price."
                : "It hasn't started, so no run used it."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
            <Button variant="destructive" disabled={busy} onClick={() => void confirm()}>
              {undoing ? (busy ? "Undoing…" : "Undo change") : busy ? "Cancelling…" : "Cancel change"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
