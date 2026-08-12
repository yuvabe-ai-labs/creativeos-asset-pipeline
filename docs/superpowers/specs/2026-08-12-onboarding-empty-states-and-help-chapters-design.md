# Onboarding V1 — list empty states + Help chapters

**Date:** 2026-08-12
**Status:** Design approved — ready for an implementation plan
**Area:** Onboarding / first-run experience
**ADRs originated:** D102, D103

---

## 1. Context

### Who V1 is for

The first few **design partners**. Every one of them receives a **personalised live demo**
from the team, and the team is providing **active tech support** alongside. Nobody arrives
at this product cold.

That single fact sets the design brief. In-app onboarding here is not a *teaching* problem —
the demo teaches. It is a **recall** problem: what the partner has lost, three days later
when they sit down alone, is the order of the steps and the name of the thing they need to
click. Teaching wants to fire once, early, and interrupt. Recall wants to be permanently
available at the moment of hesitation and to never interrupt. V1 is built for recall.

The presence of active tech support is also why V1 carries **no operational surface**: no
telemetry, no activation funnel, no checklist state to reconcile. A human is covering the
gap that instrumentation would otherwise have to find.

### The two journeys

From `docs/CreativeOS MVP PRD.md` §14 and `2026-07-02-client-kb-setup-flow.md`, the product
is two distinct journeys, not one:

**Journey A — Client setup** (once per client; feels like admin work)

```
Log in → Clients home → Create client → Upload brand materials
       → Extract & Build KB (background job) → Review ~40 fields × 7 modules
       → Mark KB Ready
```

**Journey B — Reel production** (per canvas; the actual product)

```
Create canvas → Empty canvas → Script node (paste + parse) → Fan out shots
              → [Compose variations] → Image prompt → Image Gen → approve
              → Video prompt → Video Gen → approve → Archive
```

Journey B is gated behind all of Journey A: per PRD §6 a canvas is only reachable once the
client's KB is `ready`. So a new user's path to their first generated image runs through a
40-field review wall. In activation terms this product has an unusually long *setup moment*
and a distant *aha moment* — worth naming, because it is why Journey A gets help coverage
in V1 despite being "just setup".

### Research grounding

The design below is grounded in published practice, not intuition. Sources are listed in
§11; the load-bearing findings:

- **Setup → Aha → Habit** (Reforge) is the standard activation frame. Most products design
  only for Setup. Our Setup is unusually long, which is what §4's KB chapter addresses.
- **Empty states are the strongest onboarding placement** — a page with no data yet is the
  highest-intent teaching surface. Loom's own product does exactly this.
- **Video decays with length**: clips of ≤60s hold ~68% of viewers.
- **Tours decay with step count**: 3-step tours complete at ~72%, 7-step at ~16% — which is
  why the Help chapters are *pull* (user opens them) and never a *pushed* sequence.
- **Welcome modals with one CTA convert at ~74%; with 3+ choices, ~41%** — one action per
  empty state.
- **Microsoft's Guidelines for Human-AI Interaction** put expectation-setting first:
  **G1 make clear what the system can do**, **G2 make clear how well it can do it**.
  In V1 these are served by static concept copy, not video.

---

## 2. The intervention rule

The point of this section is to make "what fixes this?" a lookup rather than a judgement
call, so the surface set stays small and future gaps get classified the same way.

Every onboarding gap in the product is one of five types, and the type determines the fix:

| Type | What it feels like | Right intervention |
|---|---|---|
| **1. Blank page** | Nothing on screen; no next action | **Empty state + action** |
| **2. Hidden affordance** | The action exists, but I can't find it | **Empty state + action**, or an inline chip |
| **3. Mental model** | I need the *shape* of the whole thing, not one button | **Help chapter** (video) |
| **4. AI expectation gap** | What will it do? How well? How long? | **Static copy** (HAX G1/G2) — *not* video |
| **5. Tedium** | I know what to do, it's just long | **UI change** — onboarding cannot fix it |

Types 4 and 5 are the ones normally misdiagnosed. An expectation gap looks like it wants
explaining, so teams record a video — but a video answers it once, for one user, and goes
stale, whereas a line of copy beside the button answers it every time, forever. And tedium
never yields to onboarding: no video makes 40 fields shorter. Classifying those two as
"not a video problem" is what holds V1 to five chapters instead of thirteen.

### The workflow, mapped

