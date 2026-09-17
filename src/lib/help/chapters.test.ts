import { describe, it, expect } from "vitest";
import { HELP_CHAPTERS, visibleChapters, chapterBySlug } from "@/lib/help/chapters";
import { PACK_CEILING_SECONDS, ASSUMED_SHOT_SECONDS } from "@/lib/nodes/group-shots";
import { MULTISHOT_MODELS } from "@/lib/nodes/multishot-models";
import { MULTISHOT_MODEL_RANGES } from "@/lib/help/script-structure-samples";

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

  it("gives every step in a visible chapter a title and body lines", () => {
    // A clip is NOT required: recording lags authoring, and an unrecorded step still
    // answers the question through its title and body, with a placeholder in the pane.
    for (const c of visibleChapters()) {
      for (const [i, s] of c.steps.entries()) {
        expect(s.title.trim(), `${c.slug} step ${i + 1} title`).not.toBe("");
        expect(s.body.length, `${c.slug} step ${i + 1} body`).toBeGreaterThan(0);
        for (const line of s.body) {
          expect(line.trim(), `${c.slug} step ${i + 1} body line`).not.toBe("");
        }
      }
    }
  });

  it("points every clip that exists at a local /help-videos path", () => {
    // Clips ship from public/ now. A leftover absolute URL would 404 silently in the
    // player, which looks identical to "not recorded yet" but isn't.
    for (const c of HELP_CHAPTERS) {
      for (const [i, s] of c.steps.entries()) {
        if (s.clip === "") continue;
        expect(s.clip, `${c.slug} step ${i + 1} clip`).toMatch(
          /^\/help-videos\/[a-z0-9-]+\/[a-z0-9-]+\.mp4$/,
        );
      }
    }
  });

  it("keeps draft chapters out of the menu", () => {
    expect(visibleChapters().some((c) => c.draft)).toBe(false);
    expect(HELP_CHAPTERS.some((c) => c.draft)).toBe(true);
  });

  it("shows the seven V1 chapters plus script structure", () => {
    expect(visibleChapters().map((c) => c.slug)).toEqual([
      "create-a-reel",
      "structure-a-script",
      "review-the-brand-kb",
      "edit-an-image",
      "generate-a-reference-image",
      "bring-in-references",
      "why-cant-i-edit-this-canvas",
      "where-did-my-video-go",
    ]);
  });

  it("gives every sample a label and text", () => {
    for (const c of HELP_CHAPTERS) {
      for (const [i, s] of c.steps.entries()) {
        if (!s.sample) continue;
        expect(s.sample.label.trim(), `${c.slug} step ${i + 1} sample label`).not.toBe("");
        expect(s.sample.text.trim(), `${c.slug} step ${i + 1} sample text`).not.toBe("");
      }
    }
  });
});

describe("structure-a-script", () => {
  const chapter = chapterBySlug("structure-a-script")!;
  const prompts = chapter.steps.map((s) => s.sample!.text);

  it("offers five scenarios as alternatives, not a sequence", () => {
    expect(chapter.steps).toHaveLength(5);
    expect(chapter.stepStyle).toBe("alternatives");
  });

  // Every step is text-first — none is recorded — so each needs a sample in the pane, or the
  // viewer is left looking at "No clip for this step yet" beside the real answer.
  it("gives every scenario a prompt to copy", () => {
    for (const [i, s] of chapter.steps.entries()) {
      expect(s.sample, `step ${i + 1}`).toBeDefined();
    }
  });

  // Each prompt is pasted into another tool on its own, so each must carry the whole format and
  // the real limits — interpolated from the grouping code, so they cannot drift from it.
  it("gives every prompt the block format and the real limits", () => {
    for (const [i, p] of prompts.entries()) {
      expect(p, `prompt ${i + 1}`).toContain("<start>–<end> SEC —");
      expect(p, `prompt ${i + 1}`).toContain(`No block longer than ${PACK_CEILING_SECONDS} seconds`);
      expect(p, `prompt ${i + 1}`).toContain(`counted as ${ASSUMED_SHOT_SECONDS} seconds`);
      expect(p.trimEnd(), `prompt ${i + 1}`).toMatch(/SCRIPT$/);
    }
  });

  it("marks the single take the way the parser keeps it whole", () => {
    expect(prompts[0]).toContain("ONE CONTINUOUS TAKE (NO CUTS)");
  });

  // The multishot ranges come from the capability table, so a vendor moving a limit moves the
  // sentence the creator reads.
  it("names each multishot model's real window", () => {
    for (const m of MULTISHOT_MODELS) {
      expect(MULTISHOT_MODEL_RANGES).toContain(`${m.label} up to ${m.maxTotalSeconds}s`);
    }
  });
});

describe("help chapter lookups", () => {

  it("finds a chapter by slug and returns undefined for an unknown one", () => {
    expect(chapterBySlug("create-a-reel")?.steps).toHaveLength(6);
    expect(chapterBySlug("nope")).toBeUndefined();
  });
});
