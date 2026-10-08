# Script copilot — write, visualise and approve a reel script inside the client

**7 October 2026 · product spec (the *what*) · prototype first, then fleshed out**
Branch: `worktree-script-copilot`. ADR numbers are assigned when the plan is written.
Sketches: five hand drawings shared in the design conversation (library, copilot workspace,
script structure, visualise view, client review view).
Explainer page: https://claude.ai/artifact/RLbXdnfrXHf6dYTbm7uN4k · Screen mockups (the four
stages, with generated avatar and storyboard images): https://claude.ai/artifact/65cg8RQ1NgTFUCjgmgQ2dM

**Updated 8 October 2026.** This work is built as four specs, all now written and all their
open questions answered: [1 · library, script and handoff](2026-10-08-script-copilot-1-library-and-script-design.md)
(built, tasks 1–8), [2 · Generate](2026-10-08-script-copilot-2-generate-design.md),
[3 · Visualise](2026-10-08-script-copilot-3-visualise-design.md),
[4 · Client review](2026-10-08-script-copilot-4-client-review-design.md). Spec 2 has two
companions: the [interaction model](2026-10-08-script-copilot-2-interaction-model.md) and
[formats, slots and tools](2026-10-08-script-copilot-2-formats-slots-tools.md). Every answer is in
[the questions file](2026-10-08-script-copilot-open-questions.md).

**§4a below is the map: how the four specs fit together, what each hands the next, and the
order to build and merge them.** Where a later spec changed this document, the change is marked
*(spec N)*; the stage sections (§5–§8) keep the original story and §4a holds the current rules.

---

## 0. Why

Three outcomes, in this order:

1. **Scale script production.** Write more reels per person, because the copilot already knows
   the client's rules and the team only supplies the idea.
2. **Speed up approvals.** The client reviews one link, comments where it matters and approves
   once, instead of rounds of documents and calls.
3. **Stop late changes to the story.** The client signs off on the *visual* reel — the avatar
   and a storyboard panel for every shot — before production. Changes to the story happen while
   they cost a sentence, not after videos have been generated and edited.

Every stage below serves one of these. A feature that serves none of them is out.

**Demo priority (decided 2026-10-07): outcome 3 leads, then outcome 1.** The demo's centrepiece
is the visual sign-off — Visualise (§7) and Client review (§8). The copilot (§5) comes second: it
must produce a script good enough to visualise, but the demo's weight is on the client seeing and
approving the reel before production.

## 1. Problem

Reel scripts are written outside CreativeOS, in a general AI chat tool, and arrive as a document
that is uploaded to a Script node and parsed. Three things follow:

- **The client's rules are re-supplied by hand every time.** Brand voice, locked claim lines,
  the never-list, the cast and the regional rules live in the brand KB and in team documents, and
  whoever writes the script pastes them into the outside tool, or doesn't.
- **Nothing about the script lives with the client** until it reaches a canvas: no library of
  the client's scripts, no record of how one was arrived at.
- **The client signs off on words, not pictures.** There is no step where the client sees the
  avatar and a storyboard before production spends credits on video. So the client first
  *sees* the reel when it is already generated, and that is when the big changes to the story
  arrive — the most expensive moment to make them.

## 2. Goal

Bring the writing of the script, its visualisation and its client approval into the platform,
under the client. **Everything after approval stays exactly as it is today:** the approved
script is dropped onto a canvas Script node and parsed into shots as now.

**This is a demo first.** The prototype shows the concept end to end with real AI. It is then
fleshed out. The prototype is judged by the success criteria in §9, not by completeness.

## 3. Who

A member of the content team writing the next reel for a client whose brand KB is already set up,
and the brand client reviewing it.

## 4. The flow

```
1 · GENERATE          2 · VISUALISE              3 · CLIENT REVIEW          4 · PRODUCE
copilot chat +    →   finished script +      →   read-only view,        →   script dropped on a
script, until         avatar + storyboard        comments per part,         canvas Script node,
it is final           panel per shot             approve the whole          parsed as today
        ↑                     ↑                          │
        └──── revise ─────────┴──── comments come back ──┘
```

