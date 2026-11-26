"use client";

import { ChevronDown } from "lucide-react";
import { pickerOrder, type PickerModel } from "@/lib/admin/model-page";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PickerOrderList } from "@/components/admin/models/picker-order-list";
import { usePickerReorder } from "@/components/admin/models/use-picker-reorder";

/** "7th of 10 in the picker": opens the kind's picker order, where this model moves up or down. Each move saves. */
export function ModelOrderPopover({ id, models }: { id: string; models: PickerModel[] }) {
  const { list, move } = usePickerReorder(models);
  const order = pickerOrder(list, id);

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="xs" className="-mx-1.5 px-1.5 text-[0.8125rem] font-normal text-foreground/80" />}>
        {order.text}
        <ChevronDown aria-hidden strokeWidth={1.5} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-2 p-3" aria-label={order.title}>
        <h3 className="text-sm font-semibold">{order.title}</h3>
        <PickerOrderList items={order.items} current={id} onMove={move} />
      </PopoverContent>
    </Popover>
  );
}
