# Script copilot · spec 1 — the scripts library, the script, and the handoff to the canvas

**8 October 2026 · product spec (the *what*) · spec 1 of 4 · no AI in this spec**
Branch: `worktree-script-copilot`. Parent spec: [2026-10-07-script-copilot-design.md](2026-10-07-script-copilot-design.md).
ADR numbers are assigned when the plan is written.
Explainer, with every decision that crosses specs: https://claude.ai/artifact/RLbXdnfrXHf6dYTbm7uN4k#decisions ·
Screen mockups: https://claude.ai/artifact/65cg8RQ1NgTFUCjgmgQ2dM

---

## 0. Where this sits

The script copilot is built as four specs, in this order:

| Spec | What it delivers | AI |
|---|---|---|
| **1 · this spec** | The client's Scripts library, the script itself, one script view, and the handoff of an approved script to a canvas | None |
| 2 · Generate | The copilot that writes and edits a script | Yes |
| 3 · Visualise | An avatar for each person in the cast, and a storyboard panel per shot | Yes |
| 4 · Client review | The client link, comments, activity, and approval | None |

Produce, the parent spec's stage 4, folds into this spec. Its only new part is how a canvas picks
up an approved script, and that depends on the script's shape, which this spec owns.

Everything later specs read comes from here. The decisions this spec makes for the others are
listed in §8 so each later spec can start by reading the ones that name it.

## 1. Problem

The parent spec brings script writing, visualisation and client approval into CreativeOS. All three
need one shared answer first: **what a script is.** Without it, the copilot writes one shape, the
storyboard reads another, and the client review shows a third.

The answer has to come from how the team writes today. The reference is the Jackfruit365 reel
outline document (`docs/sample-scripts/Jackfruit365_Reel_Script_Outlines_Oct26-Mar27.docx.md`):
28 reels, Oct 2026 to Mar 2027. Every reel uses the same skeleton:

- a header line: format, region, date and occasion, theme, aspect and length, production;
- three short sections: **Purpose**, **Character**, **Setting and camera**;
- a four-column table: **Beat** (label and timecode), **Visual**, **VO**, **On-screen text**;
- disclaimers and watch-outs after the table (11 of the 28 reels carry disclaimers).

Every reel has exactly 9 rows. A row is a beat, and about 19 rows across the document hold more
than one shot inside them ("Cut to", "Quick cuts", "dissolve to", a montage, a split screen).

The script also has to reach a canvas at the end and **parse with no manual fixing** (parent spec,
success criterion 5), through the Script node's existing parse, unchanged.

## 2. What a script is

A script belongs to **one client** and is at **one stage**: Generate, Visualise, In review or
Approved. It can move back, for example from In review to Visualise when the client comments.
How it moves is owned by later specs (§7).

A script has four parts.

### 2.1 The header

Title, reel number, format, region, post date and occasion, theme, aspect, target length and
production ("AI-generated", which ends all 28 header lines; added 8 Oct). These are the fields of
the outlines' header line. The library card shows them.

**Formats are inferred from the client's existing scripts, not picked from a product list,** and so
are the people's names (§2.3). The Jackfruit365 plan uses five:

| Format | Reels |
|---|---|
| UGC | 1, 4, 5, 12, 16, 19, 21, 25 |
| UGC, review first | 8, 10, 11, 17, 18, 26, 27 |
| UGC (option) | 3, 7, 15, 22, 24 |
| Founder-led | 2, 6, 9, 14, 20, 23, 28 |
| Founder-led (option) | 13 |

That is two formats and two modifiers. UGC reels are built around a persona and a real Amazon
review. Founder-led reels are James, the founder, speaking as an AI avatar. "Review first" puts the
review card right after the hook. "Option" marks the one optional reel a month. Another client's
scripts would give other formats.

**"Avatar" is never a format name.** In CreativeOS an avatar is the asset: a person in the
client's Avatars library. The outlines call the founder format "Avatar"; the product calls it
**Founder-led**, the outlines' own description of those reels ("James' avatar, founder-led").

