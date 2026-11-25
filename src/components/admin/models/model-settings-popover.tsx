"use client";

import { ChevronDown } from "lucide-react";
import type { SettingRow } from "@/lib/admin/model-page";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** "Settings people pick": the choices people see when they run this model, with each default. Read only. */
export function ModelSettingsPopover({ rows }: { rows: SettingRow[] }) {
  if (!rows.length) return null;
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="xs" className="-mx-1.5 px-1.5 text-[0.8125rem] font-normal text-foreground/80" />}>
        Settings people pick
        <ChevronDown aria-hidden strokeWidth={1.5} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3" aria-label="Settings people pick">
        <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-2.5 gap-y-2 text-[0.8125rem]">
          {rows.map((r) => (
            <div key={r.label} className="contents">
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd>
                {r.values}
                {r.defaultText && <span className="text-muted-foreground"> (default {r.defaultText})</span>}
              </dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}
