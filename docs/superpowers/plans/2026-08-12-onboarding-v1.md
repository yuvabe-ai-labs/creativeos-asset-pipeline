# Onboarding V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship pull-based onboarding for design partners — two list empty states that carry their own create action, and a global `Help ▾` menu opening chaptered, video-led explainers.

**Architecture:** All testable logic lives in `src/lib/help/` (chapter data + deep-link parsing) and is TDD'd in node-env vitest. The React layer is thin: a menu in the existing global header, a dialog whose first page is always a map derived from step titles, and step pages that pair text with a looping muted clip. No new tables, no new columns, no per-user state.

**Tech Stack:** Next.js 16, React 19, TypeScript, Base UI (`@base-ui/react` ^1.5.0) via the shadcn registry, Tailwind v4, Zustand, vitest ^4.1.8 (node environment).

**Spec:** `docs/superpowers/specs/2026-08-12-onboarding-empty-states-and-help-chapters-design.md`

## Global Constraints

- **Controls must be shadcn primitives from `src/components/ui/*`.** Never a raw `<button>`, `<input>`, `<select>`, `<textarea>`. Base UI composes via the **`render` prop**, not `asChild`. If a primitive is missing, add it to `src/components/ui/` (Task 3 does exactly this).
- **Never hardcode colors.** Drive everything through the shadcn CSS variables in `src/app/globals.css`. Purple `#5829c7` is used sparingly (primary CTA, focus ring) and is never a large background fill.
- **Two font families only:** `font-display` (Clash Display) for headings, default `font-sans` (Gilroy) for body. Use the `.text-eyebrow` utility for tracked small-caps labels.
- **Cards:** white, 1px `neutral-200` border, `shadow-card`, radius 12–24px. Existing empty-state cards use `border-dashed p-14 text-center` — match it.
- **Motion:** easing `cubic-bezier(0.22,1,0.36,1)` only. Durations 200/320/500ms. No springs, no bounce.
- **Icons:** Lucide only, `strokeWidth={1.5}`, no fills.
- **One component per file, named export.** Split at ~200 lines. See `docs/component-structure.md`.
- **Import, don't redefine.** Before adding any constant or helper, grep for it first.
- **Tests are node-environment only.** `vitest.config.ts` sets `environment: "node"`; there is no jsdom and no React Testing Library. Do **not** add them. Test `src/lib/**` logic; verify components with `npx tsc --noEmit` and `npm run lint`.
- **Test command:** `npm test` (= `vitest run`). Single file: `npx vitest run src/lib/help/chapters.test.ts`.
- **React Compiler lint rules are on.** `react-hooks/purity` forbids `Date.now()` / `Math.random()` / other impure calls in render scope. `react-hooks/set-state-in-effect` forbids synchronous `setState` inside effects. Derive state during render instead.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/help/types.ts` | `HelpStep`, `HelpChapter` type definitions — no data, no logic |
| `src/lib/help/chapters.ts` | The seven authored chapters + `visibleChapters()` / `chapterBySlug()` accessors |
| `src/lib/help/deep-link.ts` | Pure parse/serialize between URL params and `{slug, step}` |
| `src/components/ui/dropdown-menu.tsx` | Base UI Menu wrapper, house-styled — a missing primitive |
| `src/components/help/help-menu.tsx` | The `Help ▾` trigger + chapter list; owns which chapter is open |
| `src/components/help/help-chapter-dialog.tsx` | Modal shell + page state + prev/next/dots |
| `src/components/help/help-map-page.tsx` | Page 1: summary + numbered blocks (sequence or alternatives) |
| `src/components/help/help-step-page.tsx` | Pages 2..N: description left, looping clip right |
| `src/components/shared/empty-state.tsx` | Reusable title + concept line + action card |

Logic sits in `src/lib/help/` precisely because that is the only layer this repo can test.

---

## Task 1: Chapter types and data

**Files:**
- Create: `src/lib/help/types.ts`
- Create: `src/lib/help/chapters.ts`
- Test: `src/lib/help/chapters.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type HelpStep = { title: string; body: string; clip: string }`; `type HelpChapter = { slug: string; question: string; summary: string; steps: HelpStep[]; mapStyle?: "sequence" | "alternatives"; draft?: boolean }`; `HELP_CHAPTERS: HelpChapter[]`; `visibleChapters(): HelpChapter[]`; `chapterBySlug(slug: string): HelpChapter | undefined`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/help/chapters.test.ts`:

```ts
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

  it("gives every step in a visible chapter a clip and a title", () => {
    for (const c of visibleChapters()) {
      for (const [i, s] of c.steps.entries()) {
        expect(s.clip.trim(), `${c.slug} step ${i + 1} clip`).not.toBe("");
        expect(s.title.trim(), `${c.slug} step ${i + 1} title`).not.toBe("");
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/help/chapters.test.ts`
Expected: FAIL — cannot resolve `@/lib/help/chapters`.

- [ ] **Step 3: Write the types**

Create `src/lib/help/types.ts`:

```ts
export type HelpStep = {
  title: string; // also the caption of this step's block on the map page
  body: string;
  clip: string; // URL of the looping clip (GCS)
};

export type HelpChapter = {
  slug: string; // URL key, e.g. "create-a-reel"
  question: string; // menu label, e.g. "How do I create a reel?"
  summary: string; // required — the description on the map page every chapter opens with
  steps: HelpStep[];
  /**
   * "sequence" (default) draws connectors between map blocks. "alternatives" drops them —
   * for chapters that are several routes to one outcome, where connectors would tell the
   * viewer to do all of them in order.
   */
  mapStyle?: "sequence" | "alternatives";
  draft?: boolean; // authored but unrecorded — excluded from the menu
};
```

