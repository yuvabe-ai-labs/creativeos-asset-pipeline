"use client";

import { useState } from "react";
import { ChevronDown, Languages } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };

// D284 — the voice picker's Language filter: a searchable dropdown, like ElevenLabs' own
// ("Select Language" → type to narrow the list). "Any language" clears it.
export function VideoGenVoicePickerLanguage({
  options, value, onChange,
}: {
  options: Option[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className={cn("nodrag w-full justify-between", current && "border-primary/50 text-primary")}
            aria-label={current ? `Language: ${current.label}` : "Select language"}
          />
        }
      >
        <span className="flex items-center gap-2">
          <Languages className="size-4" strokeWidth={1.5} />
          {current?.label ?? "Select language"}
        </span>
        <ChevronDown className="size-4 text-muted-foreground" strokeWidth={1.5} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) p-0">
        <Command>
          <CommandInput placeholder="Search languages" />
          <CommandList>
            <CommandEmpty>No language matches.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="Any language" data-checked={value === ""} onSelect={() => pick("")}>
                Any language
              </CommandItem>
              {options.map((o) => (
                <CommandItem key={o.value} value={o.label} data-checked={o.value === value} onSelect={() => pick(o.value)}>
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
