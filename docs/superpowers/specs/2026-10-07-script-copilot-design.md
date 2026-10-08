# Script copilot — write, visualise and approve a reel script inside the client

**7 October 2026 · product spec (the *what*) · prototype first, then fleshed out**
Branch: `worktree-script-copilot`. ADR numbers are assigned when the plan is written.
Sketches: five hand drawings shared in the design conversation (library, copilot workspace,
script structure, visualise view, client review view).
Explainer page: https://claude.ai/artifact/RLbXdnfrXHf6dYTbm7uN4k · Screen mockups (the four
stages, with generated avatar and storyboard images): https://claude.ai/artifact/65cg8RQ1NgTFUCjgmgQ2dM

**Updated 8 October 2026.** This work is built as four specs: 1 · library, script and handoff
([spec 1](2026-10-08-script-copilot-1-library-and-script-design.md)), 2 · Generate, 3 · Visualise,
4 · Client review. Spec 1 changed this document where marked *(spec 1)*; its §8 lists every
decision that crosses specs.

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

## 12. Open questions

1. ~~Is the avatar made in stage 2 saved to the client's Avatars library?~~ **Answered 8 Oct: yes.**
   Each cast member is a client Avatar, made once and reused *(spec 1 §2.3)*.
2. Is there a **series or campaign level** between the client and its scripts (a reel plan, a
   calendar, shared rules per campaign)?
3. Where should the **cast** eventually live: the client, a series, or the script?
4. ~~Which word does the product use for the "Avatar" format and the person on screen?~~
   **Answered 8 Oct:** an avatar is the asset, the person on screen. The format is
   **Founder-led** *(spec 1 §2.1)*.
