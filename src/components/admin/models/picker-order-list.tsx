"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { arrowAfterMove, type PickerOrder } from "@/lib/admin/model-page";
import { cn } from "@/lib/utils";

/**
 * A kind's picker order with up and down arrows. With `current` (the model page) only that model
 * moves and its row is marked; without it (the models catalog) every model moves.
 */
export function PickerOrderList({
  items,
  current,
  onMove,
}: {
  items: PickerOrder["items"];
  current?: string;
  onMove: (id: string, delta: -1 | 1) => boolean;
}) {
  const arrows = useRef(new Map<string, HTMLButtonElement>());
  // Which arrow holds focus after a move; at an end the one just used is disabled, so the other takes it.
  const [focusArrow, setFocusArrow] = useState<{ id: string; arrow: "up" | "down"; n: number } | null>(null);

  useEffect(() => {
    if (focusArrow) arrows.current.get(`${focusArrow.id}:${focusArrow.arrow}`)?.focus();
  }, [focusArrow]);

  function press(id: string, index: number, delta: -1 | 1) {
    if (!onMove(id, delta)) return;
    setFocusArrow((f) => ({ id, arrow: arrowAfterMove(index + 1 + delta, items.length, delta), n: (f?.n ?? 0) + 1 }));
  }

  const keep = (key: string) => (el: HTMLButtonElement | null) => {
    if (el) arrows.current.set(key, el);
    else arrows.current.delete(key);
  };

  return (
    <ol className="overflow-hidden rounded-lg border text-[0.8125rem]">
      {items.map((item, i) => {
        const me = item.id === current;
        const movable = current === undefined || me;
        // On the model page the arrows sit on the page's own model; in the catalog each names its model.
        const name = me ? "" : ` ${item.label}`;
        return (
          <li
            key={item.id}
            className={cn(
              "flex min-h-8 items-center gap-2 border-t px-2.5 py-1 first:border-t-0",
              me ? "bg-primary/5 font-semibold text-foreground" : current === undefined ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <span className="w-4 tabular-nums font-medium text-muted-foreground">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.note && <span className="text-xs text-muted-foreground">{item.note}</span>}
            {movable && (
              <>
                <Button ref={keep(`${item.id}:up`)} variant="ghost" size="icon-xs" aria-label={`Move${name} up`} disabled={i === 0} onClick={() => press(item.id, i, -1)}>
                  <ChevronUp strokeWidth={1.5} />
                </Button>
                <Button ref={keep(`${item.id}:down`)} variant="ghost" size="icon-xs" aria-label={`Move${name} down`} disabled={i === items.length - 1} onClick={() => press(item.id, i, 1)}>
                  <ChevronDown strokeWidth={1.5} />
                </Button>
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}
