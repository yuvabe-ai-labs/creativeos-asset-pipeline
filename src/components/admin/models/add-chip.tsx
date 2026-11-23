import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/** A dashed-border primary "Add …" chip (AGENTS.md: add actions must not be missable). */
export const ADD_CHIP_CLASS =
  "h-auto self-start rounded-md border border-dashed border-primary/40 px-2.5 py-1.5 text-primary hover:border-primary/60 hover:bg-primary/5 hover:text-primary dark:hover:bg-primary/5";

export function AddChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" onClick={onClick} className={ADD_CHIP_CLASS}>
      <Plus className="size-3.5" strokeWidth={1.5} /> {label}
    </Button>
  );
}
