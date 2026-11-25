"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { reorderAiModelsAction } from "@/lib/actions/ai-models";
import { arrowAfterMove, moveInOrder, pickerOrder, type PickerModel } from "@/lib/admin/model-page";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const SAVE_ERROR = "Could not save. Try again.";

/** "7th of 10 in the picker": opens the kind's picker order, where this model moves up or down. Each move saves. */
export function ModelOrderPopover({ id, models }: { id: string; models: PickerModel[] }) {
  const [list, setList] = useState(models);
  const [saving, setSaving] = useState(false);
  // Which arrow holds focus after a move; at an end the one just used is disabled, so the other takes it.
  const [focusArrow, setFocusArrow] = useState<{ arrow: "up" | "down"; n: number } | null>(null);
  const up = useRef<HTMLButtonElement>(null);
  const down = useRef<HTMLButtonElement>(null);
  const order = pickerOrder(list, id);

  useEffect(() => {
    if (focusArrow) (focusArrow.arrow === "up" ? up : down).current?.focus();
  }, [focusArrow]);

  async function move(delta: -1 | 1) {
    // The arrows stay enabled while a move saves (disabling them would drop keyboard focus); a press then does nothing.
    if (saving) return;
    const ids = moveInOrder(order.items.map((i) => i.id), id, delta);
    if (!ids) return;
    const before = list;
    setList(ids.map((x) => list.find((m) => m.id === x) as PickerModel));
    setFocusArrow((f) => ({ arrow: arrowAfterMove(order.position + delta, ids.length, delta), n: (f?.n ?? 0) + 1 }));
    setSaving(true);
    let error: string | undefined;
    try {
      error = (await reorderAiModelsAction(order.kind, ids)).error;
    } catch {
      error = SAVE_ERROR;
    }
    setSaving(false);
    if (error) {
      setList(before);
      toast.error(error);
    }
  }

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="xs" className="-mx-1.5 px-1.5 text-[0.8125rem] font-normal text-foreground/80" />}>
        {order.text}
        <ChevronDown aria-hidden strokeWidth={1.5} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-2 p-3" aria-label={order.title}>
        <h3 className="text-sm font-semibold">{order.title}</h3>
        <ol className="overflow-hidden rounded-lg border text-[0.8125rem]">
          {order.items.map((item, i) => {
            const me = item.id === id;
            return (
              <li
                key={item.id}
                className={cn(
                  "flex min-h-8 items-center gap-2 border-t px-2.5 py-1 first:border-t-0",
                  me ? "bg-primary/5 font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                <span className="w-4 tabular-nums font-medium text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {me ? (
                  <>
                    <Button ref={up} variant="ghost" size="icon-xs" aria-label="Move up" disabled={i === 0} onClick={() => void move(-1)}>
                      <ChevronUp strokeWidth={1.5} />
                    </Button>
                    <Button ref={down} variant="ghost" size="icon-xs" aria-label="Move down" disabled={i === order.items.length - 1} onClick={() => void move(1)}>
                      <ChevronDown strokeWidth={1.5} />
                    </Button>
                  </>
                ) : (
                  item.note && <span className="text-xs">{item.note}</span>
                )}
              </li>
            );
          })}
        </ol>
      </PopoverContent>
    </Popover>
  );
}
