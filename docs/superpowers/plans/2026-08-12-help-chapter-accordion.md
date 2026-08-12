# Help Chapter Accordion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Help chapter modal's map page + step pages with one large two-pane dialog — an always-visible accordion rail of every step on the left, the active step's clip on the right.

**Architecture:** The chapter dialog becomes a single screen instead of a paged flow. The left rail carries the chapter summary plus a single-open accordion of all steps; expanding a step *is* selecting it, and the right pane plays that step's clip. Because the rail is permanently on screen, the separate map page that existed to convey "the shape of the journey" is deleted, and page index 0 disappears — steps are now 1..n.

**Tech Stack:** Next.js 16 App Router, React 19, Base UI (`@base-ui/react`) via `src/components/ui/*`, Tailwind v4, Vitest (node environment).

## Global Constraints

- Every interactive control is a shadcn primitive from `src/components/ui/*` — never a native `<button>`/`<input>`/etc. Base UI composes via the `render` prop, not `asChild`.
- Icons: Lucide only, `strokeWidth={1.5}`, no fills.
- Motion: easing `cubic-bezier(0.22,1,0.36,1)` only, 200/320/500ms. No springs or bounce.
- Colours come from the shadcn CSS variables in `globals.css` — never hardcoded.
- Tests are **pure-logic only**: `vitest.config.ts` sets `environment: "node"` and the repo has no jsdom and no React Testing Library. Components are verified by `npx tsc --noEmit` + `npm run lint` + manual check. Do not add test dependencies.
- One component per file, named export, split at ~200 lines.
- Run all commands from the worktree root: `.claude/worktrees/onboarding-v1`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/help/types.ts` | *Modify* — `HelpStep.body` becomes `string[]`; `mapStyle` renamed `stepStyle` |
| `src/lib/help/chapters.ts` | *Modify* — all 16 chapters' bodies become bullet arrays |
| `src/lib/help/chapters.test.ts` | *Modify* — body-array assertions |
| `src/lib/help/deep-link.ts` | *Modify* — step clamps to 1..n, no page 0 |
| `src/lib/help/deep-link.test.ts` | *Modify* — 1-based expectations |
| `src/components/help/help-chapter-rail.tsx` | *Create* — summary + single-open accordion of all steps |
| `src/components/help/help-step-video.tsx` | *Create* — right pane, the active step's looping clip |
| `src/components/help/help-chapter-dialog.tsx` | *Modify* — large two-pane shell, prev/next footer |
| `src/components/help/help-map-page.tsx` | **Delete** — the rail replaces it |
| `src/components/help/help-step-page.tsx` | **Delete** — split into rail row + video pane |
| `src/components/help/help-menu.tsx` | *Modify* — open chapters at step 1, not 0 |
| `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` | *Modify* — append D147 |
| `docs/superpowers/specs/2026-08-12-onboarding-empty-states-and-help-chapters-design.md` | *Modify* — §5 rewritten to the new shape |

---

### Task 1: Step bodies become bullet lists; `mapStyle` becomes `stepStyle`

**Files:**
- Modify: `src/lib/help/types.ts`
- Modify: `src/lib/help/chapters.ts`
- Test: `src/lib/help/chapters.test.ts`

**Interfaces:**
- Produces: `HelpStep = { title: string; body: string[]; clip: string }` and
  `HelpChapter.stepStyle?: "sequence" | "alternatives"`. Tasks 3 consumes both.

- [ ] **Step 1: Write the failing test**

Replace the "gives every step in a visible chapter a clip and a title" test in `src/lib/help/chapters.test.ts` and add a body test:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/help/chapters.test.ts`
Expected: FAIL — `s.body.length` is undefined because `body` is still a string.

- [ ] **Step 3: Update the types**

In `src/lib/help/types.ts`, replace the whole file:

