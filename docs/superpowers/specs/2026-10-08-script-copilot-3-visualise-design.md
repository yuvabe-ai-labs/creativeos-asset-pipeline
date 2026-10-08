# Script copilot · spec 3 — Visualise: an avatar for each person in the cast, and a storyboard panel for every shot

**8 October 2026 · product spec (the *what*) · spec 3 of 4 · AI: image generation · revised 8 Oct 2026
to the answers in [the questions file](2026-10-08-script-copilot-open-questions.md)**
Branch: `worktree-script-copilot`. Parent spec: [2026-10-07-script-copilot-design.md](2026-10-07-script-copilot-design.md).
Builds on: [spec 1](2026-10-08-script-copilot-1-library-and-script-design.md) (the script, the cast, the script view) and [spec 2](2026-10-08-script-copilot-2-generate-design.md) (a script arrives complete and client-ready).
ADRs: D337–D346 (booked; moved up one on 8 Oct, D319 was taken).
Explainer, with every decision that crosses specs: https://claude.ai/artifact/RLbXdnfrXHf6dYTbm7uN4k#decisions ·
Screen mockups: https://claude.ai/artifact/65cg8RQ1NgTFUCjgmgQ2dM — the Visualise board
(`#artboard-c1426575309f`) is the reference for the cast slot (§5); it shows one person where this
spec has one slot per cast member.

---

## 0. Where this sits

| Spec | What it delivers | AI |
|---|---|---|
| 1 · Library, script, handoff | The script, its cast, one script view, the handoff to a canvas | None |
| 2 · Generate | The copilot that writes and edits a script | Yes |
| **3 · this spec** | An avatar for each person in the cast, and a storyboard panel per shot | Yes |
| 4 · Client review | The client link, comments, activity, and approval | None |

The demo leads with Visualise and Client review (parent spec §0). This spec builds what the client
will be shown; spec 4 shows it to them.

Spec 3 can be built and tried before spec 2, on the seeded Reel 01 loaded at the Visualise stage
(spec 1 §6).

## 1. Problem

The client signs off on words today, not pictures, so the big story changes arrive after the
videos are made (parent spec §1). The fix is to show the client the reel before production: who is
in it, and what every shot looks like.

Two things make that hard:

- **The people must look the same in every frame.** Reel 01 has 14 shots. If Meenakshi's face
  changes between them, the client reviews a different woman in every panel (parent spec §11).
  15 of the 28 Jackfruit365 outlines put two or more people on screen (spec 1 §2.3), so this holds
  for the supporting cast too, such as Meenakshi's husband.
- **Generated images drift in ways that matter to this client.** The dry run of 7 October (parent
  spec §11.1) found that the face holds but small identity markers drift (a green pottu, a pale
  saree); a "South Indian kitchen" came out European; two profile views faced the same way; a
  labelled jar appeared on the counter. The house rules forbid generated text and brand names and
  ask for each persona to be made once as a character sheet and reused.

## 2. Who

A member of the content team, after the script is final and before it goes to the client. They
make or pick the cast's avatars, generate the storyboard, look over every panel, and redraw the
ones that are wrong.

## 3. The flow

```
script reaches Visualise ─→ 1 · the cast: an avatar for each person ─→ 2 · the storyboard:
(final, read-only)            picked from the library, or made            a panel per shot, from the shot
                              right here in Visualise                     and the avatars of who is on screen
                                                                                      │
                                   package ready; the team moves it to In review (spec 4) ←┘
```

The script stays at **Visualise** throughout. Spec 3 moves no stage, with one exception: **Reopen**
(§8.1) sends the script back to Generate.

## 4. The Visualise view

It is **spec 1's read-only script view** (spec 1 §4) with Visualise's work put beside it. Nothing
in the script's text is editable here; text changes happen in Generate (spec 2), through Reopen.

- **Top:** the header and the context card, as in spec 1.
- **The cast**, below the context card: one slot per person, the lead marked (§5).
- **The shots**, in order, each with **its storyboard panel beside it** (§6). Group by beat works
  as in spec 1.
- **A readiness line** at the top: how many cast members have an avatar, and how many shots have a
  current panel (§7), with **Generate all** beside it.

## 5. The cast: one client Avatar per person

### 5.1 What a cast member needs