### 2.2 The context card

- **Purpose** — the idea of the reel.
- **Setting and camera** — where it happens, the light, how it is shot.
- **Disclaimers and watch-outs.**

This is the parent spec's "context card", and it is exactly the sections the team already writes.

### 2.3 The cast

One or more people. **Exactly one is the lead.**

- Each person has a **name** and a **description in words**: age, place, clothing, identity
  markers, voice. For example: "Meenakshi, 54, Chennai. Cotton saree in the kitchen, glass
  bangles, kumkum pottu, reading glasses on a chain. Easy, amused English with a Tamil lilt."
- Each person **points to a client Avatar** once one exists (spec 3 makes or picks it). A person
  is made once in the client's Avatars library and picked into any script.
- When the script is printed for the canvas (§5), the cast becomes the **Character** section.

**Why a cast, not one avatar.** The parent spec said one avatar per script. The outlines say
otherwise: by a read of their Character sections, **15 of the 28 reels put two or more people on
screen**, including Reel 01, the demo reel, where Meenakshi's husband sits at the table. Reel 16
has three families and Reel 27 three generations. A person described only in words has no
reference image, so their face would change from panel to panel, and the client would review the
wrong person. That is the exact risk the parent spec names in §11.

**Why a cast member is a client Avatar.** People recur across reels. James appears in 8 reels,
"same styling and set as earlier reels". Rajan and Saraswathi appear in Reels 04 and 21; Harpreet
and Gurmeet in Reels 16 and 27. Making each person once keeps their face the same from October to
February. This answers the parent spec's open question 1: yes, the avatar is saved to the
client's library.

### 2.4 The shots

An ordered list. **The shot is the unit**, because a shot is what gets generated. Each shot has:

| Part | Meaning |
|---|---|
| Beat | A label such as HOOK, STEP or PROOF |
| Length | The shot's length in seconds |
| Visual | What happens and what the person does |
| VO | The voiceover line for this shot |
| On-screen text | Text added in post |
| On screen | Which cast members are on screen, or nobody |

Rules:

- **Beat labels are free text.** Nine labels cover the UGC reels (HOOK, INTRO, STORY, STEP,
  REVIEW, BODY, PAYOFF, PROOF, OUTRO), but the James explainer reels invent their own, such as
  "What it is", "The limits" and "Q".
- **The running timecode is worked out from the lengths**, never typed.
- **Setting changes and transitions are written into the visual**, the way the team already
  writes "Soft dissolve to the family at the breakfast table". This replaces the parent spec's
  separate Setting and Transition fields, and it means the printed text carries them with no
  special handling.
- **A 9-row outline becomes roughly 12 to 15 shots**, because rows that hold an in-row cut are
  split into one shot each. Spec 2's copilot does that split; the seeded Reel 01 (§6) is split by
  hand.

## 3. The Scripts library

**Client › Scripts** sits beside the client's Avatars, Brand assets, KB and Market pages. It shows:

- **one card per script**: reel number, title, stage, the header line, and shot count with length;
- **filter chips by stage**, each with its count;
- **an empty state** for a client with no scripts yet.

In this spec the only script is the seeded Reel 01 (§6). **"New script" arrives with spec 2**,
because the copilot is the only way a script is made. Until then the library has no create
action, so nothing is offered that does not work.

## 4. The script view

Opening a card shows the script, **read-only**:

- the header and the context card at the top;
- the cast, with the lead marked, each person showing their Avatar's face once one exists;
- the shots in order, each with its running timecode, visual, voiceover, on-screen text and who is
  on screen;
- a **Group by beat** switch, on by default. It groups back-to-back shots that share a beat.
  **The timeline order always wins:** a beat that comes back later starts a new group. Turning it
  off shows the flat list.

