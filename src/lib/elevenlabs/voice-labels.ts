// D283 — pure label → icon and code → name mappings for the voice picker's meta chips and
// filter triggers. No JSX; components render from this.
import {
  ArrowUpDown, Hourglass, Languages, Mars, Megaphone, MapPin, Venus, VenusAndMars, type LucideIcon,
} from "lucide-react";
import { LIBRARY_LANGUAGES } from "./constants";
import { formatLabel } from "./voice-filters";
import type { VoiceLabels } from "./voice-catalog";

/** The icon for a filter's own category (shown inside its SelectTrigger, before the label). */
export const FILTER_FIELD_ICON: Record<"gender" | "age" | "language" | "accent" | "useCase" | "sort", LucideIcon> = {
  gender: VenusAndMars,
  age: Hourglass,
  language: Languages,
  accent: MapPin,
  useCase: Megaphone,
  sort: ArrowUpDown,
};

/** A specific voice's gender value → icon. "neutral" and anything unrecognised read as VenusAndMars. */
export function genderIcon(gender: string | undefined): LucideIcon {
  if (gender === "female") return Venus;
  if (gender === "male") return Mars;
  return VenusAndMars;
}

const LANGUAGE_NAME_BY_CODE = new Map<string, string>(LIBRARY_LANGUAGES.map((l) => [l.value, l.label]));

/** Full language name for an ElevenLabs language code; unknown codes fall back to upper-case. */
export function languageName(code: string): string {
  return LANGUAGE_NAME_BY_CODE.get(code) ?? code.toUpperCase();
}

export type VoiceMetaField = "gender" | "age" | "language" | "accent" | "useCase";
export type VoiceMetaChip = { key: VoiceMetaField; icon: LucideIcon; text: string };

const ALL_META_FIELDS: VoiceMetaField[] = ["gender", "age", "language", "accent", "useCase"];

function chipFor(field: VoiceMetaField, value: string): VoiceMetaChip {
  switch (field) {
    case "gender":
      return { key: field, icon: genderIcon(value), text: formatLabel(value) };
    case "age":
      return { key: field, icon: Hourglass, text: formatLabel(value) };
    case "language":
      return { key: field, icon: Languages, text: languageName(value) };
    case "accent":
      return { key: field, icon: MapPin, text: formatLabel(value) };
    case "useCase":
      return { key: field, icon: Megaphone, text: formatLabel(value) };
  }
}

/**
 * Meta chips for a voice's labels, in `fields` order, skipping any that aren't present.
 * Defaults to every field (row use); the trigger passes a narrower subset.
 */
export function voiceMetaChips(labels: VoiceLabels, fields: VoiceMetaField[] = ALL_META_FIELDS): VoiceMetaChip[] {
  const chips: VoiceMetaChip[] = [];
  for (const field of fields) {
    const value = labels[field];
    if (value) chips.push(chipFor(field, value));
  }
  return chips;
}
