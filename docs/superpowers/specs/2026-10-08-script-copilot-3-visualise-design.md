# Script copilot · spec 3 — Visualise: an avatar for each person in the cast, and a storyboard panel for every shot

**8 October 2026 · product spec (the *what*) · spec 3 of 4 · AI: image generation**
Branch: `worktree-script-copilot`. Parent spec: [2026-10-07-script-copilot-design.md](2026-10-07-script-copilot-design.md).
Builds on: [spec 1](2026-10-08-script-copilot-1-library-and-script-design.md) (the script, the cast, the script view).
ADRs: D336–D345 (booked).
Explainer, with every decision that crosses specs: https://claude.ai/artifact/RLbXdnfrXHf6dYTbm7uN4k#decisions ·
Screen mockups: https://claude.ai/artifact/65cg8RQ1NgTFUCjgmgQ2dM (the Visualise board there predates the
cast decision: it shows one avatar per script, where this spec has one per cast member).

---

## 0. Where this sits

| Spec | What it delivers | AI |
|---|---|---|
| 1 · Library, script, handoff | The script, its cast, one script view, the handoff to a canvas | None |
| 2 · Generate | The copilot that writes and edits a script | Yes |
| **3 · this spec** | An avatar for each person in the cast, and a storyboard panel per shot | Yes |
| 4 · Client review | The client link, comments, activity, and approval | None |

The demo leads with Visualise and Client review (parent spec §0). This spec is the first half of
that centrepiece: it builds what the client will be shown. Spec 4 shows it to them.

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
  labelled jar appeared on the counter. The house spec forbids generated text and brand names
  ("Generate scenes with those areas blank or blurred, and add all text … in post") and asks for
  each persona to be made "once as a character sheet and reuse[d]".

## 2. Who

A member of the content team, after the script is final and before it goes to the client. They
make or pick the cast's avatars, generate the storyboard, look over every panel, and regenerate
the ones that are wrong.

## 3. The flow

```
script reaches Visualise ─→ 1 · the cast: an avatar for each person ─→ 2 · the storyboard:
(final, read-only)            made or picked from the client's           a panel per shot, from the shot
                              Avatars library                            and the avatars of who is on screen
                                                                                      │
                                              package ready for spec 4's "Send to client" ←┘
```

The script stays at **Visualise** throughout. Spec 3 moves no stage.

## 4. The Visualise view

It is **spec 1's read-only script view** (spec 1 §4) with Visualise's work put beside it. Nothing in
the script's text is editable here; text changes happen in Generate (spec 2).

- **Top:** the header and the context card, as in spec 1.
- **The cast**, below the context card: one slot per person, the lead marked. Each slot shows the
  person's name and description in words, and either their avatar or an empty slot (§5).
- **The shots**, in order, each with **its storyboard panel beside it** (§6). Group by beat works as
  in spec 1.
- **A readiness line** at the top: how many cast members have an avatar, and how many shots have a
  current panel (§7).

## 5. The cast: one client Avatar per person

### 5.1 What a cast member needs

Each person in the cast (spec 1 §2.3) points to **one client Avatar**: a person in the client's
Avatars library. Spec 3 makes or picks it. **There is no second kind of avatar** (parent spec §7):
it is the same record the Avatars library and the Avatar Studio already hold, with the same front
image, optional profile sheet, optional voice, and likeness consent for a real person
(client-avatars spec §3–§4, D287–D297).

The only thing Visualise writes into the script is **which Avatar each cast member points to.**

### 5.2 An empty slot

A cast member without an avatar shows their description and two actions:

- **Pick from library** — the client's avatars that are in the library (drafts are not offered,
  the same rule as the canvas gallery, avatars-on-canvas spec §2). Picking links the person.
  This is how James, Rajan and Saraswathi, Harpreet and Gurmeet are reused across reels
  (spec 1 §2.3).
- **Make avatar** — opens the existing Avatar Studio for a new avatar *(assumed — open question 1)*,
  with:
  - **AI-generated**: the Studio's **Describe** tab, the prompt filled in from the cast member's
    description in words, and the name filled in from the cast member's name. The operator can edit
    the prompt before generating; this is the parent spec's "avatar instructions" box, and
    regenerating is the Studio's own Generate.
  - **Specific**: the Studio's **Upload a photo** tab, for a real person such as the founder. The
    Studio's likeness consent statement applies unchanged, and the avatar cannot be saved to the
    library without it (client-avatars spec §3.3).

  Saving to the library returns the operator to the script, with the new avatar linked to that
  cast member.