- [ ] **Step 4: Write the chapter data**

Create `src/lib/help/chapters.ts`. Clip URLs point at a GCS prefix; the constant is the single place to change if the bucket moves.

```ts
import type { HelpChapter } from "@/lib/help/types";

// Clips are hosted in object storage rather than committed — ~40 eventual clips would
// otherwise become permanent repo weight (D13 keeps bytes out of the database too).
const CLIPS = "https://storage.googleapis.com/creativeos-help/v1";

export const HELP_CHAPTERS: HelpChapter[] = [
  {
    slug: "create-a-reel",
    question: "How do I create a reel?",
    summary:
      "The full path from a finished script to an approved clip. Every step happens on one canvas — you never leave to another tool.",
    steps: [
      {
        title: "Paste your reel script",
        body: "Open the Script node and paste the finished script, or drop a .md or .txt file. CreativeOS parses it into structured, editable fields.",
        clip: `${CLIPS}/create-a-reel/01-paste-script.mp4`,
      },
      {
        title: "Fan out the shots",
        body: "One reel is many shots. Fanning out turns each shot in the parsed script into its own Shot node you can work on independently.",
        clip: `${CLIPS}/create-a-reel/02-fan-out-shots.mp4`,
      },
      {
        title: "Write the image prompt for a shot",
        body: "From a Shot node, create the image prompt. It carries the shot's visual description and the client's Brand KB — not the reel copy.",
        clip: `${CLIPS}/create-a-reel/03-image-prompt.mp4`,
      },
      {
        title: "Generate and approve the image",
        body: "Set your controls and generate. Every attempt is kept, so you can compare and approve the one you want.",
        clip: `${CLIPS}/create-a-reel/04-generate-image.mp4`,
      },
      {
        title: "Write the motion prompt from the approved still",
        body: "The Video Prompt node reads your approved still and writes a motion prompt with camera and movement controls.",
        clip: `${CLIPS}/create-a-reel/05-motion-prompt.mp4`,
      },
      {
        title: "Generate the clip",
        body: "Video generation runs in the background. Keep working — the generation tray tells you when it is ready.",
        clip: `${CLIPS}/create-a-reel/06-generate-clip.mp4`,
      },
      {
        title: "Approve and archive",
        body: "Approve the clip you want, then archive the project to bundle the script, prompts, controls and attempts together.",
        clip: `${CLIPS}/create-a-reel/07-approve-archive.mp4`,
      },
    ],
  },
  {
    slug: "review-the-brand-kb",
    question: "How do I review the Brand KB?",
    summary:
      "The Brand KB is built once per client and feeds every generation after that. Reviewing it is a one-time pass — and there is a fast way through it.",
    steps: [
      {
        title: "What the KB is, and where these values came from",
        body: "Around 40 fields across seven modules, extracted from the brand site and the documents you uploaded. Each field shows its confidence and whether it was stated or inferred.",
        clip: `${CLIPS}/review-the-brand-kb/01-what-it-is.mp4`,
      },
      {
        title: "Work module by module",
        body: "Take one module at a time. Where the extraction did well, Approve all clears the whole module in a click — you do not have to touch every field individually.",
        clip: `${CLIPS}/review-the-brand-kb/02-module-by-module.mp4`,
      },
      {
        title: "Fix a field — edit, reject, or re-ask",
        body: "Edit the value directly, reject it as not applicable, or re-ask with a comment like 'this brand is vegan, not luxury' to re-extract just that field.",
        clip: `${CLIPS}/review-the-brand-kb/03-fix-a-field.mp4`,
      },
      {
        title: "Mark the KB ready",
        body: "Once every field is reviewed, Mark KB Ready unlocks. That is what makes canvases available for this client.",
        clip: `${CLIPS}/review-the-brand-kb/04-mark-ready.mp4`,
      },
    ],
  },
  {
    slug: "edit-an-image",
    question: "How do I edit an image?",
    summary:
      "A targeted change to an image you already generated. An edit is a new attempt on the same node — your earlier versions are never overwritten.",
    steps: [
      {
        title: "Choose what to change — remove, replace, or add",
        body: "On the Image Gen node, pick the quick action that matches your intent. The rest of the image is preserved.",
        clip: `${CLIPS}/edit-an-image/01-choose-change.mp4`,
      },
      {
        title: "Run the edit and compare it against earlier attempts",
        body: "The edit runs the model, so it lands as a new attempt in the version log. Step back through attempts to compare before approving.",
        clip: `${CLIPS}/edit-an-image/02-compare-attempts.mp4`,
      },
    ],
  },
  {
    slug: "generate-a-reference-image",
    question: "How do I generate a reference image?",
    summary:
      "Sometimes you need an image to steer another generation rather than to ship. Generate it, then wire it in as a reference.",
    steps: [
      {
        title: "Generate the look you want to reference",
        body: "Use an Image Gen node and prompt for palette, surface and mood — the qualities you want carried over — rather than for the finished asset.",
        clip: `${CLIPS}/generate-a-reference-image/01-generate-the-look.mp4`,
      },
      {
        title: "Bring it in from Generated Images",
        body: "Right-click the node that needs the reference, choose Add Reference Image, and pick it from the Generated Images tab.",
        clip: `${CLIPS}/generate-a-reference-image/02-add-reference.mp4`,
      },
      {
        title: "Connect it, then generate",
        body: "The picker drops a File node beside your target but does not wire it up. Draw the connection yourself — an unconnected reference is simply ignored.",
        clip: `${CLIPS}/generate-a-reference-image/03-connect-and-generate.mp4`,
      },
    ],
  },
  {
    slug: "bring-in-references",
    question: "How do I bring in references?",
    summary:
      "Three ways to get an existing image onto the canvas. Pick whichever suits where the image lives — they all end the same way.",
    mapStyle: "alternatives",
    steps: [
      {
        title: "Upload or paste",
        body: "Drop an image file straight onto the canvas, or paste one from your clipboard. Either creates a File node where you drop it.",
        clip: `${CLIPS}/bring-in-references/01-upload-or-paste.mp4`,
      },
      {
        title: "Pull from Google Drive or this canvas's generated images",
        body: "Right-click a node and choose Add Reference Image to browse connected Drive folders or everything already generated on this canvas.",
        clip: `${CLIPS}/bring-in-references/02-drive-or-generated.mp4`,
      },
      {
        title: "Reuse a client moodboard",
        body: "Open the Gallery drawer, switch to Moodboards, and drag an item onto the canvas. It becomes an ordinary File node.",
        clip: `${CLIPS}/bring-in-references/03-moodboard.mp4`,
      },
    ],
  },
  {
    slug: "why-cant-i-edit-this-canvas",
    question: "Why can't I edit this canvas?",
    summary:
      "A canvas is edited by one person at a time. If it opened read-only, someone else is holding it — here is how to tell, and how to take over.",
    steps: [
      {
        title: "Someone else holds the editing lock",
        body: "The banner names who is editing. You can still open every node and read everything — only changes are blocked, so you cannot overwrite their work.",
        clip: `${CLIPS}/why-cant-i-edit-this-canvas/01-someone-editing.mp4`,
      },
      {
        title: "Take over once their session goes stale",
        body: "If they have stopped working, the take-over button becomes available and the canvas becomes yours to edit.",
        clip: `${CLIPS}/why-cant-i-edit-this-canvas/02-take-over.mp4`,
      },
    ],
  },
  {
    slug: "where-did-my-video-go",
    question: "Where did my video go?",
    summary:
      "Video generation takes minutes, not seconds. It keeps running whether or not you watch it — including if you close the tab.",
    steps: [
      {
        title: "Video generation runs in the background",
        body: "Once you hit generate, the job is queued and you can keep working anywhere on the canvas. Nothing is lost if you navigate away.",
        clip: `${CLIPS}/where-did-my-video-go/01-runs-in-background.mp4`,
      },
      {
        title: "Find it in the generation tray",
        body: "The tray lists every job as Running, Ready or Failed. Click one to fly to its node and open it. A ready job stays listed until you approve it.",
        clip: `${CLIPS}/where-did-my-video-go/02-generation-tray.mp4`,
      },
    ],
  },

  // ── Authored, not yet recorded. Kept here so recording one later is "add clip URLs
  // and drop the draft flag" — no code change, no design decision left to re-make.
  {
    slug: "edit-an-image-in-isolation",
    question: "How do I edit an image in isolation?",
    summary:
      "Editing an image that is not part of a reel — bring it in yourself, then edit it like any generated image.",
    draft: true,
    steps: [
      { title: "Bring the image in as a File node", body: "", clip: "" },
      { title: "Connect it to an Image Gen node", body: "", clip: "" },
      { title: "Edit it with remove, replace or add", body: "", clip: "" },
    ],
  },
  {
    slug: "create-an-image-prompt",
    question: "How do I create an image prompt?",
    summary: "Turning a shot into a prompt that carries brand context.",
    draft: true,
    steps: [
      { title: "Start from a Shot node", body: "", clip: "" },
      { title: "Check what context is attached", body: "", clip: "" },
      { title: "Generate and edit the prompt", body: "", clip: "" },
    ],
  },
  {
    slug: "create-an-image",
    question: "How do I create an image?",
    summary: "Going from a prompt to an approved still.",
    draft: true,
    steps: [
      { title: "Connect a prompt to an Image Gen node", body: "", clip: "" },
      { title: "Set the master controls", body: "", clip: "" },
      { title: "Generate and approve an attempt", body: "", clip: "" },
    ],
  },
  {
    slug: "turn-a-still-into-a-video",
    question: "How do I turn a still into a video?",
    summary: "Using an approved image as the start frame for a clip.",
    draft: true,
    steps: [
      { title: "Create a Video Prompt from the still", body: "", clip: "" },
      { title: "Set camera and motion controls", body: "", clip: "" },
      { title: "Generate the clip", body: "", clip: "" },
    ],
  },
  {
    slug: "go-back-to-an-earlier-version",
    question: "How do I go back to an earlier version?",
    summary: "Every model run is kept — how to find and restore an earlier one.",
    draft: true,
    steps: [
      { title: "Open the version history", body: "", clip: "" },
      { title: "Compare and restore a version", body: "", clip: "" },
    ],
  },
  {
    slug: "set-up-a-new-client",
    question: "How do I set up a new client?",
    summary: "Creating a client and building its Brand KB.",
    draft: true,
    steps: [
      { title: "Create the client", body: "", clip: "" },
      { title: "Add the brand site and documents", body: "", clip: "" },
      { title: "Build the KB", body: "", clip: "" },
    ],
  },
  {
    slug: "archive-a-project",
    question: "How do I archive a project?",
    summary: "Bundling a finished reel with everything that produced it.",
    draft: true,
    steps: [
      { title: "Approve the clips you want", body: "", clip: "" },
      { title: "Archive the project", body: "", clip: "" },
    ],
  },
  {
    slug: "fundamentals-of-prompting-for-images",
    question: "What are the fundamentals of prompting for images?",
    summary: "The principles behind a prompt that produces a usable still.",
    mapStyle: "alternatives",
    draft: true,
    steps: [
      { title: "Describe the subject concretely", body: "", clip: "" },
      { title: "Separate subject from style", body: "", clip: "" },
      { title: "Let the Brand KB carry brand voice", body: "", clip: "" },
    ],
  },
  {
    slug: "fundamentals-of-prompting-for-reels",
    question: "What are the fundamentals of prompting for reels?",
    summary: "How motion prompts differ from image prompts.",
    mapStyle: "alternatives",
    draft: true,
    steps: [
      { title: "Describe motion, not appearance", body: "", clip: "" },
      { title: "Keep camera language explicit", body: "", clip: "" },
      { title: "Preserve the approved still", body: "", clip: "" },
    ],
  },
];

/** Chapters shown in the menu — recorded ones only. */
export function visibleChapters(): HelpChapter[] {
  return HELP_CHAPTERS.filter((c) => !c.draft);
}

export function chapterBySlug(slug: string): HelpChapter | undefined {
  return HELP_CHAPTERS.find((c) => c.slug === slug);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/help/chapters.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/help/types.ts src/lib/help/chapters.ts src/lib/help/chapters.test.ts
git commit -m "feat(help): authored chapter data for onboarding V1"
```

