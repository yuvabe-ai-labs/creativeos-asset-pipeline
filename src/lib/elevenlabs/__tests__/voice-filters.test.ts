import { describe, it, expect } from "vitest";
import {
  EMPTY_FILTERS, filterAccountVoices, labelOptions, libraryParams, hasActiveFilters, formatLabel,
} from "../voice-filters";
import type { PickerVoice } from "../voice-catalog";

const v = (voiceId: string, name: string, labels: PickerVoice["labels"], category = "premade", description: string | null = null): PickerVoice => ({
  voiceId, source: "account", name, description, previewUrl: null, labels, category, priceMultiplier: 1,
});

const VOICES = [
  v("1", "Sarah", { gender: "female", age: "young", accent: "american", language: "en", useCase: "informative_educational" }),
  v("2", "Priya", { gender: "female", age: "young", accent: "indian", language: "hi", useCase: "social_media" }, "cloned", "Warm brand voice"),
  v("3", "Adam", { gender: "male", age: "middle_aged", accent: "american", language: "en" }),
];

describe("filterAccountVoices", () => {
  it("returns custom voices first, then by name, with no filters", () => {
    expect(filterAccountVoices(VOICES, EMPTY_FILTERS).map((x) => x.voiceId)).toEqual(["2", "3", "1"]);
  });

  it("filters by every label and matches search on name, description and labels", () => {
    expect(filterAccountVoices(VOICES, { ...EMPTY_FILTERS, gender: "female" }).map((x) => x.voiceId)).toEqual(["2", "1"]);
    expect(filterAccountVoices(VOICES, { ...EMPTY_FILTERS, accent: "american", age: "middle_aged" }).map((x) => x.voiceId)).toEqual(["3"]);
    expect(filterAccountVoices(VOICES, { ...EMPTY_FILTERS, search: "warm" }).map((x) => x.voiceId)).toEqual(["2"]);
    expect(filterAccountVoices(VOICES, { ...EMPTY_FILTERS, search: "INDIAN" }).map((x) => x.voiceId)).toEqual(["2"]);
    expect(filterAccountVoices(VOICES, { ...EMPTY_FILTERS, language: "ta" })).toEqual([]);
  });

  it("keeps ElevenLabs' order within each group for 'newest'", () => {
    expect(filterAccountVoices(VOICES, { ...EMPTY_FILTERS, sort: "newest" }).map((x) => x.voiceId)).toEqual(["2", "1", "3"]);
  });
});

describe("labelOptions", () => {
  it("lists distinct values present, sorted", () => {
    expect(labelOptions(VOICES, "accent")).toEqual(["american", "indian"]);
    expect(labelOptions(VOICES, "useCase")).toEqual(["informative_educational", "social_media"]);
  });
});

describe("libraryParams", () => {
  it("sends only set filters plus the source and cursor", () => {
    expect(libraryParams({ ...EMPTY_FILTERS, gender: "female", language: "hi", sort: "trending" }, "3")).toEqual({
      source: "library", gender: "female", language: "hi", sort: "trending", cursor: "3",
    });
    expect(libraryParams(EMPTY_FILTERS, null)).toEqual({ source: "library" });
  });
});

describe("hasActiveFilters / formatLabel", () => {
  it("ignores sort when deciding whether filters are active", () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, sort: "trending" })).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, search: "x" })).toBe(true);
  });

  it("humanises API values", () => {
    expect(formatLabel("middle_aged")).toBe("Middle aged");
    expect(formatLabel("social_media")).toBe("Social media");
  });
});
