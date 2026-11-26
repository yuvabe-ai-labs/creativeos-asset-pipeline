"use client";

import { Search, X } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList } from "@/components/ui/tabs";
import { COUNT_TABS_LIST, CountTabTrigger } from "@/components/shared/count-tab-trigger";
import { PAYMENT_RANGES, PAYMENT_RANGE_LABEL, PAYMENT_TABS, type PaymentRange, type PaymentTab } from "@/lib/billing/admin-payments-filters";

type Props = {
  searchRef: React.Ref<HTMLInputElement>;
  query: string;
  onQueryChange: (q: string) => void;
  range: PaymentRange;
  onRangeChange: (r: PaymentRange) => void;
  tab: PaymentTab;
  onTabChange: (t: PaymentTab) => void;
  counts: Record<PaymentTab, number> | null;
};

// Search by agency ("/" jumps here, Esc clears), the When menu, and the status tabs; their counts
// follow the search and the range.
export function PaymentsToolbar({ searchRef, query, onQueryChange, range, onRangeChange, tab, onTabChange, counts }: Props) {
  return (
    <div className="mb-3.5">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <InputGroup className="h-10 w-full bg-card sm:max-w-sm">
          <InputGroupAddon>
            <Search strokeWidth={1.5} />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.preventDefault();
                onQueryChange("");
              }
            }}
            placeholder="Search by agency"
            aria-label="Search payments by agency"
            autoComplete="off"
          />
          <InputGroupAddon align="inline-end">
            {query ? (
              <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => onQueryChange("")}>
                <X strokeWidth={1.5} />
              </InputGroupButton>
            ) : (
              <kbd aria-hidden className="hidden rounded border px-1.5 text-xs leading-5 font-normal text-muted-foreground/70 md:inline group-focus-within/input-group:hidden">
                /
              </kbd>
            )}
          </InputGroupAddon>
        </InputGroup>
        <Select value={range} onValueChange={(v) => v && onRangeChange(v as PaymentRange)}>
          <SelectTrigger className="h-10 bg-card sm:ml-auto" aria-label="When">
            <SelectValue>
              <span className="text-muted-foreground">When:</span> {PAYMENT_RANGE_LABEL[range]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_RANGES.map((r) => (
              <SelectItem key={r} value={r}>
                {PAYMENT_RANGE_LABEL[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="mt-4 border-b border-border">
        <Tabs value={tab} onValueChange={(v) => onTabChange(v as PaymentTab)}>
          <TabsList variant="line" aria-label="Payments by status" className={COUNT_TABS_LIST}>
            {PAYMENT_TABS.map((t) => (
              <CountTabTrigger key={t.key} value={t.key} label={t.label} count={counts?.[t.key]} />
            ))}
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}