| # | Step / surface | Type | Intervention | State today |
|---|---|---|---|---|
| A2 | Clients home, no clients | 1 | Empty state + CTA | Card exists, **copy only, no CTA** |
| A4 | KB upload screen | 4 | Static copy *(V2)* | — |
| A5 | KB build running | wait | Phase labels + stuck-build reset | **Done** |
| A6 | **KB review, ~40 fields** | 3 + 5 | **Help chapter** + a UI fast path (out of scope) | Nothing |
| B1 | Client → no canvases | 1 | Empty state + CTA | Card exists, **copy only, no CTA** |
| B2 | New canvas | 2 + 3 | Flagship chapter *(no empty state — canvas is seeded)* | **Seeded KB + Script node** |
| B3 | Script node | 2 | Node empty state | **Done** |
| B4 | Fan out shots | 2 | Inline chip | Partial |
| B6 | Shot → image prompt | 2 | Guided "Create next" | **Done (D36)** |
| B7 | Image Gen → approve | 4 | Static copy *(V2)* | — |
| B8 | Image edit | 3 | **Help chapter** | Nothing |
| B9 | Video prompt | 2 | Guided "Create next" | **Done (D36)** |
| B10 | Video Gen (async) | 4 + wait | Generation tray | **Done (D35)** |
| — | Canvas is read-only (lock) | 3 | **Help chapter** | Banner only |

Note what is already solved: the in-canvas step-to-step progression is covered by the
shipped guided next-node flow (D36) and generation tray (D35). V1 deliberately does not
rebuild that ground.

The two **type-4** rows (A4, B7) are marked V2 rather than shipped now. The expectation
copy is cheap and worth writing, but it is a separate editorial pass over generation
surfaces, and folding it in would widen V1 from "two surfaces" to "two surfaces plus a copy
audit". With active tech support answering *"how long will this take?"* in the meantime, it
waits.

---

## 3. Scope

**In V1**

- Two list empty states with a concept line and one CTA.
- A global `Help ▾` menu in the app bar opening chaptered, video-led explainers.
- Seven authored chapters (23 step clips + 7 map pages).
- Deep-linkable chapters.

**Out of V1**

- Conceptual "fundamentals of prompting" chapters — the most valuable content in the
  eventual set and the most expensive to author. They are a training document, not a screen
  recording, and are best written after watching design partners prompt badly for a few
  weeks. V2.
- Per-screen first-view modals, product tours, tooltip sequences, activation checklists.
- Telemetry / activation instrumentation.
- Any UI change to the KB review flow itself (the type-5 tedium fix) — real, but a
  different piece of work.
- **No new database tables and no new columns.** Everything derives from data already on
  screen or from a static file.

---

## 4. Surface A — list empty states

### Component

One shared component, `src/components/shared/empty-state.tsx`:

```tsx
<EmptyState title="…" body="…" action={<Button …/>} hint?="…" />
```

It renders the existing house idiom — `Card` with `border-dashed p-14 text-center`,
`font-display` title, muted body — so it is a consolidation of three near-identical
inline blocks rather than a new visual pattern. Per the design system, the action is a
shadcn `Button`; no native controls.

### The three sites

Each is *title → concept line → one action*. The concept line explains what the thing
**is** and why it exists, not how to create one — that is the difference between an empty
state that teaches and one that merely labels.

| Site | Title | Concept line | Action |
|---|---|---|---|
| Clients home (`clients-home-tabs.tsx`) | No clients yet | "A client keeps every brand document, canvas, and asset siloed under one account — set it up once and reuse it across every reel." | `+ Add client` |
| Client → canvases (`clients/[id]/page.tsx`) | No canvases yet | "A canvas is one reel project — script, shots, prompts, images and clips on a single board." | `+ New canvas` |

**Why there is no empty-canvas state.** An earlier draft of this spec specified a third
empty state — an overlay on a blank canvas with a *Paste a script* CTA. **It was wrong and
is removed.** `src/lib/actions/canvases.ts:22-58` seeds every new canvas with a **KB node
plus a connected Script node**, and the Script node's focus view already carries a complete
empty state (dropzone, paste box, title, brand-context toggles) in
`src/components/nodes/script-empty-state.tsx`. A blank canvas does not occur on the normal
path, so the overlay would have been unreachable code.

