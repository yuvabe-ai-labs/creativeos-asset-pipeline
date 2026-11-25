"use client";

import { Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-b-2 bg-card px-1 font-sans text-[0.6875rem] font-medium text-foreground/80">
      {children}
    </kbd>
  );
}

const ROWS: { keys: React.ReactNode; what: string }[] = [
  { keys: <><Key>Tab</Key> <Key>←</Key> <Key>→</Key></>, what: "Next or previous cell" },
  { keys: <><Key>↑</Key> <Key>↓</Key> <Key>Enter</Key></>, what: "Cell above or below" },
  { keys: <Key>Esc</Key>, what: "Put the cell back as it was" },
  { keys: <span className="font-semibold">−31%</span>, what: "Change a cell by a percent (rounded to 4 significant figures)" },
];

/** The grid's keys, in a popover. It opens by itself the first time the grid shows, without taking focus. */
export function KeyboardChip({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={<Button variant="outline" size="sm" className="rounded-full" />}>
        <Keyboard aria-hidden strokeWidth={1.5} />
        Keyboard
      </PopoverTrigger>
      <PopoverContent align="end" initialFocus={false} className="w-80 p-4">
        <PopoverTitle className="text-sm font-semibold">Keyboard</PopoverTitle>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3.5 gap-y-2 text-[0.8125rem]">
          {ROWS.map((r) => (
            <div key={r.what} className="contents">
              <dt className="flex items-center gap-1">{r.keys}</dt>
              <dd className="text-foreground/80">{r.what}</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}
