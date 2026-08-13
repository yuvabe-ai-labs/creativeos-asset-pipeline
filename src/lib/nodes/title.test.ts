import { describe, it, expect } from "vitest";
import {
  normalizeTitle,
  titleFromFilename,
  nextFileNodeTitle,
  MAX_TITLE_LENGTH,
} from "./title";

describe("normalizeTitle", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeTitle("  Hero shot  ")).toBe("Hero shot");
  });

  it("collapses internal whitespace, newlines, and tabs to single spaces", () => {
    expect(normalizeTitle("Hero\n\nshot\t\tB")).toBe("Hero shot B");
  });

  it("normalizes blank input to an empty string", () => {
    expect(normalizeTitle("   \n\t ")).toBe("");
    expect(normalizeTitle("")).toBe("");
  });

  it("leaves an already-clean title unchanged", () => {
    expect(normalizeTitle("Image prompt")).toBe("Image prompt");
  });

  it("caps length at MAX_TITLE_LENGTH with no trailing space", () => {
    const out = normalizeTitle("a ".repeat(200));
    expect(out.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
    expect(out).toBe(out.trim());
  });
});

describe("titleFromFilename", () => {
  it("drops the extension and reads separators as spaces", () => {
    expect(titleFromFilename("hero-shot.png")).toBe("hero shot");
    expect(titleFromFilename("client_brief_v2.txt")).toBe("client brief v2");
  });

  it("keeps a name that has no extension", () => {
    expect(titleFromFilename("README")).toBe("README");
  });

  it("drops only the last extension", () => {
    expect(titleFromFilename("archive.tar.gz")).toBe("archive.tar");
  });

  it("normalizes the result like any other title", () => {
    expect(titleFromFilename("  hero   shot .png")).toBe("hero shot");
  });
});

describe("nextFileNodeTitle", () => {
  it("derives a title when the node has none", () => {
    expect(
      nextFileNodeTitle({ currentTitle: "", previousFilename: undefined, nextFilename: "brief.txt" }),
    ).toBe("brief");
  });

  // FIL_02/FIL_07: replacing an image with a text file left the image's name as the title.
  it("re-derives when the title is still the previous file's derived name", () => {
    expect(
      nextFileNodeTitle({
        currentTitle: "hero shot",
        previousFilename: "hero-shot.png",
        nextFilename: "brief.txt",
      }),
    ).toBe("brief");
  });

  // A title the operator typed is theirs — a replace must not overwrite it.
  it("keeps a hand-written title", () => {
    expect(
      nextFileNodeTitle({
        currentTitle: "Q3 launch brief",
        previousFilename: "hero-shot.png",
        nextFilename: "brief.txt",
      }),
    ).toBeNull();
  });

  it("treats a title matching the previous filename verbatim as auto-derived", () => {
    // Nodes created from the Gallery Drawer are titled from the filename too — a stricter
    // equality check would read those as hand-written and never update them.
    expect(
      nextFileNodeTitle({
        currentTitle: "hero-shot",
        previousFilename: "hero-shot.png",
        nextFilename: "brief.txt",
      }),
    ).toBe("brief");
  });

  it("returns null when the derived title would not change anything", () => {
    expect(
      nextFileNodeTitle({
        currentTitle: "brief",
        previousFilename: "brief.txt",
        nextFilename: "brief.txt",
      }),
    ).toBeNull();
  });
});
