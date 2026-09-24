// D283 — pure voice-picker logic, shared by the hook and components and unit-tested here.
import { CUSTOM_VOICE_CATEGORIES } from "./constants";
import type { PickerVoice, VoiceLabels } from "./voice-catalog";

export type VoiceFilters = {
  search: string;
  gender: string;
  age: string;
  accent: string;
  language: string;
  useCase: string;
  sort: string;
};

export const EMPTY_FILTERS: VoiceFilters = {
  search: "", gender: "", age: "", accent: "", language: "", useCase: "", sort: "",
};

export const ACCOUNT_SORTS = [
  { value: "name", label: "Name" },
  { value: "newest", label: "Newest" },
] as const;

const LABEL_KEYS = ["gender", "age", "accent", "language", "useCase"] as const;

export function hasActiveFilters(f: VoiceFilters): boolean {
  return f.search.trim() !== "" || LABEL_KEYS.some((k) => f[k] !== "");
}

function matchesSearch(v: PickerVoice, q: string): boolean {
  const hay = [v.name, v.description ?? "", ...Object.values(v.labels)].join(" ").toLowerCase();
  return hay.includes(q);
}

/** Account voices after search + label filters; custom voices first, then name (or ElevenLabs' order for "newest"). */
export function filterAccountVoices(voices: PickerVoice[], f: VoiceFilters): PickerVoice[] {
  const q = f.search.trim().toLowerCase();
  const kept = voices.filter(
    (v) => (!q || matchesSearch(v, q)) && LABEL_KEYS.every((k) => !f[k] || v.labels[k] === f[k]),
  );
  const rank = (v: PickerVoice) => (CUSTOM_VOICE_CATEGORIES.has(v.category) ? 0 : 1);
  const indexed = kept.map((v, i) => ({ v, i }));
  indexed.sort(
    (a, b) => rank(a.v) - rank(b.v) || (f.sort === "newest" ? a.i - b.i : a.v.name.localeCompare(b.v.name)),
  );
  return indexed.map((x) => x.v);
}

export function labelOptions(voices: PickerVoice[], key: keyof VoiceLabels): string[] {
  return [...new Set(voices.map((v) => v.labels[key]).filter((x): x is string => Boolean(x)))].sort();
}

export function libraryParams(f: VoiceFilters, cursor: string | null): Record<string, string> {
  const out: Record<string, string> = { source: "library" };
  if (f.search.trim()) out.search = f.search.trim();
  for (const k of LABEL_KEYS) if (f[k]) out[k] = f[k];
  if (f.sort) out.sort = f.sort;
  if (cursor !== null) out.cursor = cursor;
  return out;
}

export function formatLabel(value: string): string {
  const s = value.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
