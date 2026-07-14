"use client";

import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Filters } from "./types";

type Props = {
  filters: Filters;
  onChange: (next: Filters) => void;
  availableFolders: { id: string; name: string }[];
};

export function GalleryFilterPopover({ filters, onChange, availableFolders }: Props) {
  const activeCount = (filters.sharedOnly ? 1 : 0) + filters.folderIds.size;

  function toggleFolder(id: string) {
    const next = new Set(filters.folderIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ ...filters, folderIds: next });
  }

  function clear() {
    onChange({ sharedOnly: false, folderIds: new Set() });
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-9 gap-1.5 px-3 text-xs",
              activeCount > 0 && "border-primary/40 text-primary",
            )}
          >
            <SlidersHorizontal className="size-3.5" strokeWidth={1.5} />
            Filter
            {activeCount > 0 && (
              <span className="ml-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[0.6rem] font-medium">
                {activeCount}
              </span>
            )}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-64 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-eyebrow text-[0.65rem]!">Filters</p>
          {activeCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clear}
              className="h-5 px-1.5 text-[0.65rem] text-muted-foreground"
            >
              Clear
            </Button>
          )}
        </div>

        <label className="mb-3 flex cursor-pointer items-center gap-2 text-xs">
          <Checkbox
            checked={filters.sharedOnly}
            onCheckedChange={(v) => onChange({ ...filters, sharedOnly: v === true })}
          />
          <span>Shared only</span>
        </label>

        <div className="border-t border-border pt-2">
          <p className="mb-1.5 text-[0.6rem] font-medium uppercase tracking-wider text-muted-foreground">
            Folders ({availableFolders.length})
          </p>
          {availableFolders.length === 0 ? (
            <p className="text-[0.65rem] text-muted-foreground">
              Folders appear as you scroll.
            </p>
          ) : (
            <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
              {availableFolders.map((f) => (
                <label
                  key={f.id}
                  className="flex cursor-pointer items-center gap-2 py-0.5 text-xs"
                >
                  <Checkbox
                    checked={filters.folderIds.has(f.id)}
                    onCheckedChange={() => toggleFolder(f.id)}
                  />
                  <span className="truncate">{f.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
