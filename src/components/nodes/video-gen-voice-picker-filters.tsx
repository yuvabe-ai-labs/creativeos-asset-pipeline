"use client";

import { Check } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LIBRARY_ACCENTS, LIBRARY_AGES, LIBRARY_GENDERS, LIBRARY_LANGUAGES, LIBRARY_USE_CASES,
} from "@/lib/elevenlabs/constants";
import { formatLabel, hasActiveFilters, labelOptions, type VoiceFilters } from "@/lib/elevenlabs/voice-filters";
import { FILTER_FIELD_ICON, genderIcon, languageName } from "@/lib/elevenlabs/voice-labels";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";
import type { VoiceTab } from "@/hooks/use-voice-browser";
import { VideoGenVoicePickerLanguage } from "./video-gen-voice-picker-language";

type Option = { value: string; label: string };
const opts = (values: readonly string[]): Option[] => values.map((v) => ({ value: v, label: formatLabel(v) }));

// Chips that toggle: click one to filter by it, click it again to clear — like ElevenLabs' own
// voice library.
function ToggleChips({
  options, value, onChange, iconFor,
}: {
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  iconFor?: (value: string) => React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o.value === value;
        const Icon = iconFor?.(o.value);
        return (
          <Button
            key={o.value}
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={active}
            onClick={() => onChange(active ? "" : o.value)}
            className={cn(
              "nodrag",
              active && "border-primary/50 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary",
            )}
          >
            {active ? <Check className="size-3.5" strokeWidth={1.5} /> : Icon && <Icon className="size-3.5" strokeWidth={1.5} />}
            {o.label}
          </Button>
        );
      })}
    </div>
  );
}

type Props = {
  tab: VoiceTab;
  filters: VoiceFilters;
  accountAll: PickerVoice[];
  onFilter: (key: keyof VoiceFilters, value: string) => void;
  onClear: () => void;
};

// D283/D284 — the voice picker's filter sidebar: Language as a searchable dropdown, then one
// collapsible section of chips per filter (sort lives at the top right of the list, in
// video-gen-voice-picker-sort.tsx).
// My voices: options from the loaded voices' labels (a section with nothing to choose from is
// hidden). Library: ElevenLabs' own vocabulary.
export function VideoGenVoicePickerFilters({ tab, filters, accountAll, onFilter, onClear }: Props) {
  const lib = tab === "library";
  const languages: Option[] = lib
    ? [...LIBRARY_LANGUAGES]
    : labelOptions(accountAll, "language").map((code) => ({ value: code, label: languageName(code) }));
  const sections: Array<{ key: Exclude<keyof VoiceFilters, "search" | "sort" | "language">; label: string; options: Option[] }> = [
    { key: "useCase", label: "Categories", options: lib ? opts(LIBRARY_USE_CASES) : opts(labelOptions(accountAll, "useCase")) },
    { key: "gender", label: "Gender", options: lib ? opts(LIBRARY_GENDERS) : opts(labelOptions(accountAll, "gender")) },
    { key: "age", label: "Age", options: lib ? opts(LIBRARY_AGES) : opts(labelOptions(accountAll, "age")) },
    { key: "accent", label: "Accent", options: lib ? opts(LIBRARY_ACCENTS) : opts(labelOptions(accountAll, "accent")) },
  ];
  const visible = sections.filter((s) => s.options.length > 0);

  return (
    <div className="flex flex-col gap-1">
      {languages.length > 0 && (
        <div className="flex flex-col gap-2 pb-2">
          <span className="text-sm font-medium">Language</span>
          <VideoGenVoicePickerLanguage options={languages} value={filters.language} onChange={(v) => onFilter("language", v)} />
        </div>
      )}
      {/* Categories open by default; the rest start collapsed. */}
      <Accordion multiple defaultValue={["useCase"]}>
        {visible.map((s) => {
          const Icon = FILTER_FIELD_ICON[s.key];
          return (
            <AccordionItem key={s.key} value={s.key} className="border-none">
              <AccordionTrigger className="nodrag py-2 hover:no-underline">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Icon className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
                  {s.label}
                  {filters[s.key] && <span className="size-1.5 rounded-full bg-primary" aria-label="filter on" />}
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <ToggleChips
                  options={s.options}
                  value={filters[s.key]}
                  onChange={(v) => onFilter(s.key, v)}
                  iconFor={s.key === "gender" ? genderIcon : undefined}
                />
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
      {hasActiveFilters(filters) && (
        <Button type="button" variant="link" size="sm" className="nodrag h-7 self-start px-0 text-xs" onClick={onClear}>
          Clear filters
        </Button>
      )}
    </div>
  );
}
