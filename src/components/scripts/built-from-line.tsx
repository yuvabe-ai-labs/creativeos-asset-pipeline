"use client";

import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { builtFromSignals } from "@/lib/scripts/copilot/brief";
import { cn } from "@/lib/utils";

type SignalName = { id: string; name: string };

/** "Built from" (D531): the market signals a script uses, at the top of the script. Set by the
 *  picked angle, then the script's own: chips to remove, a dashed chip to add another. Read-only In
 *  review and Approved. A signal deleted since simply is not shown. */
export function BuiltFromLine({ signals, chosen, editable, busy = false, onChange, className }: {
  /** The client's signals by name, loaded once with the page. */
  signals: SignalName[];
  chosen: string[] | null;
  editable: boolean;
  busy?: boolean;
  onChange?: (ids: string[]) => void;
  className?: string;
}) {
  const used = builtFromSignals(signals, chosen);
  const rest = signals.filter((s) => !used.some((u) => u.id === s.id));
  const change = (ids: string[]) => onChange?.(ids);
  const canEdit = editable && onChange !== undefined;

  return (
    <div className={cn("flex flex-wrap items-center gap-2 text-sm", className)}>
      <span className="text-eyebrow text-muted-foreground">Built from</span>
      {chosen === null && <span className="text-muted-foreground">Set when you pick an angle</span>}
      {chosen !== null && used.length === 0 && <span className="text-muted-foreground">No signals</span>}
      {used.map((s) => (
        <Badge key={s.id} variant="secondary" className="gap-1 pr-1">
          {s.name}
          {canEdit && (
            <Button
              variant="ghost" size="icon-xs" className="size-4 rounded-full" disabled={busy}
              aria-label={`Remove ${s.name}`}
              onClick={() => change(used.filter((u) => u.id !== s.id).map((u) => u.id))}
            >
              <X strokeWidth={1.5} aria-hidden />
            </Button>
          )}
        </Badge>
      ))}
      {canEdit && rest.length > 0 && (
        <Select value={null} onValueChange={(id) => { if (typeof id === "string") change([...used.map((u) => u.id), id]); }}>
          <SelectTrigger
            size="sm" disabled={busy}
            className="h-6 gap-1 rounded-full border-dashed border-primary/40 px-2 text-xs text-primary hover:bg-primary/5 [&>svg:last-child]:hidden"
          >
            <Plus className="size-3.5" strokeWidth={1.5} aria-hidden />
            Add a signal
          </SelectTrigger>
          <SelectContent>
            {rest.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