### 5.3 A filled slot

Shows the avatar's front image, its name, and its profile sheet when it has one. Actions:

- **Change** — pick a different avatar, or make a new one.
- **Open in Avatars** — the Studio, to refine it (a new front, a sheet, a voice).

An avatar belongs to the client, not the script. Changing it in the Studio changes it for every
script that uses it, which is the point (spec 1 §2.3). Panels already drawn from the old face are
then out of date (§6.4).

### 5.4 What the cast needs before panels

**Avatars come first so faces hold** (parent spec §7). A shot's panel can be generated once every
cast member on screen in that shot has an avatar. A shot with nobody on screen (B-roll) can be
generated at any time.

Whether a cast member also needs a profile sheet before their panels is open (open question 2).
The Studio keeps the sheet optional today (D295).

### 5.5 The profile sheet

The Studio's sheet today is **three views — front, side profile, back** (D288; the operator chose
three over four). The parent spec's sketch shows four (front, left, right, back). Spec 3 reuses the
Studio's sheet and does not change it *(assumed — open question 3)*.

The dry run found that a profile view needs **its direction stated**, or the model returns views
facing the same way (parent spec §11.1). That finding carries to the sheet the Studio makes,
whichever number of views it has.

### 5.6 Voice

The Studio's voice step stays as it is and optional. Visualise neither asks for a voice nor shows
one in the cast slot *(assumed — open question 4)*.

## 6. The storyboard: one panel per shot

### 6.1 What a panel is

One image beside each shot, at the script's aspect (9:16 for every Jackfruit365 reel), showing
**the scene only**. Drawn as a **sketch, marker and wash**: the dry run found that this reads as a
plan to approve rather than a finished film, which invites comment on the story and not on the
rendering (parent spec §11.1).

### 6.2 What every panel is drawn from

| Input | From | Why |
|---|---|---|
| The shot's visual line | The shot (spec 1 §2.4) | What happens and what the person does |
| The context card's setting and camera | The script (spec 1 §2.2) | Where it happens, the light, how it is shot |
| **The regional kit** | The client's script notes (parent spec §5.1), for the script's region | "South Indian kitchen" alone came out European; naming the kit fixed it |
| **Each on-screen person's description in words** | The cast (spec 1 §2.3) | The image alone let the pottu and saree drift; naming the markers fixed it |
| **Each on-screen person's avatar images** | Their client Avatar: the front image, and the profile sheet when it has a current one | So the face holds |
| **No generated text, no brand names, no labelled packs** | Always | The house spec puts all text and the real pack in post |

The words and the images go together for every person on screen. The dry run showed the image
alone is not enough (parent spec §11.1).

On-screen text is never drawn into a panel, and neither is the AI-generated label: both are added
in post (house spec §2).

### 6.3 Shots that are mostly a card or a pack

Some shots are post graphics more than scenes. In Reel 01: the review card sliding in (REVIEW),
the push-in on the pack holding the claim card (PROOF), and the pack shot (OUTRO). The house spec
says to generate such scenes "with those areas blank or blurred". How a panel shows them is open
(open question 5).

### 6.4 Panel states

| State | What the operator sees |
|---|---|
| Not yet | An empty 9:16 frame and **Generate** with its credit cost |
| Waiting for avatars | The empty frame, Generate unavailable, and which on-screen people still need an avatar |
| Generating | A placeholder the exact size of the finished panel, so nothing moves (the Studio's rule, client-avatars spec §4.2) |
| Ready | The panel, which opens larger on click, and **Regenerate** with its cost |
| Out of date | The panel stays visible with an **Out of date** badge when an on-screen person's avatar has changed since it was drawn. It is never regenerated on its own (the Studio's rule for a stale sheet) *(assumed — open question 6)* |
| Failed | The provider's message, nothing charged, and Generate again |

Every generate action shows its credit cost before the click, the way the Studio does
(client-avatars spec §7) *(assumed — open question 7)*.

### 6.5 Generating many at once

The parent spec puts a generate action on each shot. A 14-shot reel then takes 14 clicks. Whether
there is also one action for every shot still without a panel is open (open question 8).

### 6.6 Getting a panel right

**Regenerate** draws the shot again from the same inputs. Whether the operator can add a note for
one panel ("she faces the stove", "the husband is out of frame") and whether earlier versions are
kept are open (open questions 9 and 10).

## 7. The package spec 4 sends