---

## Task 2: Deep-link parsing

**Files:**
- Create: `src/lib/help/deep-link.ts`
- Test: `src/lib/help/deep-link.test.ts`

**Interfaces:**
- Consumes: `chapterBySlug` from Task 1.
- Produces: `type HelpLocation = { slug: string; step: number }` (`step` is 0-based, where `0` is the map page); `parseHelpParams(params: URLSearchParams): HelpLocation | null`; `helpParamsFor(slug: string, step: number): string` returning a query string such as `"?help=create-a-reel&step=3"`.

Why a separate module: this is the only part of the dialog that can be unit-tested in a node environment, so it must not live inside the component.

- [ ] **Step 1: Write the failing test**

Create `src/lib/help/deep-link.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseHelpParams, helpParamsFor } from "@/lib/help/deep-link";

const parse = (qs: string) => parseHelpParams(new URLSearchParams(qs));

describe("help deep links", () => {
  it("returns null when there is no help param", () => {
    expect(parse("")).toBeNull();
    expect(parse("foo=bar")).toBeNull();
  });

  it("opens on the map page when no step is given", () => {
    expect(parse("help=create-a-reel")).toEqual({ slug: "create-a-reel", step: 0 });
  });

  it("parses a 1-based step param into a 1-based page index", () => {
    // step=1 is the first content step, which is page index 1 (page 0 is the map).
    expect(parse("help=create-a-reel&step=3")).toEqual({ slug: "create-a-reel", step: 3 });
  });

  it("clamps a step past the end to the last step", () => {
    expect(parse("help=edit-an-image&step=99")).toEqual({ slug: "edit-an-image", step: 2 });
  });

  it("clamps a zero or negative step to the map page", () => {
    expect(parse("help=edit-an-image&step=0")).toEqual({ slug: "edit-an-image", step: 0 });
    expect(parse("help=edit-an-image&step=-4")).toEqual({ slug: "edit-an-image", step: 0 });
  });

  it("ignores a non-numeric step rather than throwing", () => {
    expect(parse("help=edit-an-image&step=abc")).toEqual({ slug: "edit-an-image", step: 0 });
  });

  it("returns null for an unknown slug", () => {
    expect(parse("help=nope")).toBeNull();
  });

  it("returns null for a draft chapter — it is not linkable until recorded", () => {
    expect(parse("help=archive-a-project")).toBeNull();
  });

  it("serializes the map page without a step param", () => {
    expect(helpParamsFor("create-a-reel", 0)).toBe("?help=create-a-reel");
  });

  it("serializes a step page with a step param", () => {
    expect(helpParamsFor("create-a-reel", 3)).toBe("?help=create-a-reel&step=3");
  });

  it("round-trips", () => {
    const qs = helpParamsFor("bring-in-references", 2);
    expect(parse(qs.slice(1))).toEqual({ slug: "bring-in-references", step: 2 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/help/deep-link.test.ts`