Each person in the cast (spec 1 §2.3) points to **one client Avatar**: a person in the client's
Avatars library. **There is no second kind of avatar** (parent spec §7): it is the same record the
Avatars library and the Avatar Studio hold. The only thing Visualise writes into the script is
**which Avatar each cast member points to**; spec 2's copilot may already have linked an existing
one.

### 5.2 The cast slot, as on the Visualise board

Each slot is a **full avatar maker, inline in Visualise**, keeping everything the board shows:

- the person's **name and description** from the script, prefilled;
- a switch between **AI-generated** (made from the description) and **Specific person** (an
  uploaded photo of a real person, such as the founder);
- **likeness consent**, required before a Specific person can be saved — the Avatars feature's
  existing consent, unchanged;
- the **sheet: four views, Front, Left, Right, Back** (§5.4);
- a **voice** picker, the Avatars feature's existing voices;
- an **avatar instructions** box ("Greyer at the temples, glasses on a chain") and **Regenerate
  avatar**;
- **Pick from library** for an existing avatar (drafts are not offered), which is how James, Rajan
  and Saraswathi, Harpreet and Gurmeet are reused across reels;
- **Change**, to swap to another avatar or make a new one.

Saving makes a client Avatar in the library ("Made 9 Oct · saved to Avatars"), linked to that cast
member. An avatar belongs to the client, not the script: refining it changes it for every script
that uses it, which is the point (spec 1 §2.3). Panels already drawn from the old face are then
out of date (§6.4).

### 5.3 What the cast needs before panels

**Avatars come first so faces hold** (parent spec §7). A shot's panel can be generated once every
cast member on screen in that shot has an avatar **with its sheet**. A shot with nobody on screen
(B-roll) can be generated at any time.

### 5.4 The sheet: four views, for every avatar

The sheet is **four views: Front, Left, Right, Back.** This holds for **every avatar in the
product**, the Avatar Studio included, so there is one kind of sheet. It supersedes D288, which
chose three views (front, side, back); avatars made earlier keep three views until their sheet is
regenerated.

The dry run found that a profile view needs **its direction stated**, or the model returns views
facing the same way (parent spec §11.1). Left and Right are made with that stated.

### 5.5 Voice

Each cast member's **voice is chosen in Visualise**, from the Avatars feature's existing voices,
as the board shows. The storyboard does not use it; it is there so the package the client reviews
is complete, and so the lead's avatar carries a voice when it reaches the canvas.

## 6. The storyboard: one panel per shot

### 6.1 What a panel is

One image beside each shot, at the script's aspect (9:16 for every Jackfruit365 reel), showing
**the scene only**. Drawn as a **sketch, marker and wash**: the dry run found this reads as a plan
to approve rather than a finished film (parent spec §11.1).

**The model is Nano Banana 2 for every panel, for now**, the Studio's default sheet model and the
one the dry run used. No picker is shown. Three things are untested and are watched in the demo:
two faces in one panel (Reel 01 S6, S10, S12), a Specific person's photo as a reference, and the
reference-image limit (four views for each person on screen).

### 6.2 What every panel is drawn from

| Input | From | Why |
|---|---|---|
| The shot's visual line | The shot (spec 1 §2.4) | What happens and what the person does |
| The context card's setting and camera | The script (spec 1 §2.2) | Where it happens, the light, how it is shot |
| **The regional kit** | The brand KB (spec 2 §4.1), for the script's region | "South Indian kitchen" alone came out European; naming the kit fixed it |
| **Each on-screen person's description in words** | The cast (spec 1 §2.3) | The image alone let the pottu and saree drift; naming the markers fixed it |
| **Each on-screen person's four views** | Their client Avatar | So the face holds |
| **No generated text, no brand names, no labelled packs** | Always | The house rules put all text and the real pack in post |

On-screen text is never drawn into a panel, and neither is the AI-generated label: both are added
in post.

### 6.3 Shots that are mostly a card or a pack

The review card sliding in, the push-in on the pack holding the claim card, the pack shot: the
panel **draws the scene with the card or pack area left blank**, as the house rules say for
production. The client still sees the framing and the person's reaction; the real pack and the
graphics go in during the edit.

### 6.4 Panel states