Entry point: **Client › Scripts**, a library of the client's scripts (one card per reel, showing
its title and stage) and a **New script** action.

## 4a. How the four specs fit together *(added 8 October 2026)*

### 4a.1 The spine: one script, four stages, one view

Everything hangs off **the script** that spec 1 defines (spec 1 §2): a header, a context card, a
cast with exactly one lead, and ordered shots. Each spec adds to the script's surroundings, never
redraws the script:

```
                 ┌──────────────── the script (spec 1 §2) ────────────────┐
                 │ header · context card · cast (one lead) · shots · notes │
                 └──────────────────────────────────────────────────────────┘
                        ▲ writes                ▲ links avatars          ▲ reads only
  GENERATE (spec 2)     │        VISUALISE (spec 3)       │      CLIENT REVIEW (spec 4)      HANDOFF (spec 1 §5)
  copilot + editable    │        avatars + panels         │      frozen versions, comments,   printed, parsed,
  script view           │        beside the script view   │      approval on the script view  lead's avatar attached
        │  Mark final   │                │  team moves it │                │  Approve                 ▲
        └───────────────┴────────────────┴────────────────┴────────────────┴──────────────────────────┘
        GENERATE ──────────▶ VISUALISE ──────────▶ IN REVIEW ──────────▶ APPROVED ──────▶ Scripts tab on the canvas
                 ◀── Reopen (spec 3) ──  ◀── team moves back (spec 4)
```

**The one script view** (spec 1 §4) is the surface all three later specs put their work around.
Generate makes it editable; Visualise puts a cast slot and a panel beside it; Client review shows
it read-only to the client.

### 4a.2 Who owns which stage move

| Move | Owner | Rule |
|---|---|---|
| New script (→ Generate) | Spec 2 | The copilot is the only way a script is made |
| Generate → Visualise, "Mark final" | Spec 2 | Only when **fill to final** is empty: **Final means ready for the client to read** |
| Visualise → Generate, "Reopen" | Spec 3 | Avatars and panels kept; panels of changed shots marked out of date |
| Visualise → In review | Spec 4 | By hand, by the team; the Share action appears only in In review |
| In review → Visualise | Spec 4 | By hand, by the team; editing was allowed throughout |
| In review → Approved, "Approve" | Spec 4 | The client, on a full share only (script + avatars + panels) |
| Approved → a canvas | Spec 1 | Dragged from the gallery's Scripts tab; the node holds a copy; only the lead's avatar comes along |

### 4a.3 What each spec hands the next

| From → to | What is handed over | Guaranteed by |
|---|---|---|
| 1 → 2 | The script shape, the library, the editable script view, three seeded scripts (Reels 01, 06, 08) | Spec 1 §2–§4, §6 |
| 2 → 3 | A **complete** script: every section, every shot with VO and on-screen text, the real review in place, dates confirmed, cast members linked to existing Avatars where they exist, the reel's notes holding the confirmed brief | Spec 2 §8 fill to final |
| 3 → 4 | Every cast member a client Avatar with a **four-view sheet** and a voice; one **picked take** per shot's panel; readiness counts | Spec 3 §5–§7 |
| 4 → 1 | An **approved** script, so it appears in the canvas gallery's Scripts tab | Spec 4 §8 |
| 4 → 3 | Client comments beside each part in the Visualise view | Spec 4 §6 |
| 2 → 4 | No placeholder ever reaches the client | Spec 2 §8 |

### 4a.4 Shared things, and which spec owns them