Expected: FAIL — cannot resolve `@/lib/help/deep-link`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/help/deep-link.ts`:

```ts
import { chapterBySlug } from "@/lib/help/chapters";

/** `step` is a page index: 0 is the map page, 1..n are the content steps. */
export type HelpLocation = { slug: string; step: number };

const HELP_PARAM = "help";
const STEP_PARAM = "step";

/**
 * Read a help location out of URL params. Returns null — a closed dialog — for anything
 * unusable, so a stale or hand-edited link degrades to "no modal" rather than throwing.
 */
export function parseHelpParams(params: URLSearchParams): HelpLocation | null {
  const slug = params.get(HELP_PARAM);
  if (!slug) return null;

  const chapter = chapterBySlug(slug);
  // Draft chapters are unrecorded, so their clips 404 — not linkable until they ship.
  if (!chapter || chapter.draft) return null;

  const raw = Number(params.get(STEP_PARAM));
  if (!Number.isFinite(raw)) return { slug, step: 0 };

  const step = Math.min(Math.max(Math.trunc(raw), 0), chapter.steps.length);
  return { slug, step };
}

/** Build the query string for a location. The map page is the bare chapter link. */
export function helpParamsFor(slug: string, step: number): string {
  const params = new URLSearchParams({ [HELP_PARAM]: slug });
  if (step > 0) params.set(STEP_PARAM, String(step));
  return `?${params.toString()}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/help/deep-link.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 5: Run the full suite to check nothing regressed**

Run: `npm test`
Expected: PASS, with the 18 new tests included.

- [ ] **Step 6: Commit**

```bash
git add src/lib/help/deep-link.ts src/lib/help/deep-link.test.ts
git commit -m "feat(help): deep-link parsing for help chapters"
```

---

## Task 3: `DropdownMenu` primitive

**Files:**
- Create: `src/components/ui/dropdown-menu.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuGroup`, `DropdownMenuGroupLabel`, `DropdownMenuSeparator`.

The repo has no dropdown-menu primitive. A `Popover` full of buttons is explicitly rejected — a menu needs roving focus, type-ahead and escape handling, which Base UI's `Menu` provides. Model the file on `src/components/ui/dialog.tsx`: thin wrappers, `data-slot` attributes, `cn()` for classes, all exports at the bottom.

There is no unit test — this is a styling wrapper with no logic, and the repo cannot render components under test. It is verified by typecheck, lint, and its consumer in Task 4.

- [ ] **Step 1: Create the primitive**

```tsx
"use client"

import { Menu as MenuPrimitive } from "@base-ui/react/menu"

import { cn } from "@/lib/utils"

function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = "end",
  ...props
}: MenuPrimitive.Popup.Props & {
  sideOffset?: number
  align?: "start" | "center" | "end"
}) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner sideOffset={sideOffset} align={align}>
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            "z-50 min-w-72 origin-(--transform-origin) rounded-xl bg-popover p-1.5 text-sm text-popover-foreground shadow-card ring-1 ring-foreground/10 outline-none",
            "duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

function DropdownMenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 outline-none transition-colors",
        "data-highlighted:bg-muted/60 data-disabled:pointer-events-none data-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuGroup({ ...props }: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
}

function DropdownMenuGroupLabel({
  className,
  ...props
}: MenuPrimitive.GroupLabel.Props) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-group-label"
      className={cn(
        "text-eyebrow px-3 pt-2 pb-1 text-[0.65rem] text-muted-foreground/80",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1.5 my-1.5 h-px bg-border", className)}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors. If Base UI's `Menu` sub-component names differ in v1.5, read `node_modules/@base-ui/react/menu` for the exported parts and adjust the wrapper names — keep this file's public export names exactly as listed above, because Tasks 4 and 5 import them.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/dropdown-menu.tsx
git commit -m "feat(ui): add DropdownMenu primitive (Base UI Menu)"
```

---

## Task 4: Chapter dialog — map page and step pages

**Files:**
- Create: `src/components/help/help-map-page.tsx`
- Create: `src/components/help/help-step-page.tsx`
- Create: `src/components/help/help-chapter-dialog.tsx`

**Interfaces:**
- Consumes: `HelpChapter`, `HelpStep` (Task 1); `Dialog`, `DialogContent`, `DialogTitle`, `DialogDescription` from `@/components/ui/dialog`; `Button` from `@/components/ui/button`.
- Produces:
  - `HelpMapPage({ chapter, onSelectStep }: { chapter: HelpChapter; onSelectStep: (step: number) => void })`
  - `HelpStepPage({ step, index, total }: { step: HelpStep; index: number; total: number })`
  - `HelpChapterDialog({ chapter, step, onStepChange, onClose }: { chapter: HelpChapter | null; step: number; onStepChange: (step: number) => void; onClose: () => void })`

`HelpChapterDialog` is controlled — it holds no chapter or step state of its own. Task 5 owns that state so the URL stays the single source of truth.

- [ ] **Step 1: Create the map page**

```tsx
"use client";

import { cn } from "@/lib/utils";
import type { HelpChapter } from "@/lib/help/types";

// Page 1 of every chapter, including two-step ones: the viewer arrived having asked a
// question, and this is where it gets answered before the mechanics start. Captions are
// derived from step titles so a chapter's sequence is authored once and cannot drift.
export function HelpMapPage({
  chapter,
  onSelectStep,
}: {
  chapter: HelpChapter;
  onSelectStep: (step: number) => void;
}) {
  const connected = (chapter.mapStyle ?? "sequence") === "sequence";

  return (
    <div className="grid gap-6">
      <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
        {chapter.summary}
      </p>

      <ol className="flex flex-wrap items-stretch gap-2">
        {chapter.steps.map((s, i) => (
          <li key={s.title} className="flex items-stretch gap-2">
            <button
              type="button"
              onClick={() => onSelectStep(i + 1)}
              className={cn(
                "flex w-40 flex-col gap-2 rounded-xl border border-border bg-card p-3 text-left",
                "shadow-card transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                "hover:-translate-y-0.5 hover:border-primary/40",
              )}
            >
              <span className="text-eyebrow text-[0.65rem] text-primary">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-xs leading-snug text-foreground">{s.title}</span>
            </button>
            {connected && i < chapter.steps.length - 1 && (
              <span aria-hidden className="self-center text-muted-foreground/40">
                →
              </span>
            )}
          </li>
        ))}
      </ol>

      <p className="text-xs text-muted-foreground">
        {connected
          ? `${chapter.steps.length} steps — click any step to jump to it.`
          : `${chapter.steps.length} ways to do this — click whichever fits.`}
      </p>
    </div>
  );
}
```

> **Note on the raw `<button>`:** the project rule is that *controls* are shadcn primitives. These map blocks are large composed cards, not controls in that sense, and `Button` cannot express a two-line card body without fighting its variants. If review prefers strict compliance, wrap with `<Button variant="ghost" render={<button />}>` — but prefer the version above and raise it in review rather than guessing.

- [ ] **Step 2: Create the step page**

```tsx
"use client";

import type { HelpStep } from "@/lib/help/types";

// A step: description on the left, looping clip on the right. Muted autoplay video rather
// than a GIF — visually identical, roughly an order of magnitude smaller, and it degrades
// to a paused first frame when autoplay is blocked.
export function HelpStepPage({
  step,
  index,
  total,
}: {
  step: HelpStep;
  index: number;
  total: number;
}) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 sm:items-start">
      <div className="grid gap-3">
        <span className="text-eyebrow text-[0.65rem] text-muted-foreground">
          Step {index} of {total}
        </span>
        <h3 className="font-display text-lg font-medium">{step.title}</h3>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          {step.body}
        </p>
      </div>

      <video
        key={step.clip}
        src={step.clip}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        className="w-full rounded-xl border border-border bg-muted/40 shadow-card"
      />
    </div>
  );
}
```

- [ ] **Step 3: Create the dialog shell**

```tsx
"use client";

