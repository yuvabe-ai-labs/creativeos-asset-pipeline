"use client";

import { pickerItems, pickerTitle, type PickerModel } from "@/lib/admin/model-page";
import { PickerOrderList } from "@/components/admin/models/picker-order-list";
import { usePickerReorder } from "@/components/admin/models/use-picker-reorder";

/** One picker inside the catalog's "Picker order": its heading and every model with arrows. Each move saves. */
export function KindPickerOrder({ models }: { models: PickerModel[] }) {
  const { list, move } = usePickerReorder(models);
  const kind = models[0]?.kind ?? "";
  return (
    <section aria-label={pickerTitle(kind)} className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{pickerTitle(kind)}</h3>
      <PickerOrderList items={pickerItems(list)} onMove={move} />
    </section>
  );
}