```ts
export type HelpStep = {
  title: string; // the accordion row label in the chapter rail
  /**
   * Bulleted lines narrating what the clip shows. These describe the step's overall
   * story, not the clip's exact beats — they are not timestamps. A conceptual step
   * (nothing to *do*, only something to understand) is a single line.
   */
  body: string[];
  clip: string; // URL of the looping clip (object storage)
};

export type HelpChapter = {
  slug: string; // URL key, e.g. "create-a-reel"
  question: string; // menu label, e.g. "How do I create a reel?"
  summary: string; // required — sits above the rail, framing the question
  steps: HelpStep[];
  /**
   * "sequence" (default) numbers the rail rows 01, 02, 03… "alternatives" drops the
   * numbers for chapters that are several routes to one outcome, where numbering would
   * tell the viewer to do all of them in order.
   */
  stepStyle?: "sequence" | "alternatives";
  draft?: boolean; // authored but unrecorded — excluded from the menu
};
```

- [ ] **Step 4: Convert every body in `chapters.ts` to an array**

In `src/lib/help/chapters.ts`, rename the two `mapStyle: "alternatives"` occurrences to `stepStyle: "alternatives"`, and convert every `body:` string into an array of lines. Use these exact values for the seven visible chapters:

`create-a-reel`:
1. `body: ["Open the Script node on the canvas.", "Paste your finished script, or drop a .md or .txt file.", "CreativeOS parses it into structured, editable fields."]`
2. `body: ["One reel is many shots.", "Fanning out gives each shot in the parsed script its own Shot node.", "Each one can then be worked on independently."]`
3. `body: ["From a Shot node, create the image prompt.", "It carries the shot's visual description and the client's Brand KB.", "It does not carry the reel copy."]`
4. `body: ["Set your master controls, then generate.", "Every attempt is kept, so nothing is lost.", "Compare the attempts and approve the one you want."]`
5. `body: ["The Motion Prompt node reads your approved still.", "It writes a motion prompt with camera and movement controls."]`
6. `body: ["Video generation runs in the background.", "Keep working anywhere on the canvas.", "The generation tray tells you when the clip is ready."]`
7. `body: ["Approve the clip you want to keep.", "Archive the project to bundle the script, prompts, controls and attempts together."]`

`review-the-brand-kb`:
1. `body: ["Around 40 fields across seven modules, extracted from the brand site and the documents you uploaded.", "Each field shows its confidence, and whether it was stated or inferred."]`
2. `body: ["Take one module at a time.", "Where the extraction did well, Approve all clears the whole module in a click.", "You do not have to touch every field individually."]`
3. `body: ["Edit the value directly.", "Reject it as not applicable.", "Or re-ask with a comment like 'this brand is vegan, not luxury' to re-extract just that field."]`
4. `body: ["Once every field is reviewed, Mark KB Ready unlocks.", "That is what makes canvases available for this client."]`

`edit-an-image`:
1. `body: ["On the Image Gen node, pick the quick action that matches your intent — remove, replace or add.", "The rest of the image is preserved."]`
2. `body: ["The edit runs the model, so it lands as a new attempt in the version log.", "Step back through attempts to compare before approving."]`

`generate-a-reference-image`:
1. `body: ["Use an Image Gen node for the look you want to carry over.", "Prompt for palette, surface and mood rather than for the finished asset."]`
2. `body: ["Right-click the node that needs the reference.", "Choose Add Reference Image.", "Pick your image from the Generated Images tab."]`
3. `body: ["The picker drops a File node beside your target but does not wire it up.", "Draw the connection yourself.", "An unconnected reference is simply ignored."]`

`bring-in-references`:
1. `body: ["Drop an image file straight onto the canvas.", "Or paste one from your clipboard.", "Either creates a File node where you drop it."]`
2. `body: ["Right-click a node and choose Add Reference Image.", "Browse connected Drive folders, or everything already generated on this canvas."]`
3. `body: ["Open the Gallery drawer and switch to Moodboards.", "Drag an item onto the canvas.", "It becomes an ordinary File node."]`

`why-cant-i-edit-this-canvas`:
1. `body: ["The banner names who is currently editing.", "You can still open every node and read everything.", "Only changes are blocked, so you cannot overwrite their work."]`
2. `body: ["If they have stopped working, their session goes stale.", "The take-over button then becomes available and the canvas is yours to edit."]`

`where-did-my-video-go`:
1. `body: ["Once you hit generate, the job is queued.", "You can keep working anywhere on the canvas.", "Nothing is lost if you navigate away or close the tab."]`
2. `body: ["The tray lists every job as Running, Ready or Failed.", "Click one to fly to its node and open it.", "A ready job stays listed until you approve it."]`

