import { describe, it, expect } from "vitest";
import { HELP_CHAPTERS, visibleChapters, chapterBySlug } from "@/lib/help/chapters";
import { ASSUMED_SHOT_SECONDS } from "@/lib/nodes/group-shots";
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

  it("offers five scenarios plus one per multishot model, as alternatives", () => {
    expect(chapter.steps).toHaveLength(5 + MULTISHOT_MODELS.length);
    expect(chapter.stepStyle).toBe("alternatives");
  });

  // BUG-008 — a script of up to 30s is ONE clip, which only Seedance can generate, and nothing in
  // the chapter said so. The summary states the rule and each model gets its own split template.
  it("states plainly that one script up to the ceiling is one clip, on Seedance", () => {
    expect(chapter.summary).toMatch(/one clip/i);
    expect(chapter.summary).toContain("Seedance");
  });

  it("gives every multishot model a template that marks clips within its own window, in ONE script", () => {
    for (const m of MULTISHOT_MODELS) {
      const step = chapter.steps.find((s) => s.title.startsWith(`Clips for ${m.label}`));
      expect(step, m.label).toBeDefined();
      const text = step!.sample!.text;
      expect(text).toContain(`Each clip is ${m.maxTotalSeconds} seconds or less`);
      expect(text).toContain(`No block longer than ${m.maxTotalSeconds} seconds`);
      // The heading the parser reads into `clip` (script-parse.ts).
      expect(text).toContain('"CLIP <n> (<start>–<end> SEC)"');
      expect(text).toMatch(/as few clips as possible/);
      expect(text).toMatch(/montage of quick cuts is ONE block/i);
      // One script, not several: nothing to paste into more than one node.
      expect(text).not.toContain("-----");
      expect(text).toMatch(/do not restart/);
      expect(text).toContain(m.label);
      if (m.maxCuts !== null) expect(text).toContain(`at most ${m.maxCuts} blocks`);
      else expect(text).not.toMatch(/at most \d+ blocks/);
    }
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
      // The pack ceiling, or — in a per-model scenario — that model's own window.
      expect(p, `prompt ${i + 1}`).toMatch(/No block longer than \d+ seconds/);
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