| State | What the operator sees |
|---|---|
| Not yet | An empty 9:16 frame and **Generate** with its credit cost |
| Waiting for avatars | The empty frame, Generate unavailable, and which on-screen people still need an avatar |
| Generating | A placeholder the exact size of the finished panel, so nothing moves |
| Ready | The panel, which opens larger on click; **Regenerate** with its cost; the takes (§6.6); the prompt box (§6.7) |
| Out of date | The panel stays visible with an **Out of date** badge when an on-screen person's avatar, or the shot's text, has changed since it was drawn. **It is never redrawn on its own** |
| Failed | The provider's message, nothing charged, and Generate again |

### 6.5 Generate all, and what it costs

**Generate all** draws every shot that has no current panel: missing or out of date. It shows its
total first ("Redraw 9 panels · about N credits") and then runs. Per-shot Generate stays beside
each panel. Panels bill like any image on the platform: the cost is shown before every generate,
and there is no limit beyond the client's existing monthly cap.

### 6.6 Takes

**Each panel keeps its earlier takes.** A redraw adds a take; the operator picks which one is
current; **the client only ever sees the picked take.** This exists because an edited prompt
(§6.7) can make a redraw worse than the one before.

### 6.7 The prompt box

Each panel has a box, **hidden by default**, showing **the exact prompt sent to draw that frame**.
The operator can **edit it and regenerate**, or **reset** it to the prompt built from the script
and regenerate. An edit is for how the frame is drawn ("closer on her hands"); a change to what
happens in the story still belongs in the shot's visual line, through Reopen, so the panel and the
script never tell the client two different stories.

## 7. The package spec 4 shares

The package is the script view with every cast member's avatar and every shot's picked panel.
Spec 3 gets it ready. Moving the script to In review, sharing it (script only, with avatars, or
with panels), and approval are spec 4's.

The readiness line (§4) counts two things: cast members with an avatar, and shots with a current
panel. Spec 4 shows Approve only on a share that includes avatars and panels; spec 3 only reports
the counts.

Only the lead's avatar crosses to the canvas after approval (spec 1 §5.5). Supporting cast's faces
matter here, for the client review, and stop at the review.

## 8. Behaviours

### 8.1 Reopen

**Reopen** lives here, in Visualise, and sends the script back to Generate (spec 2 §10). Avatars
and panels are kept. When the script comes back final:

- an **edited** shot's panel is marked out of date; its redraw starts from a fresh prompt built
  from the new text, and a hand-edited prompt stays with the old take;
- a **new** shot has no panel;
- a **removed** shot's panel goes;
- a **split** shot: the first half keeps the old panel as an out-of-date take, the second starts
  empty.

Generate all then redraws exactly what changed.

### 8.2 Other rules

- **The script's text does not change in Visualise.** The only write to the script is each cast
  member's avatar link.
- **An avatar used in any script cannot be archived.** The Avatars library's archive action refuses
  while a script uses it. (Spec 1's handoff keeps its safeguard for archived avatars, for older
  data.)
- **Two scripts can share an avatar.** That is the intended reuse, and the reason panels go out of
  date when it changes.
- **Consent.** The Avatars feature's existing likeness consent for a Specific person covers panels
  and the client review; **legal to confirm the wording.** If legal requires wider wording, the
  consent text changes.

## 9. Constraint for the plan

Spec 3 keeps its data (panels, takes, prompts, generations) separate from the script document,
keyed by script and shot, and only writes the cast members' avatar links into the script. Its
only stage change is Reopen (Visualise → Generate).

## 10. What this spec changes in other specs and features

| Change | Where |
|---|---|
| The sheet is four views (Front, Left, Right, Back) for every avatar | Avatar Studio; a new ADR superseding D288 |
| An avatar used in any script cannot be archived | The Avatars library's archive action |
| The inline avatar maker in Visualise reuses the Studio's steps as components | Avatars feature |
| Reopen (Visualise → Generate) lives here | Spec 2 §10 |
| The client can comment on each of the four avatar views | Spec 4 |

## 11. Success, for the demo

Using Jackfruit365's seeded Reel 01 at the Visualise stage (spec 1 §6):

1. **Meenakshi** gets an AI-generated avatar from her cast description, and **her husband** gets one
   from his, both made inline in Visualise with four views and a voice, and saved to the client's
   library.
2. A second script can pick Meenakshi from the library without making her again.
3. All **14 shots** get a panel. Shots with an on-screen person cannot be generated until that person
   has an avatar. **Generate all** draws every missing panel in one action after showing its total.