For all nine `draft: true` chapters, replace each `body: ""` with `body: []`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/help`
Expected: PASS (all chapter tests green; deep-link tests still green — untouched so far).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `help-map-page.tsx` / `help-step-page.tsx` / `help-chapter-dialog.tsx` (they still render `body` as a string). Those are fixed in Task 3.

- [ ] **Step 7: Commit**

```bash
git add src/lib/help/types.ts src/lib/help/chapters.ts src/lib/help/chapters.test.ts
git commit -m "feat(help): step bodies become bulleted narration lines"
```

---

### Task 2: Deep links drop page 0 — steps are 1..n

**Files:**
- Modify: `src/lib/help/deep-link.ts`
- Test: `src/lib/help/deep-link.test.ts`

**Interfaces:**
- Consumes: `chapterBySlug` from Task 1's `chapters.ts` (unchanged signature).
- Produces: `parseHelpParams(params) -> { slug, step } | null` where `step` is 1..n;
  `helpParamsFor(slug, step)` omits the param when `step <= 1`. Task 3 consumes both.

- [ ] **Step 1: Write the failing tests**

Replace the body of `src/lib/help/deep-link.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { parseHelpParams, helpParamsFor } from "@/lib/help/deep-link";

const parse = (qs: string) => parseHelpParams(new URLSearchParams(qs));

