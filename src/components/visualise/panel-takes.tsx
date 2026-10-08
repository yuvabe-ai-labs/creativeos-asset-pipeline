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
              disabled={disabled || picked}
              onClick={() => onPick(take.id)}
              className={cn("relative h-auto w-14 p-0", picked && "ring-2 ring-primary ring-offset-1")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={take.url ?? ""} alt="" className="aspect-[9/16] w-full rounded-md object-cover" />
              <span className="absolute bottom-0.5 left-1 text-[0.65rem] font-medium text-background drop-shadow">{i + 1}</span>
              {picked && <Check className="absolute right-0.5 top-0.5 size-3.5 text-primary" strokeWidth={1.5} />}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
