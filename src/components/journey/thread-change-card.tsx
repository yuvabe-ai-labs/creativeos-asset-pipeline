"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { ChangeCard } from "@/lib/journey/thread/schema";
import { approveLabel, OUT_OF_DATE_LINE, settledLine, valueText } from "@/lib/kb/changes/copy";
import { cn } from "@/lib/utils";

export type ChangeDecision = { decision: "approve"; keep: string[] } | { decision: "discard" };

/** A proposed change to reviewed fields of the brand KB (brand KB spec §2.4, D505): each field
 *  before and after, where the new value came from, and a box to keep it. Nothing changes until a
 *  person approves. A field changed by hand since the card was made is shown, and cannot be kept. */
export function ThreadChangeCard({ id, card, outOfDate = [], busy, onDecide }: {
  id: string;
  card: ChangeCard;
  outOfDate?: string[];
  busy: boolean;
  onDecide: (decision: ChangeDecision) => void;
}) {
  const pending = card.status === "pending";
  // Every field is kept until the person unticks it; one changed by hand since never is.
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const keep = card.fields.map((f) => f.path).filter((path) => !dropped.has(path) && !outOfDate.includes(path));
  const toggle = (path: string, kept: boolean) =>
    setDropped((now) => {
      const next = new Set(now);
      if (kept) next.delete(path);
      else next.add(path);
      return next;
    });
  const footer = settledLine(card);

  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-card">
      <ul className="flex flex-col gap-3">
        {card.fields.map((field) => {
          const stale = pending && outOfDate.includes(field.path);
          const boxId = `${id}-${field.path}`;
          return (
            <li key={field.path} className="flex flex-col gap-1.5 border-b border-border pb-3 last:border-b-0 last:pb-0">
              <p className="text-eyebrow text-muted-foreground">{field.label}</p>
              <dl className="grid grid-cols-[3.75rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Before</dt>
                <dd className={cn("min-w-0 break-words", pending && !stale && "text-muted-foreground line-through decoration-muted-foreground/50")}>{valueText(field.before)}</dd>
                <dt className="text-muted-foreground">After</dt>
                <dd className="min-w-0 break-words">{valueText(field.after)}</dd>
              </dl>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{field.from}</span>
                {pending && (
                  <span className="flex items-center gap-1.5">
                    <Checkbox
                      id={boxId}
                      checked={keep.includes(field.path)}
                      disabled={busy || stale}
                      onCheckedChange={(checked) => toggle(field.path, checked === true)}
                    />
                    <Label htmlFor={boxId} className="text-xs font-medium text-foreground">Keep</Label>
                  </span>
                )}
              </div>
              {stale && <p className="text-xs text-warning-text">{OUT_OF_DATE_LINE}</p>}
            </li>
          );
        })}
      </ul>
      {pending ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy || keep.length === 0} onClick={() => onDecide({ decision: "approve", keep })}>
            {busy && <Loader2 className="animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden />}
            {approveLabel(keep.length)}
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onDecide({ decision: "discard" })}>
            Discard
          </Button>
        </div>
      ) : (
        footer && <p className="text-sm text-muted-foreground">{footer}</p>
      )}
    </div>
  );
}
