import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ADD_CHIP_CLASS =
  "h-auto self-start rounded-md border border-dashed border-primary/40 px-2.5 py-1.5 text-primary hover:border-primary/60 hover:bg-primary/5 hover:text-primary dark:hover:bg-primary/5";

/**
 * A dashed-border primary "Add …" chip (AGENTS.md: add actions must not be missable). Takes the
 * Button's props, so a Base UI trigger can use it as its element: `render={<AddChip label="…" />}`.
 */
export function AddChip({ label, className, ...props }: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Button type="button" variant="ghost" size="sm" {...props} className={cn(ADD_CHIP_CLASS, className)}>
      <Plus className="size-3.5" strokeWidth={1.5} /> {label}
    </Button>
  );
}