The package is the script view with every cast member's avatar and every shot's panel. Spec 3 gets
it ready; **"Send to client" is spec 4's.**

The readiness line (§4) counts two things: cast members with an avatar, and shots with a panel
that is not out of date. Whether spec 4 refuses to send an incomplete package is spec 4's
decision; spec 3 only reports the counts.

Only the lead's avatar crosses to the canvas after approval (spec 1 §5.5). Supporting cast's faces
matter here, for the client review, and stop at the review.

## 8. Behaviours

- **The script's text does not change in Visualise.** The only write to the script is each cast
  member's avatar link.
- **A script reopened in Generate keeps its panels.** What happens to a panel when its shot's text
  changes, or a shot is added, split or removed, is open (open question 11).
- **Archiving an avatar** in the library leaves the cast member pointing at it. Existing panels stay;
  the slot says the avatar is archived and offers Change *(assumed — open question 12)*.
- **Two scripts can share an avatar.** That is the intended reuse, and the reason panels go out of
  date when it changes.

## 9. Constraint for the plan

Spec 3 keeps its data (panels, generations) separate from the script document, keyed by script and
shot, and only writes the cast members' avatar links into the script; it changes no stage.

## 10. Success, for the demo

Using Jackfruit365's seeded Reel 01 at the Visualise stage (spec 1 §6), with the house spec as
script notes:

1. **Meenakshi** gets an AI-generated avatar from her cast description, and **her husband** gets one
   from his, both made through the existing Avatar Studio and saved to the client's library.
2. A second script can pick Meenakshi from the library without making her again.
3. All **14 shots** get a panel. Shots with an on-screen person cannot be generated until that person
   has an avatar.
4. **The face holds:** a reviewer recognises Meenakshi as the same woman in every panel she is in,
   with her identity markers (glass bangles, kumkum pottu, reading glasses on a chain) the same
   colour and kind each time. The same holds for her husband (the veshti) in his shots.
5. **The setting holds:** every kitchen panel shows the Tamil Nadu kit (iron tawa, steel vessels,
   kuthuvilakku) and the hall shows the Golu steps; none looks European.
6. **No readable text or brand** appears in any panel, including on the pack and the review card.
7. Every panel reads as a marker-and-wash sketch.
8. The script's text is unchanged after Visualise; only the cast's avatar links are new.

Criteria 4 to 6 are checked by eye, on more than one run, because a model call varies between
runs (spec 1 §11).

## 11. Not in scope

