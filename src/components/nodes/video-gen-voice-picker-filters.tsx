"use client";

import { Search, X } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  LIBRARY_ACCENTS, LIBRARY_AGES, LIBRARY_GENDERS, LIBRARY_LANGUAGES, LIBRARY_SORTS, LIBRARY_USE_CASES,
} from "@/lib/elevenlabs/constants";
import { ACCOUNT_SORTS, formatLabel, hasActiveFilters, labelOptions, type VoiceFilters } from "@/lib/elevenlabs/voice-filters";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";
import type { VoiceTab } from "@/hooks/use-voice-browser";

const ANY = "any";

type Option = { value: string; label: string };
const opts = (values: readonly string[]): Option[] => values.map((v) => ({ value: v, label: formatLabel(v) }));

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (v: string) => void }) {
  return (
    <Select value={value || ANY} onValueChange={(v) => onChange(!v || v === ANY ? "" : String(v))}>
      <SelectTrigger size="sm" className="nodrag h-7 text-xs" aria-label={label}>
        <SelectValue>{value ? (options.find((o) => o.value === value)?.label ?? formatLabel(value)) : label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY} className="text-xs">Any {label.toLowerCase()}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type Props = {
  tab: VoiceTab;
  filters: VoiceFilters;
  accountAll: PickerVoice[];
  onFilter: (key: keyof VoiceFilters, value: string) => void;
  onClear: () => void;
};

// D283 — search + filter row. My voices: options from the loaded voices' labels. Library: ElevenLabs' vocabulary.
export function VideoGenVoicePickerFilters({ tab, filters, accountAll, onFilter, onClear }: Props) {
  const lib = tab === "library";
  const genders = lib ? opts(LIBRARY_GENDERS) : opts(labelOptions(accountAll, "gender"));
  const ages = lib ? opts(LIBRARY_AGES) : opts(labelOptions(accountAll, "age"));
  const accents = lib ? opts(LIBRARY_ACCENTS) : opts(labelOptions(accountAll, "accent"));
  const languages: Option[] = lib ? [...LIBRARY_LANGUAGES] : opts(labelOptions(accountAll, "language"));
  const useCases = lib ? opts(LIBRARY_USE_CASES) : opts(labelOptions(accountAll, "useCase"));
  const sorts: Option[] = lib ? [...LIBRARY_SORTS] : [...ACCOUNT_SORTS];

  return (
    <div className="flex flex-col gap-2">
      <InputGroup className="nodrag">
        <InputGroupAddon>
          <Search className="size-4" strokeWidth={1.5} />
        </InputGroupAddon>
        <InputGroupInput
          id="voice-picker-search"
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
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterSelect label="Gender" value={filters.gender} options={genders} onChange={(v) => onFilter("gender", v)} />
        <FilterSelect label="Age" value={filters.age} options={ages} onChange={(v) => onFilter("age", v)} />
        <FilterSelect label="Accent" value={filters.accent} options={accents} onChange={(v) => onFilter("accent", v)} />
        <FilterSelect label="Language" value={filters.language} options={languages} onChange={(v) => onFilter("language", v)} />
        <FilterSelect label="Use case" value={filters.useCase} options={useCases} onChange={(v) => onFilter("useCase", v)} />
        <FilterSelect label="Sort" value={filters.sort} options={sorts} onChange={(v) => onFilter("sort", v)} />
        {hasActiveFilters(filters) && (
          <Button type="button" variant="link" size="sm" className="nodrag h-7 px-1 text-xs" onClick={onClear}>
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
