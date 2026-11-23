import { X } from "lucide-react";
import type { DraftPair } from "./price-draft";
import { AddChip } from "./add-chip";
import { PairKeySelect } from "./pair-key-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Key and value rows with an Add chip: a line's conditions, or the estimate allowances. */
export function PricePairRows({
  pairs,
  onChange,
  addLabel,
  keyPlaceholder,
  valuePlaceholder,
  numeric,
  keyOptions,
  keyWarning,
}: {
  pairs: DraftPair[];
  onChange: (pairs: DraftPair[]) => void;
  addLabel: string;
  keyPlaceholder: string;
  valuePlaceholder: string;
  numeric?: boolean;
  /** Known names: the name is picked from these, or typed after choosing "Other name". */
  keyOptions?: readonly string[];
  /** A note under a row, by its name. It doesn't stop the save. */
  keyWarning?: (key: string) => string | null;
}) {
  const set = (i: number, patch: Partial<DraftPair>) =>
    onChange(pairs.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <div className="flex flex-col gap-2">
      {pairs.map((p, i) => {
        const warning = keyWarning?.(p.key) ?? null;
        return (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              {keyOptions ? (
                <PairKeySelect
                  pair={p}
                  options={keyOptions}
                  placeholder={keyPlaceholder}
                  onChange={(patch) => set(i, patch)}
                />
              ) : (
                <Input
                  aria-label={keyPlaceholder}
                  placeholder={keyPlaceholder}
                  value={p.key}
                  onChange={(e) => set(i, { key: e.target.value })}
                />
              )}
              <Input
                aria-label={valuePlaceholder}
                placeholder={valuePlaceholder}
                type={numeric ? "number" : "text"}
                value={p.value}
                onChange={(e) => set(i, { value: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remove"
                onClick={() => onChange(pairs.filter((_, j) => j !== i))}
              >
                <X strokeWidth={1.5} />
              </Button>
            </div>
            {warning && <p className="text-xs text-warning-text">{warning}</p>}
          </div>
        );
      })}
      <AddChip label={addLabel} onClick={() => onChange([...pairs, { key: "", value: "" }])} />
    </div>
  );
}