import { ArrowLeft, ArrowRight, Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { HelpChapter } from "@/lib/help/types";
import { HelpMapPage } from "@/components/help/help-map-page";
import { HelpStepPage } from "@/components/help/help-step-page";

// Controlled: the caller owns chapter + step so the URL stays the source of truth.
// `step` is a page index — 0 is the map, 1..n are the content steps.
export function HelpChapterDialog({
  chapter,
  step,
  onStepChange,
  onClose,
}: {
  chapter: HelpChapter | null;
  step: number;
  onStepChange: (step: number) => void;
  onClose: () => void;
}) {
  if (!chapter) return null;

  const total = chapter.steps.length;
  const onMap = step === 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] w-full overflow-y-auto sm:max-w-3xl">
        <DialogTitle className="font-display text-xl">{chapter.question}</DialogTitle>
        {onMap ? (
          <DialogDescription className="sr-only">{chapter.summary}</DialogDescription>
        ) : (
          <DialogDescription className="sr-only">
            {chapter.steps[step - 1]?.title}
          </DialogDescription>
        )}

        <div className="py-2">
          {onMap ? (
            <HelpMapPage chapter={chapter} onSelectStep={onStepChange} />
          ) : (
            <HelpStepPage step={chapter.steps[step - 1]} index={step} total={total} />
          )}
        </div>

        <div className="flex items-center justify-between gap-4 border-t pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onStepChange(step - 1)}
            disabled={onMap}
          >
            <ArrowLeft className="size-4" strokeWidth={1.5} /> Back
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onStepChange(0)}
              disabled={onMap}
              aria-label="Back to overview"
            >
              <Map className="size-4" strokeWidth={1.5} />
            </Button>
            {chapter.steps.map((s, i) => (
              <Button
                key={s.title}
                variant="ghost"
                size="icon-sm"
                onClick={() => onStepChange(i + 1)}
                aria-label={`Step ${i + 1}: ${s.title}`}
                aria-current={step === i + 1}
                className="size-4 p-0"
              >
                <span
                  className={cn(
                    "size-2 rounded-full transition-colors",
                    step === i + 1 ? "bg-primary" : "bg-border",
                  )}
                />
              </Button>
            ))}
          </div>

          <Button size="sm" onClick={() => onStepChange(step + 1)} disabled={step >= total}>
            Next <ArrowRight className="size-4" strokeWidth={1.5} />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Verify it typechecks and lints**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. If `size="icon-sm"` is not a `Button` variant in this repo, read `src/components/ui/button.tsx` and use the nearest icon size it does define.

- [ ] **Step 5: Commit**

```bash
git add src/components/help/
git commit -m "feat(help): chapter dialog with map page and step pages"
```

---

## Task 5: `Help ▾` menu, header mount, and deep links

**Files:**
- Create: `src/components/help/help-menu.tsx`
- Modify: `src/components/layout/header-actions.tsx`

**Interfaces:**
- Consumes: `visibleChapters`, `chapterBySlug` (Task 1); `parseHelpParams`, `helpParamsFor` (Task 2); the `DropdownMenu*` exports (Task 3); `HelpChapterDialog` (Task 4).
- Produces: `HelpMenu()` — no props; mounted once in the global header.

State lives in the URL so a chapter is linkable, shareable and back-button friendly. `useSearchParams()` is the single source of truth; the component derives everything from it during render, which also satisfies `react-hooks/set-state-in-effect`.

- [ ] **Step 1: Create the menu**

```tsx
"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { CircleHelp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { visibleChapters, chapterBySlug } from "@/lib/help/chapters";
import { parseHelpParams, helpParamsFor } from "@/lib/help/deep-link";
import { HelpChapterDialog } from "@/components/help/help-chapter-dialog";

export function HelpMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Derived during render — no effect, no local mirror of the URL.
  const location = parseHelpParams(new URLSearchParams(searchParams.toString()));
  const chapter = location ? (chapterBySlug(location.slug) ?? null) : null;

  const chapters = visibleChapters();
  const howTo = chapters.filter((c) => c.question.startsWith("How"));
  const why = chapters.filter((c) => !c.question.startsWith("How"));

  const openAt = (slug: string, step: number) =>
    router.push(`${pathname}${helpParamsFor(slug, step)}`, { scroll: false });

  const close = () => router.push(pathname, { scroll: false });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm">
              <CircleHelp className="size-4" strokeWidth={1.5} />
              Help
              <ChevronDown className="size-3.5" strokeWidth={1.5} />
            </Button>
          }
        />
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuGroupLabel>How do I…</DropdownMenuGroupLabel>
            {howTo.map((c) => (
              <DropdownMenuItem key={c.slug} onClick={() => openAt(c.slug, 0)}>
                {c.question}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuGroupLabel>Why…</DropdownMenuGroupLabel>
            {why.map((c) => (
              <DropdownMenuItem key={c.slug} onClick={() => openAt(c.slug, 0)}>
                {c.question}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <HelpChapterDialog
        chapter={chapter}
        step={location?.step ?? 0}
        onStepChange={(step) => chapter && openAt(chapter.slug, step)}
        onClose={close}
      />
    </>
  );
}
```