4. **The face holds:** a reviewer recognises Meenakshi as the same woman in every panel she is in,
   with her identity markers the same colour and kind each time. The same holds for her husband in
   his shots, including the three shots where both are on screen.
5. **The setting holds:** every kitchen panel shows the Tamil Nadu kit and the hall shows the Golu
   steps; none looks European.
6. **No readable text or brand** appears in any panel; the review card, claim card and pack areas
   are blank.
7. Every panel reads as a marker-and-wash sketch.
8. Refining Meenakshi's avatar marks her panels out of date; Generate all redraws only those; the
   earlier takes remain and the picked take is what spec 4 shows.
9. Editing one panel's prompt and regenerating changes only that panel; reset restores the
   script-built prompt.
10. The script's text is unchanged after Visualise; only the cast's avatar links are new.

Criteria 4 to 6 are checked by eye, on more than one run, because a model call varies between
runs (spec 1 §11).

## 12. Not in scope

| Item | Why |
|---|---|
| Editing the script's text in Visualise | Spec 2 owns editing, reached through Reopen |
| A second kind of avatar | A cast member is a client Avatar (spec 1 §2.3) |
| A model picker, or probing other models | Nano Banana 2 for now |
| Moving the script to In review, sharing, approval | Spec 4 |
| Carrying supporting cast onto the canvas | Needs a Script node that holds several avatars (spec 1 §5.5) |
| Video, animatics or audio from the storyboard | The canvas makes video after approval (parent spec §10) |
| Drawing on-screen text, the AI-generated label or the real pack into panels | Added in post |
| Automatic checks of panels for hands, left-hand eating, wrong technique | A human review; later |
| Archiving an avatar that a script uses | Not allowed for now |

## 13. Risks

1. **Faces hold, details drift.** The dry run held the face with one reference image and fixed the
   details with words. Fourteen panels and two people may drift more. Criterion 4 checks it.
2. **Real faces.** Some image models refuse real faces (parent spec §11), and the platform's own
   record says Seedance refuses uploaded real faces. Whether Nano Banana 2 accepts an uploaded photo
   as a reference is untested; a Founder-led reel with a Specific James depends on it.
3. **Two faces in one panel.** Untested; Reel 01 has three such shots. Reel 16's three families
   would be harder still; the demo reel has at most two people per shot.
4. **Reference-image limits.** Four views per person on screen may exceed what the model accepts;
   the Front view takes priority if it does.
5. **The setting drifts between panels of the same room.** Two panels of the same kitchen may still
   differ in layout.
6. **Cost.** About 30 images for a 14-shot reel with one redraw per panel, plus four views per
   avatar. Generate all makes overspending one click away, which is why its total is shown first.
7. **Sketches hide errors the house rules care about.** A marker sketch may not show a left hand at
   the plate clearly enough to catch. Those checks stay on the generated video.

## 14. Decisions (8 Oct 2026)

Every question this spec's draft raised was answered on 8 Oct; the answers, with the options and
reasons, are in [the questions file](2026-10-08-script-copilot-open-questions.md), section Spec 3.
In one line each:

| # | Decision |
|---|---|
| 3.1 | The avatar maker is inline in Visualise and keeps everything the board shows; consent stays required |
| 3.2 | Each person on screen has a full sheet before their panels |
| 3.3 | Four views, Front, Left, Right, Back, for every avatar, Studio included; supersedes D288 |
| 3.4 | A voice per cast member, chosen in Visualise |
| 3.5 | Card and pack shots are drawn with that area blank |
| 3.6 | A changed avatar marks its panels out of date; Generate all redraws them |
| 3.7 | Panels bill like any image; Generate all shows its total first |
| 3.8 | Generate all exists, beside per-shot generate |
| 3.9 | A hidden prompt box per panel: edit and regenerate, or reset |
| 3.10 | Panels keep their takes; the operator picks; the client sees the pick |
| 3.11 | Shot text changes: edited → out of date with a fresh prompt; new → none; removed → goes; split → first half keeps the old take |
| 3.12 | An avatar used in any script cannot be archived |
| 3.13 | Nano Banana 2 for every panel, for now |
| 3.14 | Existing consent covers panels and review; legal to confirm the wording |

**Still open:** none.