The residual gap there is **type 2, not type 1**: the canvas opens with a seeded Script node,
and nothing tells a first-time user to open it. That is one line of card copy at most, and it
is best judged while recording chapter 1 — where the author will see the first frame exactly
as a new user does. Left out of V1 deliberately rather than guessed at now.

**Why there is no state for "client has no KB":** `clients/[id]/page.tsx:59-61` redirects any
client whose `kb_status !== "ready"` to the KB page, so that empty state can never render.
The KB page is itself the landing surface for that condition and already carries its own
setup UI.

### Behaviour notes

- The clients CTA **reuses `NewClientDialog`** with its own trigger rather than
  instantiating a second dialog; likewise `NewCanvasDialog` for canvases. Both gain an
  optional `trigger?: React.ReactNode` prop defaulting to their current button, so there is
  still exactly one creation path per object.
- The `Recent` tab's empty state stays copy-only. Its honest next action is "open a client",
  which is the other tab on the same screen — a CTA there would be noise.

---

## 5. Surface B — Help chapters

### Placement

A `Help ▾` split-button in `src/components/layout/header-actions.tsx`, left of the admin
link. That component is already global and already hides itself on `/login`, so Help
inherits both behaviours for free. Help is available on **every** screen, which is what
makes it a reference layer rather than a per-screen interruption.

### The menu

A dropdown listing chapters grouped by prefix — *How do I…* then *Why…*. This requires a
`dropdown-menu.tsx` primitive in `src/components/ui/` (Base UI Menu, `render` prop
composition), which the repo does not yet have. A `Popover` with buttons is explicitly
rejected: the list wants menu keyboard semantics (roving focus, type-ahead, escape).

### The chapter modal

Built on the existing `dialog.tsx`, over a dimmed backdrop.

**Page 1 — the map. Every chapter opens here, without exception** — the 2-step chapters as
much as the 7-step one. It carries the chapter's `summary` description plus the whole
journey as connected, numbered blocks with short captions, one per step. Clicking a block
jumps to that step.

This page is what makes multi-step chapters work. Video is linear — you can see the current
frame but never the shape. The map converts the sequence into a spatial object grasped in
one glance, after which each step page is a lookup into a model the viewer already holds.
It is the reason a 7-step chapter is viable here where a 7-step tour would not be.

**Why short chapters get one too.** It would be tempting to let a 2-step chapter open
straight on step 1 and save a click. Two reasons not to: the viewer arrives having asked a
*question*, and the intro is where the answer gets framed before the mechanics start; and a
uniform shape means every chapter is navigated the same way, so the surface never behaves
differently depending on a length the user cannot see in advance. `summary` is therefore a
required field, not an optional one.

**Pages 2..N — the steps.** Split layout: left, a text description of the step; right, a
~10s clip. Prev/next controls and dot indicators at the bottom, plus a home control back to
the map.

**Navigation.** Prev/next are shadcn `Button`s; dots are buttons that jump directly. No
carousel library — there is no swipe requirement and the content is fully controlled, so
this is step state plus two buttons. Adding embla or similar would be weight for nothing.

### Chapter data

Chapters are **authored**, not derived, in `src/lib/help/chapters.ts`:

```ts
export type HelpStep = {
  title: string;   // also becomes this step's block caption on the map page
  body: string;
  clip: string;    // URL of the step clip
};

export type HelpChapter = {
  slug: string;        // URL key, e.g. "create-a-reel"
  question: string;    // menu label, e.g. "How do I create a reel?"
  summary: string;     // required — the description on the map page every chapter opens with
  steps: HelpStep[];
  mapStyle?: "sequence" | "alternatives";  // default "sequence"
  draft?: boolean;     // authored but unrecorded — excluded from the menu
};
```

The map page **derives its blocks from `steps[].title`**, so a chapter's sequence is written
once and cannot drift between the map and the step pages.

**`mapStyle` exists because not every chapter is a sequence.** "How do I create a reel?" is
seven steps in order; "How do I bring in references?" is three *alternative routes* to the
same outcome. Rendering the second as arrow-connected blocks would tell the viewer to do all
three in order, which is wrong. `sequence` draws connectors between blocks; `alternatives`
drops them and the blocks read as a set. One optional field, one branch in the map renderer,
and the map stops lying about chapters it does not fit.

**Authored, not derived from `GUIDED_CHAIN`.** An earlier option was to index chapters off
`src/lib/guided-flow.ts`'s pipeline definition. Rejected on two grounds: that chain is not
trusted as a dependency for user-facing content, and it structurally cannot cover Journey A
(client creation, KB build and review), which is where the worst friction actually lives.

