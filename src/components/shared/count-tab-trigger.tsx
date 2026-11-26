"use client";

import { TabsTrigger } from "@/components/ui/tabs";

/**
 * One tab of a line tab row with a count after its label: "All 27", "Video 6". The same look on
 * every list that filters by tab (brand assets, Admin agencies, Admin models). Put it inside
 * `<TabsList variant="line" className={COUNT_TABS_LIST}>`, in a row with a bottom border.
 * `badge` replaces the count when the tab needs to show something else (a spinner, a dot).
 */
export function CountTabTrigger({ value, label, count, badge, disabled }: {
  value: string;
  label: string;
  count?: number;
  badge?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <TabsTrigger
      value={value}
      disabled={disabled}
      // items-baseline: the smaller count sits on the label's baseline, not raised by centring.
      className="h-auto flex-none items-baseline gap-1.5 rounded-none px-0.5 pb-2.5 pt-1 after:bg-primary group-data-horizontal/tabs:after:bottom-0"
    >
      {label}
      {badge ?? (count ? <span className="text-xs tabular-nums text-muted-foreground">{count}</span> : null)}
    </TabsTrigger>
  );
}

/** The TabsList classes that go with `CountTabTrigger`. */
export const COUNT_TABS_LIST = "h-auto flex-wrap gap-x-4 gap-y-1 bg-transparent p-0 group-data-horizontal/tabs:h-auto";
