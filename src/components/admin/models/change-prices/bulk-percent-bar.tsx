"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";

/** "Change every price by −31%", with "Include other charges" when the model has them. */
export function BulkPercentBar({
  value,
  includeOther,
  hasOtherCharges,
  onValue,
  onIncludeOther,
  onApply,
}: {
  value: string;
  includeOther: boolean;
  hasOtherCharges: boolean;
  onValue: (text: string) => void;
  onIncludeOther: (on: boolean) => void;
  onApply: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Label htmlFor="bulk-percent" className="text-[0.8125rem] font-normal">Change every price by</Label>
      <InputGroup className="w-[110px]">
        <InputGroupInput
          id="bulk-percent"
          value={value}
          placeholder="e.g. −31"
          inputMode="decimal"
          autoComplete="off"
          aria-describedby="bulk-percent-help"
          onChange={(e) => onValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onApply();
            }
          }}
        />
        <InputGroupAddon align="inline-end" aria-hidden className="text-muted-foreground">%</InputGroupAddon>
      </InputGroup>
      {hasOtherCharges && (
        <Label className="text-[0.8125rem] font-normal">
          <Checkbox checked={includeOther} onCheckedChange={(on) => onIncludeOther(on === true)} />
          Include other charges
        </Label>
      )}
      <Button variant="outline" size="sm" onClick={onApply}>Apply</Button>
      <p id="bulk-percent-help" className="basis-full text-xs text-muted-foreground lg:basis-auto lg:flex-1">
        Leaves prices you typed alone. Results are rounded; for exact prices, type the vendor&apos;s new prices into the cells.
      </p>
    </div>
  );
}