| Thing | Owner | Who else touches it |
|---|---|---|
| The script document | Spec 1 defines; **spec 2 is the only writer** of its text | Spec 3 writes only the cast's avatar links; spec 4 reads |
| The reel's notes | Spec 2 (start as the confirmed brief + open items) | Edited like the script, in Generate |
| Client Avatars | The existing Avatars feature | Spec 2 links them; spec 3 makes them inline, four views, and blocks archiving while in use; spec 4 lets the client comment per view |
| Panels, takes, prompts | Spec 3, keyed by script and shot | Spec 4 shows the picked take; a frozen version records which |
| Versions, comments, activity | Spec 4, keyed by script, version and part | Spec 3's view shows comments beside parts |
| The brand KB | Existing | Spec 2 reads the house rules from it (pasted as text for the demo); spec 3 reads the regional kits |
| The parse and the Script node | Existing, unchanged | Spec 1 prints the script in the team's layout and re-parses |

### 4a.5 Build and merge order

- **Spec 1 first.** Everything reads its shape and its view. Tasks 1–8 are built; tasks 9–12 (the
  Scripts tab handoff, ADRs, end-to-end checks) can finish alongside the others.
- **Specs 2, 3 and 4 in parallel**, each in its own worktree branched from spec 1's branch, because
  each keeps its own data keyed by script and shot and only spec 2 writes the script's text.
  - Spec 3 and spec 4 build against the seeded Reel 01, loaded at Visualise, without spec 2.
  - Spec 4 builds first with comments on the context card, shots and cast; panel comments attach to
    whatever panels spec 3 has made.
  - The collision points to watch at merge: the cast slot in the script view (spec 3 adds the
    avatar maker, spec 4 adds comment markers); the stage moves (spec 2's Mark final, spec 3's
    Reopen, spec 4's moves); the Avatars feature (spec 2 links, spec 3 changes the sheet and
    archiving).
- **Merge: 1 → 3 → 4 → 2.** Visualise and review are the demo's centrepiece and need only the
  seeded script; the copilot comes last.

### 4a.6 Decisions that changed this document

| Was (this document) | Now | Decided in |
|---|---|---|
| One avatar per script | A cast of client Avatars, one lead | Spec 1 |
| Separate Setting and Transition fields on a shot | Written into the visual line | Spec 1 |
| One per-client free-text "script notes" field | Notes per script; the house rules in the brand KB; client-level notes later | Spec 2 |
| Three questions: occasion, persona, angle | Four pieces, any skippable: format, occasion or theme, lead (UGC only), narrative | Spec 2 |
| A review beat may hold a placeholder | Final means client-ready; fill to final asks for the real review and confirmed dates | Spec 2 |
| The avatar is made in the Avatar Studio, three views | Made inline in Visualise, four views for every avatar | Spec 3 |
| "Send to client" moves the script to In review | The team moves it by hand; Share appears in In review; the share is script, + avatars, or + panels | Spec 4 |
| The link shows the live script | Each share is a frozen version on the same link | Spec 4 |
| Produce is a stage | Folded into spec 1's handoff; the canvas pulls approved scripts from a Scripts tab | Spec 1 |

## 5. Stage 1 — Generate

A two-pane workspace: **the copilot chat on the left, the script on the right.**

### 5.1 What the copilot knows without asking

- The client's **brand KB** (exists today).
- The client's **script notes**: one free-text field per client for what the KB does not hold —
  product usage, the recurring cast, the reel format (length, beats), regional rules. For
  Jackfruit365 this is §2 "House spec" of the reel outline document.
- **One or two finished scripts** as examples of the format.

The copilot never asks for any of these in the chat.

### 5.2 What it asks, per reel

Three things: **occasion**, **persona**, **angle.** It proposes three angles and the person picks
or blends them. Everything else — format, region, the meal moment, setting, the review theme —
follows from those answers and the standing context, and the copilot proposes it rather than
asking.

### 5.3 Tools