**One view for every stage.** This is the view every later stage puts its work around: Generate
puts the copilot beside it and makes it editable, Visualise adds a panel beside each shot, and
Client review adds comments. Building it once means the later specs do not each draw the script
their own way, and the client sees the same layout as the team.

## 5. The handoff to the canvas

### 5.1 The Scripts tab

The canvas gallery gets a **Scripts** tab beside its Avatars tab. It lists the client's
**approved** scripts, each showing reel number, title, approval date, and shot count with length.
Scripts at other stages do not appear: approval is the gate the whole feature exists for.

There is no "send to canvas" action on the script page and no canvas picker. The team uses
whichever canvas they are on, the way every other client asset reaches a canvas, and the way
teams already group a month of reels on one canvas.

### 5.2 Dragging a script onto a canvas

1. A **Script node** appears where it is dropped, titled with the script's title.
2. It holds the script **printed in the team's existing layout**:
   - the header line;
   - Purpose;
   - Character, from the cast;
   - Setting and camera;
   - the Beat · Visual · VO · On-screen text table, **one row per shot**, the Beat column holding
     the beat label and that shot's timecode;
   - disclaimers and watch-outs.
3. It **parses straight away**, exactly like an uploaded script, including the client's KB
   context.
4. **The lead's avatar is attached to the node**, the same as dropping an avatar onto a script
   today.

### 5.3 Why it re-parses, and why the parser does not change

The Script node's parse extracts a reel from text. It is told to extract and never invent, to copy
every voiceover line word for word onto exactly one shot, and to make exactly one shot per row.
It is built for the team's layout, so printing the script in that layout needs no change to the
parse. **One row per shot** gives the canvas exactly the shots the client approved, instead of
leaving the parse to decide what happens inside a row with a dissolve in it.

The parsed reel has no place for setting, transition or who is on screen. Those survive the parse
as prose in the visual line (§2.4), and the cast survives as the Character section.

### 5.4 Behaviours

- **The node holds a copy, not a live link.** If the script is reopened and approved again later,
  nodes already on a canvas do not change, so a canvas never re-parses under someone in the middle
  of production. A re-approved script is dragged in again.
- **A script can be dragged in more than once**, onto the same canvas or another, like any other
  asset.
- **A lead with no Avatar means no avatar is attached.** Only the seeded Reel 01 can be in that
  state, before spec 3 exists. It still arrives and parses.

### 5.5 Known gap: only the lead's avatar crosses

A Script node holds **one avatar** today, and nothing after approval changes in this work. So only
the lead's avatar crosses onto the canvas. Supporting cast, such as Meenakshi's husband, stay in
the shot descriptions as words.

**Consequence:** a supporting person's face in the generated video will not match their storyboard
face. The demo ends at approval and handoff, so it does not show this. Closing it means teaching
the canvas to hold a cast, which changes the video pipeline and is later work (§9).

## 6. The seeded Reel 01, plus Reels 06 and 08 *(extended 8 Oct by spec 2 Q2c.2)*