**`draft: true` rather than "coming soon".** Unrecorded chapters stay in the data file but
out of the menu. A visible "coming soon" entry promises help that does not exist, which is
worse than silence — particularly when a human support channel is the real fallback.

### Clips

`<video autoplay loop muted playsinline>` with webm/mp4 sources — visually identical to a
GIF at roughly an order of magnitude less weight, and it degrades to a paused first frame if
autoplay is blocked. Files are served from **GCS** (already wired for media, D13), not
committed to git, so ~40 eventual clips never become permanent repository weight.

### Deep links

`?help=create-a-reel&step=3` opens the modal on that chapter and step; closing clears the
params. Nearly free to implement, and during a design-partner phase the ability to paste
"watch this" into a support thread is worth as much as the in-app menu itself.

---

## 6. The seven V1 chapters

23 step clips + 7 map pages. The shell supports every chapter in the menu below; only these
seven are recorded for V1.

### 1. How do I create a reel? — 7 steps *(flagship)*

1. Paste your reel script
2. Fan out the shots
3. Write the image prompt for a shot
4. Generate and approve the image
5. Write the motion prompt from the approved still
6. Generate the clip
7. Approve and archive

*If recording load needs cutting, this is the lever: collapse (1,2) and (5,6) to reach 5
steps. Do not cut chapters — cut steps within this one.*

### 2. How do I review the Brand KB? — 4 steps

1. What the KB is, and where these values came from
2. Work module by module
3. Fix a field — edit, reject, or re-ask with a comment
4. Mark the KB ready

*Highest value per clip in the set. This is where a design partner otherwise burns 30
minutes reviewing field-by-field before discovering `Approve all`.*

### 3. How do I edit an image? — 2 steps

1. Choose what to change — remove, replace, or add
2. Run the edit and compare it against earlier attempts

*Covers the D27 in-pipeline path: an edit is a new **attempt** on the Image Gen node, not a
new node and not an overwrite. The standalone path is a separate chapter — see §8.*

### 4. Why can't I edit this canvas? — 2 steps

1. Someone else holds the editing lock
2. Take over once their session goes stale

### 5. Where did my video go? — 2 steps

1. Video generation runs in the background — you can keep working
2. Find it in the generation tray: Running, Ready, Failed

*Chapters 4 and 5 are pure support-question deflection. Both are 2 steps, and neither
concept is explained anywhere in the UI today.*

### 6. How do I generate a reference image? — 3 steps

1. Generate the look you want to reference — an Image Gen node prompted for palette,
   surface and mood rather than for the final asset
2. Bring it in: right-click the target node → **Add Reference Image** → **Generated Images**
3. Connect it and generate — the picker drops a File node beside the target but **does not
   wire it for you**

*Step 3 is the whole reason this chapter earns a slot. `2026-07-13-reference-image-picker-design.md`
lists "no auto-connection to originating node" as an explicit non-goal, so an image that was
picked but never connected silently does nothing — indistinguishable, from the user's side,
from the reference being ignored.*

### 7. How do I bring in references? — 3 routes *(`mapStyle: "alternatives"`)*

1. Upload or paste — drop a file on the canvas, or paste an image from the clipboard
2. Pull from Google Drive or this canvas's generated images — the reference picker
3. Reuse a client moodboard — Gallery drawer → **Moodboards** → drag onto the canvas

*Three independent routes to the same outcome, which is why this chapter sets
`mapStyle: "alternatives"`. Each route ends the same way: the image lands as a File node
that still has to be connected to the node consuming it.*

### Authored but `draft` (not recorded in V1)

`how-do-i-create-an-image-prompt` · `how-do-i-create-an-image` ·
`how-do-i-edit-an-image-in-isolation` · `how-do-i-turn-a-still-into-a-video` ·
`how-do-i-go-back-to-an-earlier-version` · `how-do-i-set-up-a-new-client` ·
`how-do-i-archive-a-project` ·
`what-are-the-fundamentals-of-prompting-for-images` ·
`what-are-the-fundamentals-of-prompting-for-reels`

---

## 7. Files

**New**