The copilot can call **Market Research** (the client's market signals, which exist today) to shape
its angles, and the result appears as a card in the conversation. Other tools can be added later;
the prototype has this one.

### 5.4 Editing

Two ways, and in both **only the targeted part changes**:

| | Where | For |
|---|---|---|
| **Inline AI edit** | A small prompt beside text selected in the script, as in ChatGPT's canvas | Local changes: shorter, warmer, add the claim line |
| **Chat** | The left pane | Larger moves: redo the hook, move the review earlier, try another angle |

The person can also type into the script directly.

### 5.5 Done

The person marks the script final, which moves it to Visualise. It can be reopened.

**The copilot is the only way in (decided 2026-10-07).** A script reaches Visualise only by being
written in Generate, so it is always in the shape Visualise needs. Scripts written elsewhere are
not imported.

## 6. What a script contains

**A context card**, then **a list of shots.**

The **context card** holds the premise and narrative (the main idea) and the mood. Beside it sits
the **cast**: each person on screen, described in words *(spec 1 §2.3)*. It is written by the copilot in stage 1 and drives the avatar in
stage 2.

**The shot is the unit.** Each shot has:

| Part | Meaning |
|---|---|
| Visual | What happens and what the person does (story and action, one field) |
| VO | The voiceover line for this shot |
| On-screen text | Text added in post |
| On screen | Which cast members are on screen, or nobody (B-roll) *(spec 1)* |
| Time | The shot's length; the running timecode is worked out from the lengths |

Setting changes and transitions are written into the Visual, the way the team writes them today,
rather than kept as separate fields *(spec 1 §2.4)*.

Each shot also carries a **beat** (HOOK, STEP, PROOF …), hidden by default. The view groups
consecutive shots with the same beat; the timeline order always wins, so a beat that recurs later
forms its own group. Hiding beats shows the flat list.

**A cast, not one avatar** *(spec 1 §2.3)*. A script has one or more people, exactly one of them the
lead, and each is a client Avatar. 15 of the 28 Jackfruit365 outlines put two or more people on
screen, Reel 01 included.

## 7. Stage 2 — Visualise

The finished script on the left, its visuals on the right.

**Left:** the context card with **Generate avatar**, and each shot with a **generate** action for
its storyboard panel.

**Right:**

- **An avatar for each person in the cast** *(spec 1)*, as a model sheet (front, left, right, back), with a **voice**, and an
  **avatar instructions** box to refine it and regenerate. A switch chooses between:
  - **AI-generated** — made from the context card's description;
  - **Specific** — an uploaded photo of a real person, such as the founder.

  These are the client **Avatars** that exist today (Generic and Specific, profile sheet, voice
  step, likeness consent for real people). Stage 2 makes or picks one of them; it does not invent
  a second kind of avatar.
- **The storyboard**: one panel per shot, made from that shot and, where the avatar is on screen,
  from the avatar. The avatars come first so every face holds across the panels.

Panels show the scene only. On-screen text is added in post, so it is not drawn into panels.

From here the team **sends the package to the client.**

## 8. Stage 3 — Client review

The client opens **a link** to a **read-only** version of the Visualise view: context card, shots,
avatar, storyboard.

- **Comments** can be left on the context card, on each shot, on the avatar and on each
  storyboard panel.
- Comments appear in the team's **Visualise view**, next to the part they are about. The team
  revises there.
- The link stays **the same** across revisions and shows a **history of activity**: what was
  sent, commented, changed and re-sent.
- The client **approves the whole package** in one action. Comments are per part; approval is
  not.

On approval the script moves to **Produce**: it appears in the canvas gallery's **Scripts** tab,
and dragged onto a canvas it becomes a Script node, parsed into shots as today, with the lead's
avatar attached *(spec 1 §5)*.

Client review links (D310) and pinned review comments (D239–D251) exist today for videos. Stage 3
reviews a different thing — a script, an avatar and a storyboard — with the same idea.

## 9. Success, for the demo

Using Jackfruit365's KB and its house spec as script notes:

1. The copilot writes a new reel that the content team accepts as a first draft: the right
   persona and regional kit, the locked claim lines verbatim, nothing from the never-list.
2. An inline edit or a chat request changes only the part it targets.
3. The avatar holds the same face across the storyboard panels.
4. A client, through the link, can comment on a shot and on a panel, see the team's revision on
   the same link, and approve.
5. The approved script parses in the existing Script node with no manual fixing.

**After the demo**, the three outcomes in §0 are what the fleshed-out feature is measured by:
time to a first draft per reel (scale), time from "sent to client" to approval (approvals), and
how often the story changes after approval (late changes). The prototype does not measure these.

## 10. Not in scope

| Item | Why |
|---|---|
| More than one avatar on the canvas Script node | Only the lead's avatar crosses onto the canvas *(spec 1 §5.5)* |
| A series or campaign level between client and script | Open, §12 |
| The cast as its own record (persona library) | Lives in the script notes for now |
| Structured fields for product usage, cast and format in the brand KB | Free-text script notes for now |
| Approving parts separately, approval rounds as separate links | Whole-package approval on one link |
| Checking the review pool, festival dates, disclaimers automatically | Later |
| Generating video from the storyboard | That is what the canvas does after approval |

## 11. Risks

- **Real faces.** A Specific avatar is a real person. Their written consent is required (the
  house spec says so for the founder, and the Avatar Studio already asks), and some image models
  refuse real faces.
- **The parse round trip.** The script is handed to the canvas as a document and parsed back into
  shots. If the copilot's document does not parse cleanly, criterion 5 fails. The copilot's
  output should follow the layout of the team's existing scripts, which the parser already
  handles.
- **Panel consistency.** If the storyboard does not hold the avatar's face, the review shows a
  different person in every frame and the client reviews the wrong thing.

### 11.1 What the mockup images showed (7 October 2026)

The design canvas's avatar views and storyboard panels were generated for real, with Nano
Banana 2 (the app's default sheet model), in the order the product would use: the front portrait
first, then every other image with that portrait as a reference. Eleven images, one look at each.
Findings:

- **The face holds; the details drift.** Across four panels with the avatar on screen, she was
  recognisably the same woman every time. What slipped were the small identity markers: the
  kumkum pottu came out green in one run and the saree went pale in another. Naming those
  markers in the prompt (red pottu, muted green saree with a maroon border, green glass bangles,
  glasses on a chain) fixed it. So the panel generator must carry **the avatar's description in
  words as well as the reference image**; the image alone is not enough.
- **The setting drifts too.** "A South Indian kitchen" twice produced a European-looking one.
  Naming the kit (granite counter, two-burner gas stove, steel vessels, no oven) fixed it. The
  regional kits in the script notes are therefore an input to **every panel**, not only to the
  script.
- **Profile views need the direction stated.** Asked for a left and a right profile, the model
  returned two images facing the same way. Saying which edge of the frame the nose points to
  fixed it. The avatar sheet needs this spelled out per view.
- **Text and brands creep in.** A panel put a labelled jar on the counter. The house spec rules
  out generated text and brand names, so every panel prompt carries that exclusion.
- **Sketch style reads as a plan.** Marker-and-wash panels looked like a storyboard to approve,
  not a finished film. That is the right register for the client review: it invites comment on
  the story, not on rendering quality. The spec keeps panels as sketches.
- **Cost.** Eleven images at 1K took about a minute in parallel. A 14-shot reel with one regen
  per panel is roughly 30 images, which is fine for a demo.

Carried into the later specs: the panel prompt composition (spec 3) and the per-view sheet prompt
(spec 3) follow from these.

## 12. Open questions *(all four specs' questions were answered on 8 October; what remains here is above the specs)*

1. ~~Is the avatar made in stage 2 saved to the client's Avatars library?~~ **Answered 8 Oct: yes.**
   Each cast member is a client Avatar, made once and reused *(spec 1 §2.3)*.
2. Is there a **series or campaign level** between the client and its scripts (a reel plan, a
   calendar, shared rules per campaign)?
3. Where should the **cast** eventually live: the client, a series, or the script?
4. ~~Which word does the product use for the "Avatar" format and the person on screen?~~
   **Answered 8 Oct:** an avatar is the asset, the person on screen. The format is
   **Founder-led** *(spec 1 §2.1)*.
