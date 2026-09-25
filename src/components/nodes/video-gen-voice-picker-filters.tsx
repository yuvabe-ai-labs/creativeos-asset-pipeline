"use client";

import { Search, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Button } from "@/components/ui/button";
import {
  LIBRARY_ACCENTS, LIBRARY_AGES, LIBRARY_GENDERS, LIBRARY_LANGUAGES, LIBRARY_SORTS, LIBRARY_USE_CASES,
} from "@/lib/elevenlabs/constants";
import { ACCOUNT_SORTS, formatLabel, hasActiveFilters, labelOptions, type VoiceFilters } from "@/lib/elevenlabs/voice-filters";
import { FILTER_FIELD_ICON } from "@/lib/elevenlabs/voice-labels";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";
import type { VoiceTab } from "@/hooks/use-voice-browser";
import { ParamChipGroup, type ChipOption } from "./param-chip-group";

const opts = (values: readonly string[]): ChipOption[] => values.map((v) => ({ value: v, label: formatLabel(v) }));
const ANY: ChipOption = { value: "", label: "Any" };

// One labelled row of chips — everything visible, nothing behind a dropdown.
function FilterRow({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="flex items-center gap-1.5 pt-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5 shrink-0" strokeWidth={1.5} />
        {label}
      </span>
      {children}
    </>
  );
}

type Props = {
  tab: VoiceTab;
  filters: VoiceFilters;
  accountAll: PickerVoice[];
  onFilter: (key: keyof VoiceFilters, value: string) => void;
  onClear: () => void;
};

// D283/D284 — search + filter chips. My voices: options from the loaded voices' labels (a filter
// with nothing to choose from is hidden). Library: ElevenLabs' own vocabulary.
export function VideoGenVoicePickerFilters({ tab, filters, accountAll, onFilter, onClear }: Props) {
  const lib = tab === "library";
  const rows: Array<{ key: Exclude<keyof VoiceFilters, "search" | "sort">; label: string; options: ChipOption[] }> = [
    { key: "gender", label: "Gender", options: lib ? opts(LIBRARY_GENDERS) : opts(labelOptions(accountAll, "gender")) },
    { key: "age", label: "Age", options: lib ? opts(LIBRARY_AGES) : opts(labelOptions(accountAll, "age")) },
    { key: "language", label: "Language", options: lib ? [...LIBRARY_LANGUAGES] : opts(labelOptions(accountAll, "language")) },
    { key: "accent", label: "Accent", options: lib ? opts(LIBRARY_ACCENTS) : opts(labelOptions(accountAll, "accent")) },
    { key: "useCase", label: "Use case", options: lib ? opts(LIBRARY_USE_CASES) : opts(labelOptions(accountAll, "useCase")) },
  ];
  const sorts: ChipOption[] = lib ? [...LIBRARY_SORTS] : [...ACCOUNT_SORTS];

  return (
    <div className="flex flex-col gap-3">
      <InputGroup className="nodrag">
        <InputGroupAddon>
          <Search className="size-4" strokeWidth={1.5} />
        </InputGroupAddon>
        <InputGroupInput
          id="voice-picker-search"
          aria-label="Search voices"
          placeholder={lib ? "Search 18,000+ voices…" : "Search your voices…"}
          value={filters.search}
          onChange={(e) => onFilter("search", e.target.value)}
        />
        {filters.search && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton aria-label="Clear search" onClick={() => onFilter("search", "")}>
              <X className="size-3.5" strokeWidth={1.5} />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>

      <div className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-x-3 gap-y-2">
        {rows
          .filter((r) => r.options.length > 0)
          .map((r) => (
            <FilterRow key={r.key} icon={FILTER_FIELD_ICON[r.key]} label={r.label}>
              <ParamChipGroup options={[ANY, ...r.options]} value={filters[r.key]} onValueChange={(v) => onFilter(r.key, v)} />
            </FilterRow>
          ))}
        <FilterRow icon={FILTER_FIELD_ICON.sort} label="Sort">
          <ParamChipGroup options={sorts} value={filters.sort || sorts[0].value} onValueChange={(v) => onFilter("sort", v)} />
        </FilterRow>
      </div>

      {hasActiveFilters(filters) && (
        <Button type="button" variant="link" size="sm" className="nodrag h-7 self-start px-0 text-xs" onClick={onClear}>
          Clear filters
        </Button>
      )}
    </div>
  );
}