- `src/components/shared/empty-state.tsx`
- `src/components/ui/dropdown-menu.tsx` *(Base UI Menu)*
- `src/components/help/help-menu.tsx`
- `src/components/help/help-chapter-dialog.tsx`
- `src/components/help/help-map-page.tsx`
- `src/components/help/help-step-page.tsx`
- `src/lib/help/chapters.ts`
- `src/lib/help/chapters.test.ts`
- `src/lib/help/deep-link.ts`
- `src/lib/help/deep-link.test.ts`

**Edited**

- `src/components/layout/header-actions.tsx` — mount `Help ▾`
- `src/components/clients/clients-home-tabs.tsx` — clients empty state → `EmptyState` + CTA
- `src/app/clients/[id]/page.tsx` — canvases empty state → `EmptyState` + CTA
- `src/components/clients/new-client-dialog.tsx` — optional `trigger` prop
- `src/components/canvases/new-canvas-dialog.tsx` — optional `trigger` prop

Each help component stays one export per file, under the ~200-line split threshold, per
`docs/component-structure.md`.

---

## 8. Open decision, stated

**"Edit an image" has two distinct entry paths**, and they are separate chapters:

- **In-pipeline (D27)** — Remove / Replace / Add chips on the Image Gen node, producing a
  new attempt in that node's version log. *This is the chapter recorded in V1.*
- **In isolation** — bring an image in as a File node, wire it to an Image Gen node, and
  edit it standalone without a script or shot upstream. *Authored as
  `how-do-i-edit-an-image-in-isolation` with `draft: true`, ready to record next.*

The assumption baked into V1 is that the in-pipeline path is the more common one for design
partners and therefore records first. Flipping the order is a one-line change to the `draft`
flags.

---

## 9. Testing

- `chapters.ts` data tests: slugs unique, every non-draft step has a clip URL, no draft
  chapter reaches the menu, every chapter has ≥1 step, and **every chapter has a non-empty
  `summary`** — the map page is unconditional, so a missing description would ship a blank
  first page rather than degrade.
- Deep-link parsing round-trips (`?help=&step=` → chapter/step → back to params), including
  out-of-range and unknown-slug inputs falling back to a closed modal rather than throwing.

