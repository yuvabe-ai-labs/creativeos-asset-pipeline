"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { cancelAiModelPriceAction } from "@/lib/actions/ai-models";
import { formatPriceLine } from "@/lib/ai-models/price-format";
import type { AdminPriceRow } from "@/lib/db/ai-models-admin";
import { currentPriceRow } from "./price-draft";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const SAVE_ERROR = "Could not save. Try again.";

/** "1 Dec 2026, 00:00 UTC" */
export function formatPriceStart(iso: string): string {
  const s = new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  return `${s} UTC`;
}

function PriceRow({
  row,
  isCurrent,
  isFuture,
  error,
  onCancel,
}: {
  row: AdminPriceRow;
  isCurrent: boolean;
  isFuture: boolean;
  error: string | null;
  onCancel: () => void;
}) {
  const p = row.price;
  const allowances = Object.entries(p?.estimate ?? {});
  return (
    <Card data-price-id={row.id} className="gap-3 px-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">
          {isFuture ? "Starts" : "From"} {formatPriceStart(row.effectiveFrom)}
        </span>
        {isCurrent && <Badge variant="secondary">Current</Badge>}
        {!p && <Badge variant="destructive">Fails its check</Badge>}
        {isFuture && (
          <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
      {p ? (
        <ul className="flex flex-col gap-1 text-sm">
          {p.lines.map((line, i) => (
            <li key={i}>{formatPriceLine(line)}</li>
          ))}
        </ul>
      ) : (
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          {row.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      {allowances.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Estimate allowances: {allowances.map(([k, v]) => `${k} ${v}`).join(", ")}
        </p>
      )}
      {p?.note && <p className="text-sm text-muted-foreground">{p.note}</p>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Added by {row.createdByName ?? "someone"}, {formatPriceStart(row.createdAt)}</span>
        {p?.sourceUrl && (
          <a
            href={p.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline-offset-4 hover:text-foreground hover:underline"
          >
            Source <ExternalLink className="size-3" strokeWidth={1.5} />
          </a>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </Card>
  );
}

export function PriceHistory({ modelId, prices, now }: { modelId: string; prices: AdminPriceRow[]; now: string }) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);

  const at = new Date(now);
  const rows = [...prices].sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());
  const currentId = currentPriceRow(rows, at)?.id ?? null;

  async function cancel(id: string) {
    setCancelling(true);
    setError(null);
    try {
      const res = await cancelAiModelPriceAction(id, modelId);
      if (res.error) setError({ id, message: res.error });
    } catch {
      setError({ id, message: SAVE_ERROR });
    } finally {
      setCancelling(false);
      setConfirming(null);
    }
  }

  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No prices yet.</p>;

  return (
    <>
      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <PriceRow
            key={r.id}
            row={r}
            isCurrent={r.id === currentId}
            isFuture={new Date(r.effectiveFrom).getTime() > at.getTime()}
            error={error?.id === r.id ? error.message : null}
            onCancel={() => setConfirming(r.id)}
          />
        ))}
      </div>
      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && !cancelling && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this price?</AlertDialogTitle>
            <AlertDialogDescription>It hasn&apos;t started, so no run used it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep it</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={cancelling}
              onClick={() => confirming && void cancel(confirming)}
            >
              {cancelling ? "Cancelling…" : "Cancel price"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
