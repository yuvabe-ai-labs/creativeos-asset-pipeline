# Visualise board as a storyboard sheet — design

Date: 2026-11-02 · Status: draft for approval · ADR to assign: D465 (next free number on staging)

Mockup: Design canvas https://claude.ai/artifact/65cg8RQ1NgTFUCjgmgQ2dM, artboard
**"2 · Visualise, storyboard sheet (Nov brainstorm)"**. Where this document and the mockup
differ, this document wins. The neighbouring "compact" artboard is the rejected first try.

## 1. Why

The Visualise board has two panes: the script on the left (summary, then a shot list), and
on the right a full avatar card per cast member, then products and locations, then the
storyboard. Two things make it hard to work in:

- **Avatars eat the screen.** Each cast card is ~700px tall (a wide four-view strip plus
  every control). With three people the storyboard starts three screens down.
- **The shots appear twice.** The shot list on the left and the storyboard on the right are
  the same eight shots, read in two places, so you scroll both and match S-numbers by eye.

The storyboard is the work product of this stage, so the board should look like a
storyboard: a classic sheet of frames, read left to right, with each frame's shot written
under it. Everything else (who's in it, where, which product) is setup that you visit, not
something that should sit between you and the frames.

## 2. What the person sees

Top to bottom, one column, full width:

1. **The readiness line** — unchanged (counts, Move to In review, Reopen, Generate all).
2. **The summary card** — the script brief as today (reel label, title, facts line, shot
   summary and stage badge, purpose, setting and camera, disclaimers, watch-outs), with a
   second area holding three rows of chips: **Cast**, **Locations**, **Products**.
3. **The storyboard sheet** — every shot's panel in reel order, with its shot underneath.

The left/right split goes away, and with it the separate shot list and the separate
Products & Locations section on this board.

### 2.1 Cast, Locations and Products as chips

- **A cast chip** shows the person's face (the avatar's front view; a dashed circle when
  there is no avatar), their name, the Lead tag, and a one-line status. The chip says
  "ready" only when the panels can use the avatar. Every other state the cast card explains
  today gets its own short status: no avatar yet; making the face or the views (in progress);
  needs its four views (a draft); waiting for consent (a specific person's photo not yet
  confirmed); out of date; archived.
- **The video preview's progress is shown in the avatar popup only**, not on the chip. Making
  a preview carries on if the popup is closed, and reopening shows where it is. The chip is
  about whether the avatar is usable for panels, which the preview does not affect.
- **A location chip** shows its plate thumbnail (or a placeholder) and its name. **A product
  chip** shows its main picture (or a placeholder, flagged when it needs a picture) and its
  name.
- **"Add" chips** after the locations and products rows add one, as today, and disappear at
  the existing limits. There is no add on the cast row: the cast comes from the script.
- **Clicking a chip opens its popup** with everything that thing's card does today. Nothing is
  removed, only moved:
  - **Avatar popup:** AI-generated / Specific person, the four views, the video preview
    (play, generate, generate again, out of date), avatar instructions and Regenerate,
    Advanced (image model), Voice, From the library, and the status line. Work in progress
    (making the views) continues if the popup is closed, and the chip shows it.
  - **Location popup:** the plate large, name and description (editable), Generate or Redraw
    (change by a note, or draw anew), Add a picture, Clear, delete, and which shots use it.
  - **Product popup:** name (editable), its pictures with Main and remove, Add pictures /
    Add angles, delete, and which shots use it.

### 2.2 The storyboard sheet

Each shot is one tile, in reel order, flowing across the full width (about five across on a
wide screen, fewer as it narrows, two on a phone). A tile carries:

- **The frame** — the picked panel at the reel's aspect, or an empty dashed frame with "Not
  drawn yet". Out of date and Failed badges sit on the frame's top-left as today. While a
  panel draws, the frame shows the drawing state as today.
- **Redraw, on the frame's top-right, on hover** (and on keyboard focus). It opens today's
  Redraw choice in place: change this panel by a note, or draw it anew, with the cost. On
  touch screens, where there is no hover, it is always shown.
- **Under the frame**, in storyboard order: the shot number, its beat as a small label, and
  its time range; the action line (up to three lines); the spoken line in grey (up to two
  lines, left out when there is none).
- **The shot's product and location pickers**, side by side, as today's per-shot pickers
  (several products, one location, or none).
- **Generate, only on a shot with no panel yet**, with its cost, and today's "waiting for…"
  hint when it can't be drawn yet. A drawn panel has no button under it; its Redraw is on
  the frame.
- **Clicking the frame opens the panel view** as today (versions, Redraw, the prompt box).
  The panel view also shows the parts of the shot the tile leaves out: the on-screen text and
  who is on screen.
- **An empty frame opens too**, so a shot that has no panel yet still shows its on-screen
  text and who is on screen. For such a shot the panel view shows the shot and Generate only:
  no versions and no prompt box (editing a prompt before the first draw is not new behaviour
  this change adds).

The storyboard heading keeps "Scene only. On-screen text is added in post.", Advanced (the
panel image model) and Generate all.