**Pure-logic tests only.** `vitest.config.ts` sets `environment: "node"` and the repo has no
jsdom and no React Testing Library, so component rendering cannot be asserted without adding
dependencies. This matches the house posture used for the tray and guided flow: pure logic is
TDD'd in node-env vitest, UI and store wiring is verified by `npx tsc --noEmit`, `npm run
lint`, and manual check. All testable logic here is therefore deliberately pushed into
`src/lib/help/` rather than into the components.

Colocated `*.test.ts`, matching the existing convention.

---

## 10. V2

- **Conceptual chapters** — prompting fundamentals for images and reels. They still open on
  an intro page like every other chapter (likely `mapStyle: "alternatives"`, since a set of
  principles is not a sequence); what differs is the step pages, which carry a still example
  rather than a clip. Same modal shell, second page renderer.
- **Copilot as the onboarding surface.** `src/lib/copilot/playbooks.ts` already contains a
  playbook runner with exactly one playbook (`image-for-shot`). A "set up my first reel"
  playbook is the AI-native version of a checklist and beats any tour — the product is
  already capable of *doing* the setup, it just never offers to.
- **A demo client with a pre-built canvas** — value before setup, which dissolves the
  setup→aha gap for new users entirely.
- **Role-aware entry** — the PRD already separates senior from designer (D29); an admin
  doing KB setup and a designer doing reels want different first screens.
- **Activation instrumentation** — first script parsed, first image approved, first video
  approved. Needed before anyone can claim onboarding "works"; deferred in V1 because active
  tech support is currently doing that job by hand.
- **The KB review fast path** — the type-5 tedium fix. The largest single win available in
  the whole activation path, and not an onboarding change.

---

## 11. Sources

- Reforge — [Define your setup moment](https://www.reforge.com/guides/define-your-setup-moment),
  [Defining your aha moment](https://www.reforge.com/c/retention-series-eg/activation/aha-moment)
- [GrowthPigeon — Setup, Aha, Habit](https://growthpigeon.com/articles/setup-aha-habit-saas-activation-moments)
- [Digital Applied — Time-to-value metrics framework 2026](https://www.digitalapplied.com/blog/customer-onboarding-time-to-value-2026-saas-metrics-framework)
- [Userpilot — SaaS onboarding funnel / TTFV](https://userpilot.com/blog/saas-user-onboarding-funnel/),
  [Why product tours get skipped](https://userpilot.com/blog/product-tour-examples/),
  [When to use a modal](https://userpilot.com/blog/modal-ux-design/)
- [Microsoft — Guidelines for Human-AI Interaction (HAX)](https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/),
  [the 18 guidelines](https://medium.com/microsoft-design/guidelines-for-human-ai-interaction-9aa1535d72b9)
- [ProductLed — AI onboarding](https://productled.com/blog/ai-onboarding)
- [Appcues — onboarding UX patterns](https://www.appcues.com/blog/user-onboarding-ui-ux-patterns) ·
  [Chameleon — onboarding UX patterns](https://www.chameleon.io/blog/onboarding-ux-patterns)
- [Vidyard — customer onboarding videos](https://www.vidyard.com/blog/customer-onboarding-videos/) ·
  [Wyzowl — onboarding users with video](https://wyzowl.com/onboarding-users-with-video/) ·
  [Hopscotch — SaaS video onboarding](https://hopscotch.club/blog/how-to-use-and-implement-saas-video-onboarding)
- [UXPin — progressive disclosure](https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/) ·
  [Carbon Design System — empty states](https://carbondesignsystem.com/patterns/empty-states-pattern/)

---

## 12. ADR entries

To append to `2026-05-30-creativeos-staging-roadmap.md` §7.

> **Note for whoever appends these:** `D101` is currently assigned twice in that log — the
> header profile popover (recorded 2026-08-05) and explicit edit references (recorded
> 2026-08-04). Resolve that collision when adding D102/D103.

### D102 — In-app onboarding is pull-not-push: empty states carry the actions, a global Help menu carries the explanations

**Decision.** Onboarding for design partners is two surfaces only: list/blank-surface empty
states with a concept line plus one CTA, and a global `Help ▾` menu of chaptered, video-led
explainers the user opens on demand. Nothing is pushed, sequenced, or fired on first view.

**Why.** Every V1 user receives a personalised live demo and has active tech support, so the
job is recall, not teaching. Pushed onboarding fires when the user has intent to act, shows
once, and then is gone — the worst possible property for a recall aid. Pull-based help is
available at every future moment of hesitation and needs no per-user state, which is why V1
adds no tables and no columns.

**Rejected.** First-view modals per key screen (needs seen-state infrastructure that costs
more than the onboarding it delivers at this user count); product tours and tooltip
sequences (completion collapses from ~72% at 3 steps to ~16% at 7); a single long canvas
overview video (linear, so it cannot convey the shape of a multi-step flow, and it is the
wrong content 6/7 of the time).

**Originated →** `2026-08-12-onboarding-empty-states-and-help-chapters-design.md`

### D103 — Help chapters are authored data with a map page, not derived from the pipeline definition

**Decision.** Chapters live in `src/lib/help/chapters.ts` as authored records
(`slug`, `question`, `summary`, `steps[]`, `mapStyle?`, `draft?`). **Every** chapter opens on
a **map page** — its description plus the whole journey as numbered blocks derived from
`steps[].title` — then steps through description-plus-clip pages. `mapStyle` selects whether
those blocks are drawn connected (`sequence`, the default) or unconnected (`alternatives`,
for chapters that are several routes to one outcome rather than an ordered flow).

**Why.** The map page is what makes multi-step explainable: video is linear, so a viewer sees
the current frame but never the shape; the map turns the sequence into a spatial object
grasped at a glance, after which each step is a lookup. It is mandatory even for 2-step
chapters — the viewer arrives having asked a question, and the intro is where that question
gets answered before the mechanics start; a uniform shape also means the surface never
behaves differently based on a length the user cannot see in advance. Deriving map captions
from step titles means a chapter's sequence is authored once and cannot drift.

**Rejected.** Indexing chapters off `GUIDED_CHAIN` in `src/lib/guided-flow.ts` — it is not
trusted as a dependency for user-facing content, and it structurally cannot cover Journey A
(client creation, KB build and review), where the worst friction lives. Also rejected: a
carousel library (no swipe requirement, fully controlled content); GIFs for step clips (an
order of magnitude heavier than muted autoplay video for identical behaviour); and visible
"coming soon" menu entries for unrecorded chapters (`draft: true` hides them instead —
promising absent help is worse than silence when a human support channel is the fallback).

**Originated →** `2026-08-12-onboarding-empty-states-and-help-chapters-design.md`
