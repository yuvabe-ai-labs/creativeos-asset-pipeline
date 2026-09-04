"use client";

import { useState } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SignalWithItems } from "@/lib/db/signals";
import type { MoodboardItem } from "@/lib/db/moodboards";
import { ReferenceTile } from "./reference-tile";

type Props = {
  signal: SignalWithItems;
  onBack: () => void;
  onOpenItem: (item: MoodboardItem) => void;
  onDelete: () => Promise<void> | void;
};

export function SignalDetail({ signal, onBack, onOpenItem, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" strokeWidth={1.5} />
          All signals
        </Button>
        {confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Delete this signal?</span>
            <Button variant="destructive" size="sm" onClick={() => void onDelete()}>
              Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="icon" onClick={() => setConfirming(true)} aria-label="Delete signal">
            <Trash2 className="size-4" strokeWidth={1.5} />
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-display text-xl text-foreground">{signal.name}</h2>
        {signal.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {signal.tags.map((t) => (
              <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
        )}
        {signal.description && <p className="max-w-2xl text-sm text-foreground">{signal.description}</p>}
      </div>

      {signal.items.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          This signal&apos;s references were removed. The interpretation remains — re-attach evidence
          or delete it.
        </p>
      ) : (
        <div className="columns-2 gap-3 md:columns-3 lg:columns-4 [&>*]:mb-3 [&>*]:break-inside-avoid">
          {signal.items.map((it) => (
            <ReferenceTile
              key={it.id}
              item={it}
              selected={false}
              selectable={false}
              onToggle={() => {}}
              onOpen={() => onOpenItem(it)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