| Item | Why |
|---|---|
| Editing the script's text in Visualise | Spec 2 owns editing; Visualise uses spec 1's read-only view |
| A second kind of avatar, or avatar creation outside the Avatar Studio | A cast member is a client Avatar (spec 1 §2.3) |
| Changing the Avatar Studio's steps, sheet layout or consent | Reused as is; any change is the Avatars feature's (open question 3) |
| "Send to client", the link, comments, approval | Spec 4 |
| Moving the script between stages | Specs 2 and 4 |
| Carrying supporting cast onto the canvas | Needs a Script node that holds several avatars (spec 1 §5.5) |
| Video, animatics or audio from the storyboard | The canvas makes video after approval (parent spec §10) |
| Drawing on-screen text, the AI-generated label or the real pack into panels | Added in post (house spec §2) |
| Automatic checks of panels for hands, left-hand eating, wrong technique | The house spec's checks stay a human review; later |
| A setting library (reference images of a client's kitchens) | Not needed if words hold the setting; see risk 3 |

## 12. Risks

1. **Faces hold, details drift.** The dry run held the face with one reference image and fixed the
   details with words (parent spec §11.1). That was four panels and one person. Fourteen panels and
   two people may drift more. Criterion 4 is what checks it.
2. **Real faces.** A Specific avatar is a real person. Some image models refuse real faces (parent
   spec §11), and the platform's own record says Seedance refuses uploaded real faces
   (client-avatars spec §8). Whether the panel model accepts an uploaded photo as a reference is
   untested (open question 13). A Founder-led reel depends on it.
3. **The setting drifts between panels of the same room.** Words fixed a European kitchen in the dry
   run, but two panels of the same kitchen may still differ in layout. The client may read that as
   two places.
4. **Many people in one shot.** Reel 16 has three families and Reel 27 three generations
   (spec 1 §2.3). Every on-screen person adds a description and up to two images. The image models
   have a limit on reference images (D308: 10 to 16 for stills), and a crowded shot may hold faces
   less well. The demo reel has at most two people per shot.
5. **Cost.** The dry run estimated about 30 images for a 14-shot reel with one regeneration per panel
   (parent spec §11.1), before the cast's avatar images. Two avatars add their front candidates and
   any sheets. Fine for a demo; the real number is open (open question 7).
6. **Sketches hide errors the house spec cares about.** A marker sketch may not show a left hand at
   the plate or a wrong marker clearly enough to catch. Those checks stay on the generated video.

## 13. Open questions

1. **Where an avatar is made.** (a) Visualise opens the existing Avatar Studio with the cast
   description filled in, and returns to the script on save; (b) a slimmed Look step inside the
   Visualise view; (c) the operator makes avatars in the Avatars library first and only picks in
   Visualise. *Recommend (a): it reuses the Studio whole, including consent, and costs one round trip.*
2. **Does a cast member need a profile sheet before their panels?** (a) No, the front image is
   enough; (b) the lead only; (c) everyone on screen. *Recommend (a) for the demo, then test whether
   the sheet improves panel likeness before requiring it.*
3. **Three views or four on the sheet.** The Studio makes three (front, side, back, D288); the parent
   spec's sketch shows four (front, left, right, back). (a) Keep the Studio's three, with the
   profile's direction stated; (b) change the Studio to four for every avatar; (c) four only for
   avatars made from Visualise. *Recommend (a): (c) would make a second kind of sheet, and (b) reopens
   D288.*
4. **Voice per cast member.** (a) Not part of Visualise; the Studio's optional voice step is enough;
   (b) Visualise shows each person's declared voice and the preview clip, for the client to hear;
   (c) the lead must declare a voice before the package is ready. *Recommend (a) for the demo; spec 4
   decides whether the client hears voices.*
5. **Panels for card and pack shots.** (a) Draw the scene with the card or pack area blank, as the
   house spec says for production; (b) no panel, a plain placeholder naming the graphic; (c) draw
   them like any shot and rely on the no-text rule. *Recommend (a): it shows the client the framing
   and follows the house spec.*
6. **Panels when an avatar changes.** (a) Mark them out of date, never regenerate on their own;
   (b) regenerate them automatically; (c) do nothing. *Recommend (a): it matches the Studio's stale
   sheet and spends no credits unasked.*
7. **Credits and regeneration limits.** (a) Panels bill like any image, cost shown, no limit beyond
   the monthly cap; (b) a fixed number of regenerations per panel; (c) a per-script budget shown in
   the readiness line. *Recommend (a): it is the platform's existing rule and the demo needs no more.*
8. **Generate all.** (a) One action draws every shot still without a current panel, plus per-shot
   generate; (b) per-shot only, as the parent spec sketched. *Recommend (a): fourteen clicks is
   friction in a demo whose point is the visual.*
9. **A note per panel.** (a) A short instruction box per panel, added to that panel's inputs;
   (b) regenerate only; changes go through the script's visual line in Generate. *Recommend (a): a
   framing fix should not force the script back to Generate.*
10. **Earlier versions of a panel.** (a) Regenerate replaces it; (b) keep the versions and let the
    operator choose which one the client sees. *Recommend (b) only if spec 4 needs a history of the
    panels; otherwise (a).*
11. **Panels when the shot's text changes.** If the script is reopened in Generate and a shot is
    edited, split, added or removed: (a) an edited shot's panel is marked out of date, a new shot has
    none, a removed shot's panel goes; (b) every panel is kept and nothing is marked; (c) all panels
    are cleared. *Recommend (a).*
12. **An archived avatar in a cast.** (a) The link stays and the slot offers Change; (b) the link is
    cleared and the slot is empty again. *Recommend (a): panels drawn from it stay explained.*
13. **Which image model draws the panels.** The dry run used Nano Banana 2, the Studio's default
    sheet model. Untested: whether it accepts an uploaded real photo as a reference, how well it
    holds two faces in one panel, and its reference limit. (a) Nano Banana 2 for every panel;
    (b) a model picker per panel, as the Studio has; (c) a fixed model chosen after a probe on Reel 01
    and one Founder-led reel. *Recommend (c): probe first, then fix one model and show no picker.*
14. **Whether the existing consent covers panels and client review.** The house spec requires James' written consent
    "covering paid promotion". (a) The Studio's existing likeness consent covers panels too; (b) the
    Specific avatar's consent must also say it covers client review. *Recommend (a), with legal to
    confirm the wording.*
