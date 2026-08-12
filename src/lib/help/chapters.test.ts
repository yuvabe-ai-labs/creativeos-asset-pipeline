import { describe, it, expect } from "vitest";
import { HELP_CHAPTERS, visibleChapters, chapterBySlug } from "@/lib/help/chapters";

describe("help chapters", () => {
  it("has unique slugs", () => {
    const slugs = HELP_CHAPTERS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("gives every chapter a non-empty summary", () => {
    // The map page is unconditional, so a missing summary ships a blank first page.
    for (const c of HELP_CHAPTERS) {
      expect(c.summary.trim(), `${c.slug} summary`).not.toBe("");
    }
  });

  it("gives every chapter at least one step", () => {
    for (const c of HELP_CHAPTERS) {
      expect(c.steps.length, `${c.slug} steps`).toBeGreaterThan(0);
    }
  });

  it("gives every step in a visible chapter a clip, a title and body lines", () => {
    for (const c of visibleChapters()) {
      for (const [i, s] of c.steps.entries()) {
        expect(s.clip.trim(), `${c.slug} step ${i + 1} clip`).not.toBe("");
        expect(s.title.trim(), `${c.slug} step ${i + 1} title`).not.toBe("");
        expect(s.body.length, `${c.slug} step ${i + 1} body`).toBeGreaterThan(0);
        for (const line of s.body) {
          expect(line.trim(), `${c.slug} step ${i + 1} body line`).not.toBe("");
        }
      }
    }
  });

  it("keeps draft chapters out of the menu", () => {
    expect(visibleChapters().some((c) => c.draft)).toBe(false);
    expect(HELP_CHAPTERS.some((c) => c.draft)).toBe(true);
  });

  it("shows exactly the seven V1 chapters", () => {
    expect(visibleChapters().map((c) => c.slug)).toEqual([
      "create-a-reel",
      "review-the-brand-kb",
      "edit-an-image",
      "generate-a-reference-image",
      "bring-in-references",
      "why-cant-i-edit-this-canvas",
      "where-did-my-video-go",
    ]);
  });

  it("finds a chapter by slug and returns undefined for an unknown one", () => {
    expect(chapterBySlug("create-a-reel")?.steps).toHaveLength(7);
    expect(chapterBySlug("nope")).toBeUndefined();
  });
});
