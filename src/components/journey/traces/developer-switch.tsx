"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** The copilot panel's developer switch (spec §3.2): anyone may turn it on; it keeps the panel tidy,
 *  it is not a permission. */
export function DeveloperSwitch({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<Label className="flex cursor-pointer items-center gap-1.5 text-xs font-normal text-muted-foreground" />}>
          <Switch size="sm" checked={checked} onCheckedChange={(next) => onChange(next)} />
          Turns
        </TooltipTrigger>
        <TooltipContent side="bottom">Show each turn&apos;s trace, for testing the copilot</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
