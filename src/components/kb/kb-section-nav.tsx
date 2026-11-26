"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ModuleKey } from "@/lib/kb/types";

type Section = { key: ModuleKey; label: string };

/**
 * The Brand KB review box's section list: a vertical rail of tabs on wide screens, a horizontally
 * scrolling strip on narrow ones. Review progress is the box header's "X / 7 reviewed".
 */
export function KBSectionNav({ sections, value, onChange }: {
  sections: Section[];
  value: ModuleKey;
  onChange: (key: ModuleKey) => void;
}) {
  return (
    <div className="flex shrink-0 flex-col border-b border-border md:w-52 md:border-r md:border-b-0">
      <div className="text-eyebrow hidden h-14 shrink-0 items-center border-b border-border px-4 text-muted-foreground md:flex">
        Sections
      </div>
      <Tabs orientation="vertical" value={value} onValueChange={(v) => onChange(v as ModuleKey)} className="gap-0">
        <TabsList
          variant="line"
          aria-label="Brand KB sections"
          className="scrollbar-thin h-auto w-full flex-row gap-0 overflow-x-auto p-0 group-data-vertical/tabs:flex-row md:group-data-vertical/tabs:flex-col"
        >
          {sections.map(({ key, label }) => (
            <TabsTrigger
              key={key}
              value={key}
              className="h-12 flex-none justify-start gap-1.5 rounded-none border-0 px-4 text-sm font-normal text-muted-foreground transition-colors duration-200 hover:bg-muted/50 hover:text-foreground group-data-vertical/tabs:w-auto data-active:bg-primary/5 data-active:font-medium data-active:text-foreground md:border-b md:border-border/60 md:group-data-vertical/tabs:w-full group-data-vertical/tabs:after:inset-x-0 group-data-vertical/tabs:after:top-auto group-data-vertical/tabs:after:bottom-0 group-data-vertical/tabs:after:h-0.5 group-data-vertical/tabs:after:w-auto md:group-data-vertical/tabs:after:inset-y-0 md:group-data-vertical/tabs:after:right-auto md:group-data-vertical/tabs:after:left-0 md:group-data-vertical/tabs:after:h-auto md:group-data-vertical/tabs:after:w-0.5"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
