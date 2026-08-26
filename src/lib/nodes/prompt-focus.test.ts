import { describe, it, expect } from "vitest";
import {
  buildVersionChips,
  splitSentenceBeats,
  segmentByTerms,
  CAMERA_SPEC_PATTERNS,
} from "./prompt-focus";

describe("segmentByTerms — tolerant matching", () => {
  it("treats hyphens and spaces as interchangeable inside a term", () => {
    expect(segmentByTerms("a center framed composition", ["center-framed composition"])).toEqual([
      { text: "a ", highlighted: false },
      { text: "center framed composition", highlighted: true },
    ]);
  });

  it("matches the close-cropped spelling via the close cropped variant", () => {
    expect(segmentByTerms("a close-cropped frame", ["close cropped"])).toEqual([
      { text: "a ", highlighted: false },
      { text: "close-cropped", highlighted: true },
      { text: " frame", highlighted: false },
    ]);
  });

  it("matches camera spec patterns: focal lengths and apertures the model invented", () => {
    expect(segmentByTerms("at f/4 on a 100mm lens", CAMERA_SPEC_PATTERNS)).toEqual([
      { text: "at ", highlighted: false },
      { text: "f/4", highlighted: true },
      { text: " on a ", highlighted: false },
      { text: "100mm", highlighted: true },
      { text: " lens", highlighted: false },
    ]);
  });

  it("highlights reordered control prose in a real generated sentence", () => {
    const text =
      "Shot as an extreme close detail on a 100mm macro lens, f/4, shallow depth of field, with three-point studio softbox lighting.";
    const terms = [
      "100mm macro lens",
      "extreme close detail",
      "center-framed composition",
      "three-point studio softbox lighting",
      ...CAMERA_SPEC_PATTERNS,
    ];
    const highlighted = segmentByTerms(text, terms)
      .filter((s) => s.highlighted)
      .map((s) => s.text);
    expect(highlighted).toEqual([
      "extreme close detail",
      "100mm macro lens",
      "f/4",
      "three-point studio softbox lighting",
    ]);
  });
});

describe("segmentByTerms", () => {
  it("splits text into plain and highlighted segments around a matched term", () => {
    expect(segmentByTerms("Shot on a 100mm macro lens today.", ["100mm macro lens"])).toEqual([
      { text: "Shot on a ", highlighted: false },
      { text: "100mm macro lens", highlighted: true },
      { text: " today.", highlighted: false },
    ]);
  });

  it("matches case-insensitively but preserves the original casing", () => {
    expect(segmentByTerms("Center-Framed composition wins.", ["center-framed composition"])).toEqual([
      { text: "Center-Framed composition", highlighted: true },
      { text: " wins.", highlighted: false },
    ]);
  });

  it("highlights every occurrence of every term", () => {
    expect(segmentByTerms("deep focus, then deep focus", ["deep focus"])).toEqual([
      { text: "deep focus", highlighted: true },
      { text: ", then ", highlighted: false },
      { text: "deep focus", highlighted: true },
    ]);
  });

  it("prefers the longer term when terms overlap", () => {
    expect(
      segmentByTerms("a 100mm macro lens with extreme close detail", [
        "macro lens",
        "100mm macro lens with extreme close detail",
      ]),
    ).toEqual([
      { text: "a ", highlighted: false },
      { text: "100mm macro lens with extreme close detail", highlighted: true },
    ]);
  });

  it("returns the whole text unhighlighted when no term matches", () => {
    expect(segmentByTerms("No matches here.", ["golden hour"])).toEqual([
      { text: "No matches here.", highlighted: false },
    ]);
  });

  it("returns no segments for empty text", () => {
    expect(segmentByTerms("", ["x"])).toEqual([]);
  });
});

describe("splitSentenceBeats", () => {
  it("splits a paragraph into one beat per sentence, keeping terminal punctuation", () => {
    expect(
      splitSentenceBeats("A centered pair of jars sits on stone. The scene is a clean studio. Editorial finish."),
    ).toEqual([
      "A centered pair of jars sits on stone.",
      "The scene is a clean studio.",
      "Editorial finish.",
    ]);
  });

  it("keeps decimal numbers and lens specs intact", () => {
    expect(
      splitSentenceBeats("Shot on a 100mm macro lens at f/1.8 with shallow depth of field. Lit with softboxes."),
    ).toEqual([
      "Shot on a 100mm macro lens at f/1.8 with shallow depth of field.",
      "Lit with softboxes.",
    ]);
  });

  it("keeps a trailing sentence that has no terminal period", () => {
    expect(splitSentenceBeats("First beat ends here. and a trailing fragment")).toEqual([
      "First beat ends here.",
      "and a trailing fragment",
    ]);
  });

  it("treats newlines between sentences as boundaries", () => {
    expect(splitSentenceBeats("One beat.\nAnother beat.")).toEqual(["One beat.", "Another beat."]);
  });

  it("returns an empty list for empty or whitespace-only text", () => {
    expect(splitSentenceBeats("")).toEqual([]);
    expect(splitSentenceBeats("   \n ")).toEqual([]);
  });

  it("splits on question and exclamation marks too", () => {
    expect(splitSentenceBeats("Is it bold? It is! Ship it.")).toEqual(["Is it bold?", "It is!", "Ship it."]);
  });
});

describe("buildVersionChips", () => {
  const versions = [
    { id: "c", error: null }, // newest first (index 0) -> highest v number
    { id: "b", error: "boom" },
    { id: "a", error: null },
  ];

  it("numbers newest-first as v{total - index} and marks the active chip", () => {
    const chips = buildVersionChips(versions, "a", false);
    expect(chips.map((c) => c.label)).toEqual(["v3", "v2", "v1"]);
    expect(chips.find((c) => c.id === "a")?.isActive).toBe(true);
    expect(chips.find((c) => c.id === "c")?.isActive).toBe(false);
  });

  it("disables the active chip, error chips, and (while restoring) all chips", () => {
    const chips = buildVersionChips(versions, "a", false);
    expect(chips.find((c) => c.id === "a")?.disabled).toBe(true); // active
    expect(chips.find((c) => c.id === "b")?.disabled).toBe(true); // error
    expect(chips.find((c) => c.id === "b")?.isError).toBe(true);
    expect(chips.find((c) => c.id === "c")?.disabled).toBe(false); // clickable

    const restoring = buildVersionChips(versions, "a", true);
    expect(restoring.every((c) => c.disabled)).toBe(true);
  });

  it("returns an empty array for no versions", () => {
    expect(buildVersionChips([], null, false)).toEqual([]);
  });
});
