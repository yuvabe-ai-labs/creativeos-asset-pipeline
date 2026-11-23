import { X } from "lucide-react";
import { METERS, type Meter } from "@/lib/ai-models/types";
import { emptyLine, isTokenMeter, switchMeter, type DraftLine } from "./price-draft";
import { AddChip } from "./add-chip";
import { PricePairRows } from "./price-pair-rows";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const words = (meter: Meter) => meter.replace(/_/g, " ");
const unitLabel = (meter: Meter) => (isTokenMeter(meter) ? `per 1M ${words(meter)}s` : `per ${words(meter)}`);

/** The price lines: a meter, its $ per unit, and the conditions a run must match. */
export function PriceLinesEditor({ lines, onChange }: { lines: DraftLine[]; onChange: (lines: DraftLine[]) => void }) {
  const set = (i: number, patch: Partial<DraftLine>) =>
    onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div className="flex flex-col gap-3">
      {lines.map((line, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <Select value={line.meter} onValueChange={(v) => v && onChange(lines.map((l, j) => (j === i ? switchMeter(l, v as Meter) : l)))}>
              <SelectTrigger className="w-44 shrink-0" aria-label="Meter">
                <SelectValue>{words(line.meter)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {METERS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {words(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <InputGroup>
              <InputGroupAddon>
                <InputGroupText>$</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                aria-label="Price"
                type="number"
                min={0}
                step="any"
                value={line.unit}
                onChange={(e) => set(i, { unit: e.target.value })}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>{unitLabel(line.meter)}</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Remove line"
              onClick={() => onChange(lines.filter((_, j) => j !== i))}
            >
              <X strokeWidth={1.5} />
            </Button>
          </div>
          <PricePairRows
            pairs={line.when}
            onChange={(when) => set(i, { when })}
            addLabel="Add condition"
            keyPlaceholder="Setting"
            valuePlaceholder="Value"
          />
        </div>
      ))}
      <AddChip label="Add line" onClick={() => onChange([...lines, emptyLine()])} />
    </div>
  );
}