- [ ] **Step 2: Mount it in the global header**

Modify `src/components/layout/header-actions.tsx` — add the import and render `HelpMenu` first in the row, so Help sits left of the admin link:

```tsx
"use client";

import { usePathname } from "next/navigation";
import { AdminNavLink } from "@/components/identity/admin-nav-link";
import { ProfilePopover } from "@/components/identity/profile-popover";
import { HelpMenu } from "@/components/help/help-menu";

// Hidden on /login — there's no session to reflect on the sign-in form itself, so
// showing "signed in as X" / an admin link / sign-out there is just confusing chrome,
// independent of whether a session happens to still be technically live at that moment.
export function HeaderActions() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <div className="flex items-center gap-3">
      <HelpMenu />
      <AdminNavLink />
      <ProfilePopover />
    </div>
  );
}
```

- [ ] **Step 3: Verify it typechecks and lints**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

If lint reports that `useSearchParams()` requires a Suspense boundary during static rendering, wrap the `HelpMenu` usage in `header-actions.tsx`:

```tsx
import { Suspense } from "react";
// …
<Suspense fallback={null}>
  <HelpMenu />
</Suspense>
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev:next`, then:
1. Load any page other than `/login` — `Help ▾` appears in the header.
2. Open it — seven chapters under two group labels.
3. Pick "How do I create a reel?" — the modal opens on the map page with seven numbered blocks joined by arrows.
4. Click block 3 — the step page shows, URL reads `?help=create-a-reel&step=3`.
5. Pick "How do I bring in references?" — its map blocks have **no** arrows between them.
6. Paste `?help=create-a-reel&step=3` into a fresh tab — it opens on that step.
7. Paste `?help=archive-a-project` — nothing opens (draft chapter).
8. Close the modal — the query params clear and the page does not scroll-jump.

Clips will 404 until recorded; the poster area shows an empty video box. That is expected at this stage.

- [ ] **Step 5: Commit**

```bash
git add src/components/help/help-menu.tsx src/components/layout/header-actions.tsx
git commit -m "feat(help): global Help menu with deep-linked chapters"
```

---

## Task 6: `EmptyState` component and the two list sites

**Files:**
- Create: `src/components/shared/empty-state.tsx`
- Modify: `src/components/clients/new-client-dialog.tsx:24` and `:90`
- Modify: `src/components/canvases/new-canvas-dialog.tsx` (same `trigger` prop change)
- Modify: `src/components/clients/clients-home-tabs.tsx:57-63`
- Modify: `src/app/clients/[id]/page.tsx:111-117`

**Interfaces:**
- Consumes: `Card` from `@/components/ui/card`.
- Produces: `EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode })`.

Both dialogs gain an optional `trigger?: React.ReactNode` defaulting to their existing button, so the empty state reuses the one creation path instead of standing up a second dialog.

- [ ] **Step 1: Create the shared component**

```tsx
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

// Consolidates three near-identical inline empty cards. The body line explains what the
// thing *is* — an empty state that only labels the absence teaches nothing.
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <Card className="animate-rise flex flex-col items-center justify-center gap-3 border-dashed p-14 text-center">
      <p className="font-display text-lg font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </Card>
  );
}
```

- [ ] **Step 2: Give `NewClientDialog` an optional trigger**

In `src/components/clients/new-client-dialog.tsx`, change the signature and the trigger line only — leave everything else untouched:

```tsx
export function NewClientDialog({ trigger }: { trigger?: React.ReactNode } = {}) {
```

```tsx
      <DialogTrigger render={trigger ?? <Button>New client</Button>} />
```

Add `import type { ReactNode } from "react";` and use `ReactNode` if the file's existing import style prefers it.

- [ ] **Step 3: Give `NewCanvasDialog` the same optional trigger**

Read `src/components/canvases/new-canvas-dialog.tsx` and apply the identical change: add `trigger?: ReactNode` to its props and pass `render={trigger ?? <existing button>}` to its `DialogTrigger`. Keep its existing `clientId` / `clientSlug` props exactly as they are.

- [ ] **Step 4: Use it on the clients list**

In `src/components/clients/clients-home-tabs.tsx`, replace the clients-tab empty `Card` (currently lines 57-63) with:

```tsx
        {clients.length === 0 ? (
          <EmptyState
            title="No clients yet"
            body="A client keeps every brand document, canvas, and asset siloed under one account — set it up once and reuse it across every reel."
            action={<NewClientDialog trigger={<Button>+ Add client</Button>} />}
          />
        ) : (
          <ClientsTable clients={clients} />
        )}
```

Add the imports:

```tsx
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
```

Leave the `recent` and `archived` tab empty cards as they are — the Recent tab's honest next action is the sibling tab on the same screen, so a CTA there would be noise.

- [ ] **Step 5: Use it on the canvases list**

In `src/app/clients/[id]/page.tsx`, replace the empty `Card` (currently lines 111-117) with:

```tsx
      {canvases.length === 0 ? (
        <EmptyState
          title="No canvases yet"
          body="A canvas is one reel project — script, shots, prompts, images and clips on a single board."
          action={
            <NewCanvasDialog
              clientId={client.id}
              clientSlug={client.slug}
              trigger={<Button>+ New canvas</Button>}
            />
          }
        />
      ) : (
```

Add `import { EmptyState } from "@/components/shared/empty-state";`. `Button` and `NewCanvasDialog` are already imported in this file.

- [ ] **Step 6: Verify it typechecks and lints**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 7: Manual verification**

Run: `npm run dev:next`, then:
1. Sign in to an org with no clients — the empty card shows the concept line and a working `+ Add client` that opens the same dialog as the header button.
2. Open a client with no canvases — `+ New canvas` opens the create dialog and lands you on the new canvas.
3. Confirm the header's existing `New client` / `New canvas` buttons still work unchanged.

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS — no regressions.

- [ ] **Step 9: Commit**

```bash
git add src/components/shared/empty-state.tsx src/components/clients/ src/components/canvases/new-canvas-dialog.tsx "src/app/clients/[id]/page.tsx"
git commit -m "feat(onboarding): actionable empty states for clients and canvases"
```

---

## Task 7: Record and wire the clips

**Files:**
- Modify: `src/lib/help/chapters.ts` (clip URLs only)

This task is content, not code — but it is the task that makes the feature real, so it is tracked here. 23 clips across seven chapters.

**Recording constraints:**
- **≤60 seconds each**, ideally 10–20s. Video retention drops sharply past a minute.
- **Muted, no voiceover** — the clips autoplay silently beside their description; narration nobody hears is wasted effort.
- **webm or mp4**, 720p is enough for a half-modal panel.
- **One clip per step**, named exactly as the URLs in `chapters.ts` already specify.

- [ ] **Step 1: Record the 23 clips**

Paths are already authored in `chapters.ts` — record against that list:

| Chapter | Clips |
|---|---|
| `create-a-reel` | 7 (`01-paste-script` … `07-approve-archive`) |
| `review-the-brand-kb` | 4 (`01-what-it-is` … `04-mark-ready`) |
| `edit-an-image` | 2 |
| `generate-a-reference-image` | 3 |
| `bring-in-references` | 3 |
| `why-cant-i-edit-this-canvas` | 2 |
| `where-did-my-video-go` | 2 |

- [ ] **Step 2: Upload to the bucket under the `v1` prefix**

Upload preserving the exact paths, so no code change is needed. Verify one URL loads publicly in a browser before uploading the rest.

- [ ] **Step 3: Verify each chapter end to end**

Run: `npm run dev:next`, open each of the seven chapters, and step through every page confirming the clip plays and loops.

- [ ] **Step 4: Commit any URL corrections**

```bash
git add src/lib/help/chapters.ts
git commit -m "chore(help): correct clip URLs after recording"
```

---

## Task 8: Append the ADR entries

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7

- [ ] **Step 1: Resolve the existing D101 collision**

`D101` is currently assigned twice — the header profile popover (recorded 2026-08-05) and explicit edit references (recorded 2026-08-04). Renumber the later one to **D102** following the log's existing renumbering convention (see D94 and D95 for the wording pattern used when a branch collides at merge), then take **D103** and **D104** for this work.

- [ ] **Step 2: Append both ADR entries**

Copy the two entries verbatim from §12 of `docs/superpowers/specs/2026-08-12-onboarding-empty-states-and-help-chapters-design.md`, adjusting their numbers to whatever Step 1 freed up, and update the `**ADRs originated:**` line in the spec header to match.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/
git commit -m "docs(adr): record onboarding V1 decisions; resolve the D101 collision"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §4 Surface A — `EmptyState` + two sites | Task 6 |
| §5 Placement in `header-actions.tsx` | Task 5 |
| §5 `dropdown-menu.tsx` primitive | Task 3 |
| §5 Chapter modal, map page, step pages, no carousel lib | Task 4 |
| §5 Chapter data model incl. `mapStyle`, `draft` | Task 1 |
| §5 Clips as muted looping video from GCS | Tasks 1 (URLs), 4 (element), 7 (recording) |
| §5 Deep links | Tasks 2, 5 |
| §6 Seven chapters, 23 clips, drafts authored | Tasks 1, 7 |
| §7 File list | Tasks 1–6 |
| §9 Testing — pure logic only | Tasks 1, 2 |
| §12 ADR entries | Task 8 |

No gaps.

**Placeholder scan:** The `draft: true` chapters carry empty `body` and `clip` strings. That is intentional and load-bearing, not a placeholder — Task 1's test asserts that only *visible* chapters require clips, so an unrecorded chapter cannot be linked or shown. Everything else contains literal code.

**Type consistency:** `HelpStep` / `HelpChapter` defined in Task 1 are used unchanged in Tasks 2, 4 and 5. `visibleChapters()` and `chapterBySlug()` keep the same names across Tasks 1, 2 and 5. `parseHelpParams` / `helpParamsFor` keep the same signatures across Tasks 2 and 5. The `DropdownMenu*` exports named in Task 3 are exactly those imported in Task 5. `HelpChapterDialog`'s controlled props match Task 5's call site. `step` means the same thing everywhere: a page index where `0` is the map.

**Known unknowns, flagged rather than guessed:** Base UI v1.5's `Menu` sub-component names (Task 3 Step 2 says read the package and adjust) and whether `Button` defines `size="icon-sm"` (Task 4 Step 4 says read the file). Both are single-line adjustments with a stated fallback, not open design questions.