Three seeded scripts, one per format structure, so the copilot can learn each from the library
(spec 2 §4.3): **Reel 01** (UGC, 14 shots), **Reel 06** (Founder-led, 9 shots) and **Reel 08**
(UGC, review first, 9 shots), each split by hand from the outline, every shot with a VO line and
on-screen text (a beat's card carries across its split shots), each 52 seconds. Loaded with
.

The rest of this section describes Reel 01.

This spec ships **Reel 01, "Golu starts today"**, already written as a script for the Jackfruit365
client:

- split by hand from the outline's 9 rows into **14 shots**;
- cast: **Meenakshi** (the lead) and **her husband**;
- stage: **Approved**, so it appears in the Scripts tab and this spec can be tried end to end. A
  developer can load it at an earlier stage instead, such as Visualise, when building specs 3
  and 4.

A developer loads it. **There is no button for it in the product**, so the copilot stays the only
way a user makes a script.

Why it exists:

- The demo leads with Visualise and Client review (parent spec §0). The seeded reel lets specs 3
  and 4 be built and tried before the copilot is done.
- It is the copilot's target: spec 2 can show the model what a good script looks like.
- It is the test fixture for the handoff's success criterion (§10, item 3).

## 7. Left to later specs

| What | Spec |
|---|---|
| Creating a script, editing it, "New script", "Mark final" | 2 |
| Generating or picking avatars for the cast; storyboard panels | 3 |
| "Send to client", the client link, comments, activity, versions, "Approve" | 4 |

## 8. Decisions this spec makes for the other specs

The explainer's decisions section holds the same list with the reasons, each tagged with the specs
it touches: https://claude.ai/artifact/RLbXdnfrXHf6dYTbm7uN4k#decisions

| Decision | Touches |
|---|---|
| Four specs, not five: Produce folds into spec 1 | 1, 4 |
| Each script has a cast; each shot names who is on screen | 1, 2, 3, 4 |
| A cast member is a client Avatar, made once and reused | 1, 3 |
| One lead; only the lead's avatar crosses onto the canvas | 1, 3 |
| Approved scripts reach a canvas from a Scripts tab in the canvas gallery | 1, 4 |
| The handoff prints the team's layout, one row per shot, and re-parses with no parser change | 1, 2 |
| The script's shape follows the outlines: header fields, Purpose, Setting and camera, free-text beats, setting and transitions in the visual | 1, 2, 3, 4 |
| A seeded Reel 01, developer-loaded | 1, 2, 3, 4 |

What each later spec must honour:

- **Spec 2** writes every script in this shape, splits in-row cuts into separate shots, and writes
  setting changes and transitions into the visual line. It fills the cast with a lead.
- **Spec 3** makes or picks one client Avatar **per cast member**, and draws each panel from the
  avatars of whoever is on screen in that shot.
- **Spec 4** lets the client comment on each cast member's avatar, and its "Approve" is what puts a
  script in the Scripts tab.

## 9. Not in scope

| Item | Why |
|---|---|
| Creating or editing a script | Spec 2 |
| Moving between stages | Specs 2 and 4 |
| Generating avatars or panels | Spec 3 |
| Comments, versions, the client link | Spec 4 |
| Carrying supporting cast onto the canvas | Needs a Script node that holds several avatars; changes the video pipeline (§5.5) |
| Importing scripts written elsewhere | The copilot is the only way in (parent spec §5.5) |
| A series or campaign level between client and script | Parent spec open question 2 |

## 10. Success

Spec 1 is done when, for the Jackfruit365 client:

1. The library shows Reel 01 with its stage, header line and shot count, and the stage chips
   filter it.
2. Opening Reel 01 shows the header, context card, cast and 14 shots. Group by beat works, and a
   beat that comes back later starts its own group.
3. Dragging Reel 01 from the Scripts tab onto a canvas gives a Script node that parses into
   **14 shots**, with every voiceover line word for word and no manual fixes.
4. Once the lead has a client Avatar, the drop attaches that avatar to the Script node.

## 11. Risks

- **The parse is a model call.** The same text can parse slightly differently between runs, and
  shot descriptions are extracted rather than copied word for word; only the voiceover is
  verbatim. Success item 3 is checked on repeated runs, not one.
- **Row splitting changes the outlines' shape.** The team writes one row per beat; the printed
  script has one row per shot. The parse is expected to keep one shot per row, and item 3 is what
  confirms it.

## 12. Open questions

From the parent spec, still open (its question 4, on the word "Avatar", is answered: see below):

1. Is there a **series or campaign level** between the client and its scripts?
2. Where should the **cast** eventually live: the client, a series, or the script? (This spec puts
   the people in the client's Avatars library and the cast list on the script.)

**Answered 8 Oct: the word "Avatar".** An avatar is the asset, the person in the client's Avatars
library, every time. The format the outlines call "Avatar" is named **Founder-led** (§2.1).