### 2.3 Client comments (team review, In review stage)

The board's review layer keeps working on the new layout:

- the context marker sits on the summary card;
- each cast marker sits on that person's chip;
- the shot marker and the panel marker both sit on that shot's tile;
- the Comments column is unchanged, and clicking a comment's heading scrolls to the summary
  card, the cast chip, or the shot's tile (today a shot or panel comment scrolls to the shot
  row, which no longer exists on this board).

### 2.4 The client's view (review link and the approved board)

The client sees only what is relevant to them: the idea, the cast and the storyboard. **Not
the locations or the products**, which are the team's working references, and not the team's
production notes. The client sees the same layout, read-only:

- **Same skeleton:** a slimmer summary card on top, the cast, the storyboard sheet below at
  full width, the Comments column on the right as today.
- **The client's summary card** carries only what the client signs off on: the reel label,
  the title, the facts line, the purpose (the idea, which the client comments on as today)
  and the disclaimers (claims the brand answers for). **Setting and camera and the
  watch-outs are left out**: the panels show the setting, and the watch-outs are the team's
  reminders to itself.
- **Cast, bigger.** In place of chips, a row of avatar cards, each showing the four views
  large enough to judge, so the client can review and comment on each avatar. Comments work
  as they do today.
- **No locations or products anywhere on the client's page:** no chips or cards for them in
  the summary card, and no product or location under each frame. (Today the client's page
  shows both, read-only.)
- **The storyboard sheet** has the same tiles as the team's, read-only: the frame, the shot
  number, beat and time, the action line and the spoken line; no pickers, Redraw or Generate.
  The shot and panel comments sit on the tile; clicking a frame opens the panel large, as
  today.
- What the client sees still depends on what was shared (script only, with avatars, with
  panels), as today.
- **The approved board** uses the same client layout: it is the frozen copy the client
  approved.

## 3. Goals, non-goals, anti-goals

**Goals**
- With three cast members, the storyboard starts within the first screen on a laptop.
- One place per shot: the frame and its shot read together, as on a storyboard sheet.
- Every action possible on the board today stays possible, at most one click further away.

**Non-goals (this change)**
- Client review of locations or products, and any comment on them.
- Generate (the writing stage) is untouched, including its own shot list and products and
  locations.
- Ideas raised and parked: showing a shot's location and product as small pictures on its
  frame; "used in" shot toggles inside the location and product popups; dragging a chip onto
  a panel; a thin filmstrip for continuity.
- No change to what is stored, generated or charged.

**Anti-goals** (it would be a failure even if it works)
- Losing a control that exists today, or hiding work in progress (making views, drawing) where
  you can no longer see it without opening something.
- Any network call or realtime channel per chip or per tile (house performance rule 1): the
  chips and tiles show data the board has already loaded.
- A purple-filled board: purple stays on the primary actions only.

## 4. Constraints

- Yuvabe Studios design system and house rules in AGENTS.md: shadcn (Base UI) primitives only,
  Lucide icons, the house easing, Clash Display + Gilroy.
- The popups reuse today's avatar, product and location editors rather than rebuilding them.
- The board's data loading stays as it is: one board query, no new routes.

## 5. Calls I made (check these)

- **Popups are dialogs**, centred, like the panel view, rather than side drawers. A drawer
  would let you see the sheet while editing an avatar; a dialog matches what the board
  already does.
- **"Group by beat" goes away** on this board. The beat becomes a small label on each tile, so
  tiles flow without half-empty rows after one-shot beats.
- **On-screen text and who's on screen** move off the sheet into the panel view.
- **The facts line, purpose, setting, watch-outs stay as today** inside the summary card; it is
  not collapsible.
- **Column count adapts to width** rather than being a setting.
- **An empty frame opens a shot-only panel view** (§2.2), so undrawn shots don't lose their
  on-screen text and cast.
- **Cast chip statuses** (§2.1) separate "usable for panels" from every not-yet state; the
  video preview's progress lives in the popup.
- **Success is "the storyboard starts on the first screen"**, not "a whole row of panels
  shows": at 9:16 a full row of frames is ~470px tall, which an always-open summary card can't
  leave room for.
- **"Not sent for review" means hidden on the client's page**, including the product and
  location lines under each frame. What a share stores is unchanged.

## 6. Decided with the person (2 Nov)

- The client's review page and the approved board take the same layout, with the avatars
  bigger so the client can review and comment on each (§2.4).
- Locations and products are not sent for client review; the client reviews the avatars and
  the storyboard.
- The client sees only what's relevant to them: from the summary, the title, facts line,
  purpose and disclaimers; not setting and camera, not watch-outs.

## 7. Success

- A three-person script on a 1440×900 screen shows the summary card and the top of the first
  row of panels without scrolling (today the storyboard starts about three screens down).
- Someone who knew the old board can, without help: set a shot's location, redraw a panel,
  regenerate an avatar, add a location picture, and find a client's comment on a panel.
- On the client's page, each avatar can be judged and commented on from its card, and no
  location or product appears.
