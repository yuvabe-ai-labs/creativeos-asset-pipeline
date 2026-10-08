"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PanelTake } from "@/lib/scripts/visualise/schema";

// D343 — every drawn take, oldest first; the picked one is what the client sees.
export function PanelTakes({ takes, pickId, disabled, onPick }: {
  takes: PanelTake[];
  pickId: string | null;
  disabled: boolean;
  onPick: (takeId: string) => void;
}) {
  if (takes.length < 2) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-eyebrow">Takes</span>
      <div role="group" aria-label="Takes" className="flex flex-wrap gap-2">
        {takes.map((take, i) => {
          const picked = take.id === pickId;
          return (
            <Button
              key={take.id}
              variant="outline"
              aria-pressed={picked}
              aria-label={`Take ${i + 1}${picked ? ", picked" : ""}`}
              // Not disabled when picked: disabled dims it, and the pick is the one that matters.
              disabled={disabled}
              onClick={() => { if (!picked) onPick(take.id); }}
              className={cn("relative h-auto w-16 overflow-hidden p-0", picked && "ring-2 ring-primary ring-offset-1")}
            >
              <span className="relative block aspect-[9/16] w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={take.url ?? ""} alt="" className="absolute inset-0 size-full object-cover" />
              </span>
              <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1 text-[0.65rem] font-medium leading-4 text-foreground">{i + 1}</span>
              {picked && (
                <span className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5">
                  <Check className="size-3 text-primary" strokeWidth={1.5} />
                </span>
              )}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