describe("help deep links", () => {
  it("returns null when there is no help param", () => {
    expect(parse("")).toBeNull();
    expect(parse("foo=bar")).toBeNull();
  });

  it("opens on the first step when no step is given", () => {
    expect(parse("help=create-a-reel")).toEqual({ slug: "create-a-reel", step: 1 });
  });

  it("parses a 1-based step param", () => {
    expect(parse("help=create-a-reel&step=3")).toEqual({ slug: "create-a-reel", step: 3 });
  });

  it("clamps a step past the end to the last step", () => {
    expect(parse("help=edit-an-image&step=99")).toEqual({ slug: "edit-an-image", step: 2 });
  });

  it("clamps a zero or negative step to the first step", () => {
    expect(parse("help=edit-an-image&step=0")).toEqual({ slug: "edit-an-image", step: 1 });
    expect(parse("help=edit-an-image&step=-4")).toEqual({ slug: "edit-an-image", step: 1 });
  });

  it("ignores a non-numeric step rather than throwing", () => {
    expect(parse("help=edit-an-image&step=abc")).toEqual({ slug: "edit-an-image", step: 1 });
  });

  it("returns null for an unknown slug", () => {
    expect(parse("help=nope")).toBeNull();
  });

  it("returns null for a draft chapter — it is not linkable until recorded", () => {
    expect(parse("help=archive-a-project")).toBeNull();
  });

  it("serializes the first step without a step param", () => {
    expect(helpParamsFor("create-a-reel", 1)).toBe("?help=create-a-reel");
  });

  it("serializes a later step with a step param", () => {
    expect(helpParamsFor("create-a-reel", 3)).toBe("?help=create-a-reel&step=3");
  });

  it("round-trips", () => {
    const qs = helpParamsFor("bring-in-references", 2);
    expect(parse(qs.slice(1))).toEqual({ slug: "bring-in-references", step: 2 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/help/deep-link.test.ts`
Expected: FAIL — bare links still resolve to `step: 0`.

- [ ] **Step 3: Update the implementation**

Replace `src/lib/help/deep-link.ts` with:

```ts
import { chapterBySlug } from "@/lib/help/chapters";

/** `step` is 1-based: 1 is the first step. There is no page 0 — the rail shows the shape. */
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
  if (!Number.isFinite(raw)) return { slug, step: 1 };

  const step = Math.min(Math.max(Math.trunc(raw), 1), chapter.steps.length);
  return { slug, step };
}

/** Build the query string for a location. The first step is the bare chapter link. */
export function helpParamsFor(slug: string, step: number): string {
  const params = new URLSearchParams({ [HELP_PARAM]: slug });
  if (step > 1) params.set(STEP_PARAM, String(step));
  return `?${params.toString()}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/help`
Expected: PASS — 2 files, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/help/deep-link.ts src/lib/help/deep-link.test.ts
git commit -m "feat(help): deep links are 1-based; there is no map page to link to"
```

---

### Task 3: The two-pane chapter dialog

**Files:**
- Create: `src/components/help/help-chapter-rail.tsx`
- Create: `src/components/help/help-step-video.tsx`
- Modify: `src/components/help/help-chapter-dialog.tsx`
- Modify: `src/components/help/help-menu.tsx:76` (open at step 1)
- Delete: `src/components/help/help-map-page.tsx`
- Delete: `src/components/help/help-step-page.tsx`

**Interfaces:**
- Consumes: `HelpChapter` / `HelpStep` from Task 1; `helpParamsFor` from Task 2.
- Produces: `HelpChapterRail({ chapter, step, onSelectStep })` and
  `HelpStepVideo({ step })`.

- [ ] **Step 1: Create the rail**

Create `src/components/help/help-chapter-rail.tsx`:

```tsx
"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import type { HelpChapter } from "@/lib/help/types";

// The rail replaces the old map page. Video is linear — a viewer sees the current frame
// but never the shape — so the whole journey stays on screen beside the clip instead of
// living on a separate page you pass through once. Expanding a step IS selecting it:
// one piece of state drives both the open panel and the clip on the right.
export function HelpChapterRail({
  chapter,
  step,
  onSelectStep,
}: {
  chapter: HelpChapter;
  step: number;
  onSelectStep: (step: number) => void;
}) {
  const numbered = (chapter.stepStyle ?? "sequence") === "sequence";

  return (
    <div className="grid content-start gap-5">
      <p className="text-sm leading-relaxed text-muted-foreground">{chapter.summary}</p>

      <Accordion
        value={[step]}
        onValueChange={(value) => {
          // `multiple` is false, so this is at most one item. Collapsing the open row
          // would leave no clip on the right, so a click on the open row is a no-op.
          const next = value[0];
          if (typeof next === "number") onSelectStep(next);
        }}
        className="border-t border-border"
      >
        {chapter.steps.map((s, i) => (
          <AccordionItem key={s.title} value={i + 1}>
            <AccordionTrigger className="gap-3 no-underline hover:no-underline">
              <span
                className={cn(
                  "text-eyebrow shrink-0 pt-0.5 text-[0.65rem]",
                  step === i + 1 ? "text-primary" : "text-muted-foreground/70",
                )}
              >
                {numbered ? String(i + 1).padStart(2, "0") : "—"}
              </span>
              <span className="flex-1 text-sm leading-snug font-medium">{s.title}</span>
            </AccordionTrigger>

            <AccordionContent>
              <ul className="grid gap-1.5 pl-9">
                {s.body.map((line) => (
                  <li
                    key={line}
                    className="relative text-sm leading-relaxed text-muted-foreground before:absolute before:-left-4 before:text-muted-foreground/40 before:content-['→']"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <p className="text-xs text-muted-foreground">
        {numbered
          ? `${chapter.steps.length} steps — open any one to watch it.`
          : `${chapter.steps.length} ways to do this — open whichever fits.`}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Create the video pane**

Create `src/components/help/help-step-video.tsx`:

```tsx
"use client";

import type { HelpStep } from "@/lib/help/types";

// Muted autoplay video rather than a GIF — visually identical, roughly an order of
// magnitude smaller, and it degrades to a paused first frame when autoplay is blocked.
// `key` forces a remount so switching steps restarts the clip instead of resuming it.
export function HelpStepVideo({ step }: { step: HelpStep }) {
  return (
    <div className="flex h-full items-center justify-center rounded-xl border border-border bg-muted/30 p-3">
      <video
        key={step.clip}
        src={step.clip}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        aria-label={step.title}
        className="max-h-full w-full rounded-lg object-contain shadow-card"
      />
    </div>
  );
}
```

- [ ] **Step 3: Rewrite the dialog shell**

Replace `src/components/help/help-chapter-dialog.tsx` with:

```tsx
"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { HelpChapter } from "@/lib/help/types";
import { HelpChapterRail } from "@/components/help/help-chapter-rail";
import { HelpStepVideo } from "@/components/help/help-step-video";

// Controlled: the caller owns chapter + step so the URL stays the source of truth.
// `step` is 1-based; there is no page 0 — the rail carries the shape of the chapter.
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
  const current = chapter.steps[step - 1] ?? chapter.steps[0];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* Sized for real screen recordings: the clip is the point, so the pane holding it
          gets the room. sm:max-w-none overrides the dialog's default narrow width. */}
      <DialogContent className="flex h-[min(88vh,44rem)] w-[min(94vw,78rem)] flex-col gap-4 sm:max-w-none">
        <DialogTitle className="font-display text-xl">{chapter.question}</DialogTitle>
        <DialogDescription className="sr-only">{chapter.summary}</DialogDescription>

        <div className="grid min-h-0 flex-1 gap-6 md:grid-cols-[22rem_1fr]">
          <div className="min-h-0 overflow-y-auto pr-1">
            <HelpChapterRail chapter={chapter} step={step} onSelectStep={onStepChange} />
          </div>
          <div className="min-h-0">
            <HelpStepVideo step={current} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onStepChange(step - 1)}
            disabled={step <= 1}
          >
            <ArrowLeft className="size-4" strokeWidth={1.5} /> Back
          </Button>

          <span className="text-eyebrow text-[0.65rem] text-muted-foreground">
            {step} / {total}
          </span>

          <Button size="sm" onClick={() => onStepChange(step + 1)} disabled={step >= total}>
            Next <ArrowRight className="size-4" strokeWidth={1.5} />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Open chapters at step 1**

In `src/components/help/help-menu.tsx`, change both `openAt(c.slug, 0)` calls to `openAt(c.slug, 1)`, and change the dialog's `step` prop fallback from `location?.step ?? 0` to `location?.step ?? 1`.

- [ ] **Step 5: Delete the replaced pages**

```bash
git rm src/components/help/help-map-page.tsx src/components/help/help-step-page.tsx
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit`
Expected: clean — no output, exit 0.

Run: `npx eslint src/components/help src/lib/help`
Expected: clean.

Run: `npx vitest run src/lib/help`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A src/components/help src/lib/help
git commit -m "feat(help): two-pane chapter dialog — step rail beside the clip"
```

---

### Task 4: Record the decision

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (append D147)
- Modify: `docs/superpowers/specs/2026-08-12-onboarding-empty-states-and-help-chapters-design.md` (§5, §6, §7, §9)

- [ ] **Step 1: Append D147 to the ADR log**

Append after D146, following the house Decision / Why / Rejected / Supersedes format. It must state: the chapter dialog is one two-pane screen; the rail replaces the map page; `body` is a list of narration lines; steps are 1-based; `mapStyle` is now `stepStyle` and only controls numbering.

- [ ] **Step 2: Update the design spec**

In `2026-08-12-onboarding-empty-states-and-help-chapters-design.md`, rewrite §5's "The chapter modal" subsection to the two-pane shape, update the `HelpStep`/`HelpChapter` type block, drop the "23 step clips + 7 map pages" phrasing in §3 and §6 to "23 step clips", and update §9's testing bullets to the new assertions.

- [ ] **Step 3: Commit**

```bash
git add docs/
git commit -m "docs(help): record D147 — chapter rail replaces the map page"
```

---

## Self-Review

**Spec coverage:** two-pane layout (Task 3), accordion rail with summary (Task 3 Step 1), single-open behaviour (Base UI `multiple` defaults false — Task 3 Step 1), video right (Task 3 Step 2), prev/next footer (Task 3 Step 3), `body: string[]` (Task 1), unnumbered `alternatives` rails (Task 3 Step 1 `numbered`), 1-based deep links (Task 2), map page deleted (Task 3 Step 5), decision recorded (Task 4). No gaps.

**Placeholders:** none — every code step carries the literal content.

**Type consistency:** `HelpStep.body: string[]` (Task 1) is consumed as `s.body.map` (Task 3). `stepStyle` (Task 1) is read as `chapter.stepStyle` (Task 3). `parseHelpParams` returns 1-based `step` (Task 2), consumed as `step - 1` indexing (Task 3). `AccordionItem value` is a `number` and `onValueChange` receives `number[]` — matched in Task 3 Step 1.
