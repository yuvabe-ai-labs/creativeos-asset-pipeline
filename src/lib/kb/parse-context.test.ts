import { describe, it, expect } from "vitest";
import type { TraceableBrandKB } from "./schema";
import {
  buildParseContext,
  normalizeSlices,
  DEFAULT_PARSE_SLICES,
} from "./parse-context";

// Minimal KBField factory — buildParseContext only reads `.value`.
const f = (value: unknown) => ({
  value,
  confidence: "high",
  evidence_type: "explicit",
  status: "needs_review",
});

// Partial KB cast to the full type; only fields under test are populated.
const kb = {
  brand_profile: {
    brand_name: f("Acme"),
    tagline: f(null),
    positioning: f(null),
    mission: f(null),
    industry: f(null),
    tone_of_voice: f("warm, conversational"),
    personality: f(["premium", "educational"]),
  },
  compliance: {
    never_use_words: f(["cure", "heal"]),
    never_use_claims: f([]),
    never_use_tone: f(null),
    preferred_verbs: f(["helps"]),
    preferred_phrases: f(null),
    disclaimers: f(["results may vary"]),
  },
} as unknown as TraceableBrandKB;

describe("normalizeSlices", () => {
  it("keeps valid keys", () => {
    expect(normalizeSlices(["compliance", "tone_of_voice"])).toEqual([
      "compliance",
      "tone_of_voice",
    ]);
  });
  it("drops unknown keys", () => {
    expect(normalizeSlices(["compliance", "bogus"])).toEqual(["compliance"]);
  });
  it("falls back to defaults when all keys are invalid", () => {
    expect(normalizeSlices(["bogus", "also_bogus"])).toEqual(DEFAULT_PARSE_SLICES);
  });
  it("falls back to defaults on empty array", () => {
    expect(normalizeSlices([])).toEqual(DEFAULT_PARSE_SLICES);
  });
  it("falls back to defaults on non-array input", () => {
    expect(normalizeSlices(undefined)).toEqual(DEFAULT_PARSE_SLICES);
  });
});

describe("buildParseContext", () => {
  it("renders the default slices, skipping null/empty fields", () => {
    const out = buildParseContext(kb, DEFAULT_PARSE_SLICES);
    expect(out).toContain("Tone of voice: warm, conversational");
    expect(out).toContain("Personality: premium, educational");
    expect(out).toContain("Avoid words: cure, heal");
    expect(out).toContain("Preferred verbs: helps");
    expect(out).toContain("Disclaimers: results may vary");
    // null / empty-array compliance fields are omitted
    expect(out).not.toContain("Avoid claims");
    expect(out).not.toContain("Avoid tone");
    expect(out).not.toContain("Preferred phrases");
    // brand_profile slice is off by default
    expect(out).not.toContain("Brand name");
  });

  it("includes brand_profile fields when that slice is selected", () => {
    const out = buildParseContext(kb, ["brand_profile"]);
    expect(out).toContain("Brand name: Acme");
    expect(out).not.toContain("Tagline"); // null, omitted
    expect(out).not.toContain("Tone of voice");
    expect(out).not.toContain("Personality");
  });

  it("returns empty string for an empty selection", () => {
    expect(buildParseContext(kb, [])).toBe("");
  });

  it("returns empty string when all selected fields are null", () => {
    const emptyKb = {
      brand_profile: { tone_of_voice: f(null), personality: f(null) },
      compliance: {
        never_use_words: f(null),
        never_use_claims: f(null),
        never_use_tone: f(null),
        preferred_verbs: f(null),
        preferred_phrases: f(null),
        disclaimers: f(null),
      },
    } as unknown as TraceableBrandKB;
    expect(buildParseContext(emptyKb, DEFAULT_PARSE_SLICES)).toBe("");
  });
});
