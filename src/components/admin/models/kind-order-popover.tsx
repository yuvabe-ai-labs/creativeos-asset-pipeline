"use client";

import { ListOrdered } from "lucide-react";
import type { PickerModel } from "@/lib/admin/model-page";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { KindPickerOrder } from "@/components/admin/models/kind-picker-order";

/** A catalog section's "Picker order": the order agencies see each of the kind's pickers in, to move models up or down. */
export function KindOrderPopover({ group, pickers }: { group: string; pickers: PickerModel[][] }) {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="sm" className="font-normal text-muted-foreground" />}>
        <ListOrdered aria-hidden strokeWidth={1.5} />
        Picker order
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[min(32rem,var(--available-height))] w-80 gap-4 overflow-y-auto p-3" aria-label={`Picker order for ${group}`}>
        {pickers.map((models) => (
          <KindPickerOrder key={models[0]?.kind} models={models} />
        ))}
      </PopoverContent>
    </Popover>
  );
}
