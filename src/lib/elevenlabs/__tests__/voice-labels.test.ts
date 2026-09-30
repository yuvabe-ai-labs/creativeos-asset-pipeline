import { describe, it, expect } from "vitest";
import { Hourglass, Languages, Mars, Megaphone, MapPin, Venus, VenusAndMars } from "lucide-react";
import { FILTER_FIELD_ICON, genderIcon, languageName, voiceMetaChips } from "../voice-labels";
import type { VoiceLabels } from "../voice-catalog";

describe("genderIcon", () => {
  it("maps female/male to Venus/Mars, everything else (including neutral) to VenusAndMars", () => {
    expect(genderIcon("female")).toBe(Venus);
    expect(genderIcon("male")).toBe(Mars);
    expect(genderIcon("neutral")).toBe(VenusAndMars);
    expect(genderIcon(undefined)).toBe(VenusAndMars);
    expect(genderIcon("nonbinary")).toBe(VenusAndMars);
  });
});

describe("languageName", () => {
  it("resolves a known code to its full name", () => {
    expect(languageName("hi")).toBe("Hindi");
    expect(languageName("ta")).toBe("Tamil");
  });

  it("falls back to the upper-cased code for an unknown language", () => {
    expect(languageName("xx")).toBe("XX");
  });
});

describe("FILTER_FIELD_ICON", () => {
  it("maps every filter field to its fixed category icon", () => {
    expect(FILTER_FIELD_ICON.gender).toBe(VenusAndMars);
    expect(FILTER_FIELD_ICON.age).toBe(Hourglass);
    expect(FILTER_FIELD_ICON.language).toBe(Languages);
    expect(FILTER_FIELD_ICON.accent).toBe(MapPin);
    expect(FILTER_FIELD_ICON.useCase).toBe(Megaphone);
  });
});

describe("voiceMetaChips", () => {
  const labels: VoiceLabels = { gender: "female", age: "young", language: "hi", accent: "indian", useCase: "social_media" };

  it("returns all present fields in gender, age, language, accent, use case order by default", () => {
    expect(voiceMetaChips(labels).map((c) => c.key)).toEqual(["gender", "age", "language", "accent", "useCase"]);
  });

  it("skips fields that aren't present", () => {
    expect(voiceMetaChips({ gender: "male" }).map((c) => c.key)).toEqual(["gender"]);
    expect(voiceMetaChips({}).map((c) => c.key)).toEqual([]);
  });

  it("renders humanised text and the full language name", () => {
    const chips = voiceMetaChips(labels);
    expect(chips.find((c) => c.key === "age")?.text).toBe("Young");
    expect(chips.find((c) => c.key === "language")?.text).toBe("Hindi");
    expect(chips.find((c) => c.key === "useCase")?.text).toBe("Social media");
  });

  it("honours a narrower, explicitly-ordered field list (the trigger's gender/language/accent)", () => {
    expect(voiceMetaChips(labels, ["gender", "language", "accent"]).map((c) => c.key)).toEqual([
      "gender", "language", "accent",
    ]);
  });
});
