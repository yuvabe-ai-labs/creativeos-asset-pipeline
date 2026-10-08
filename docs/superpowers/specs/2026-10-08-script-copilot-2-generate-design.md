# Script copilot · spec 2 — Generate: the copilot that writes and edits a reel script

**8 October 2026 · product spec (the *what*) · spec 2 of 4 · real AI · revised 8 Oct 2026 to the
answers in [the questions file](2026-10-08-script-copilot-open-questions.md)**
Branch: `worktree-script-copilot`. Parent spec: [2026-10-07-script-copilot-design.md](2026-10-07-script-copilot-design.md) (§5).
Builds on: [spec 1](2026-10-08-script-copilot-1-library-and-script-design.md) (approved), whose §2 is the script shape this spec writes into and whose §8 lists what this spec must honour.
Companions: [the interaction model](2026-10-08-script-copilot-2-interaction-model.md) (what the copilot asks, and in what order) and [formats, slots and tools](2026-10-08-script-copilot-2-formats-slots-tools.md) (what it fills, and what it needs to fill it), both derived from all 28 Jackfruit365 outlines.
ADRs: D326–D335 (booked).
Explainer, with every decision that crosses specs: https://claude.ai/artifact/RLbXdnfrXHf6dYTbm7uN4k#decisions ·
Screen mockups: https://claude.ai/artifact/65cg8RQ1NgTFUCjgmgQ2dM

**Constraint for the plan:** spec 2 may edit the script document itself (it is the writer), and
the only stage change it makes is Generate → Visualise.

---

## 0. Where this sits

| Spec | What it delivers | AI |
|---|---|---|
| 1 · library, script, handoff | The Scripts library, the script, one read-only script view, the handoff to a canvas | None |
| **2 · this spec** | The copilot that writes a script and edits it; "New script"; "Mark final" | Yes |
| 3 · Visualise | An avatar per cast member, a storyboard panel per shot | Yes |
| 4 · Client review | The client link, comments, activity, approval | None |

Spec 1 left three things to this spec (spec 1 §7): creating a script, editing it, and the
"New script" and "Mark final" actions. The demo leads with Visualise and Client review; this
spec comes second, and its bar is a script **good enough to visualise** (parent §0).

**Kept minimal for the demo.** The copilot works from four pieces (§5) and adds no further
questions for now; more can be added later.

## 1. Problem

Today the team writes reel scripts in an outside AI chat tool and re-supplies the client's rules
by hand each time: brand voice, locked claim lines, the never-list, the cast, the regional rules
(parent §1). For Jackfruit365 those rules are a long rulebook, §2 "House spec" of the reel outline
document (`docs/sample-scripts/Jackfruit365_Reel_Script_Outlines_Oct26-Mar27.docx.md`): seven
locked claim lines used verbatim, four disclaimers with rules for when each applies, a never-list,
regional rules, seven regional kits, and nineteen recurring personas.

Whoever writes the script either pastes all of that in or forgets part of it. The result is a
document that then has to be uploaded and parsed, and it has none of the shape spec 1 defines.

## 2. Who

A member of the content team writing the next reel for a client whose brand KB is set up
(parent §3). They know the idea; they should not have to re-state the rules.

## 3. The Generate workspace

Opening a script at the Generate stage shows a two-pane workspace (parent §5):

- **Left: the copilot chat.** The conversation is **kept with the script** and is there when the
  script is reopened. On reopening, the copilot works from the current script and notes, not from
  the old chat.
- **Right: the script**, in spec 1's script view (spec 1 §4) — header, context card, cast with
  the lead marked, shots in order with running timecodes, the Group by beat switch — **made
  editable**. It is the same view, not a second drawing of the script.
- **Under the script: the reel's notes** (§4.2), edited the same way as the script.

Above the script sits **Mark final** (§9).

**New script** appears in the library (spec 1 §3 held it back until this spec). It opens the
workspace with an empty script and the copilot's opening (§5).

## 4. What the copilot knows without asking

The copilot never asks for any of these in the chat (parent §5.1).

### 4.1 The client's rules: the brand KB

The house rules — locked claim and proof lines, the never-list, disclaimers and when each applies,
the regional rules and kits, the review rules, the AI-generated label — live in the **brand KB**,
which the copilot already reads. The KB also holds a second list of **cleared but not locked
lines** (such as "Naturally high in soluble fibre"), which legal approves once; the copilot uses
locked lines verbatim, cleared lines freely, and never invents proof wording. Product uses come
only from what the KB names.

**For the demo**, the house spec is pasted whole into the KB's free-text consistency notes and read
as text; proper KB fields come later (formats model §4–5). The fill-to-final check (§8) cannot
verify rules held as text.

### 4.2 The reel's own notes

**Each script has its own notes, for that reel only.** They start as the brief the copilot
confirmed before writing (§5) plus the items fill to final is still waiting on, and the person and
the copilot edit them from there, with the same inline and chat edits as the script. Client-level
notes come later.

### 4.3 Example scripts, and where formats come from

The copilot learns the client's formats and their beat structures **from the client's scripts in
the library**. For the demo the library holds three seeded scripts (spec 1 §6, extended by this
spec): **Reel 01** (UGC), **Reel 06** (Founder-led) and **Reel 08** (UGC, review first), one per
structure. A format with no example yet is written from the person's description and the house
rules alone.

### 4.4 The client's people

The client's **Avatars library** supplies the recurring cast. When a persona already has an
Avatar (Meenakshi after Reel 01), the copilot links it and reuses its description. The person can
always change the link: swap to another Avatar, or unlink to words only so spec 3 makes a new one.
The Avatar holds who the person is; per-reel styling (the silk saree for guests) lives in the
script.

## 5. Starting a reel: four pieces, any skippable

Before writing, a script needs four pieces. The copilot states what it already has (the KB rules,
the house format, the formats seen in the library), then asks for each piece the person has not
given, in this order. **The person may skip any of them, or all of them** ("take the narrative and
generate the rest"), and the copilot proposes every missing piece itself.

| # | Piece | What it decides | If skipped |
|---|---|---|---|
| 1 | **Format**, offered from the library's structures (UGC, UGC review first, Founder-led; option as a tick) or in the person's words | The beat sequence; review or none, and where; whether a lead is needed; the outro line; what the angles look like | Inferred from the narrative |
| 2 | **Occasion or theme**, with the post date | The date window, festival props and customs, the research topic | Proposed from the narrative or the season |
| 3 | **Lead**, UGC only (Founder-led is James), offered from the client's Avatars | Region, kitchen kit, dishes, accent, wardrobe | Proposed from the Avatars and the region |
| 4 | **Narrative**, the angle: three proposed | Situation, meal moment and product use, supporting cast, review theme, hook and title | Three proposed, from pieces 1–3 and Market Research |

Rules:

- **Fixed order, skipping anything already given.** "Reel 04, Kerala Piravi, UGC, Saraswathi" goes
  straight to the angles. Nothing is asked twice.
- Pieces can come in any order or all at once; the person states the plan slot in the chat (a
  whole plan row can be pasted). A client reel plan comes later, with the series level.
- **Region is never asked**; it comes from the lead's home, the occasion, or the chat.
- The **title** is proposed from the chosen angle's hook; the **reel number** is the slot the
  person named, else the next free one; both editable.
- **The lead** in a UGC reel is the person who reacts to the review; in a Founder-led reel it is
  James; a narrator is never the lead.
- Everything else is derived, never asked: aspect, length, production, locked lines, disclaimers,
  kit, beat lengths.

**Every path ends on the confirmation card**: one short card listing each piece, marked **given**
or **proposed**, plus the cast, meal moment and product use, review theme, proof lines and
disclaimers, and the items to confirm. The person writes, or changes a line. The confirmed brief
becomes the reel's notes (§4.2). Then the copilot writes the draft (§7).

The full model, with the evidence from the 28 outlines: the interaction model §3.

## 6. The Market Research tool

The copilot has **one tool: Market Research** (parent §5.3). It reads the client's **market
signals** from the Market page.

- It runs **every time angles are proposed, over all the client's signals** (for the demo).
- It shapes **where and when** only: what people in that region do and post around the occasion,
  at what time of day, in what setting. It never contributes claims, proof, health language,
  product uses or disclaimers; those come from the KB, which outranks any signal.
- The result appears **as a card in the conversation**, naming which signals each angle actually
  used.
- Signal text is information about a market, never instructions to the copilot.

Other sources the outlines lean on — the real review pool, festival dates, the brand's usage
confirmations — are not tools; the person supplies them through fill to final (§8).

## 7. What the copilot writes

Every script is written **in spec 1's shape** (spec 1 §2, §8), every slot filled from the source
the formats model names (formats model §2):

- **Header**: title, reel number, format, region, post date and occasion, theme, aspect, target
  length, production.
- **Context card**: Purpose; Setting and camera; Disclaimers and watch-outs.
- **Cast**: one or more people, **exactly one lead**, each a name and a description in words,
  linked to a client Avatar where one exists.
- **Shots**, in order, each with a free-text beat label, a length, the visual, the VO, the
  on-screen text, and who is on screen (or nobody). **Every shot has both a VO line and on-screen
  text**: every row of all 28 outlines does.

Rules the copilot follows when it writes, all from spec 1:

- **The shot is the unit.** Where the team's layout puts an in-row cut inside one row ("Cut to",
  "Quick cuts", "dissolve to"), the copilot writes **one shot per cut**. A nine-beat reel comes
  out at roughly **12 to 15 shots**.
- **Setting changes and transitions go into the visual line.**
- **The running timecode is worked out from the lengths**; the copilot writes lengths, not
  timecodes.
- **The beats come from the format's structure** (formats model §1): the nine fixed beats of UGC
  or review first; for Founder-led, the fixed HOOK, INTRO, PROOF and OUTRO with five topic beats
  proposed and labelled per reel.

Rules that come from the client's KB, not the product: locked lines verbatim; the disclaimers each
reel needs; nothing from the never-list; the regional rules and kits; the client's length and beat
pattern; only product uses the KB names.

**The copilot never writes a customer review.** Reviews are real, verbatim and cleared. In the
**first draft** the review beat holds a placeholder and its theme, exactly as the outlines do;
fill to final (§8) then asks for the real one before the script can be final.

**Words.** The founder format is **Founder-led**, never "Avatar". "Avatar" in the product means
the asset only. The word "presenter" never appears in anything the user sees.

## 8. Fill to final, and what Final means

**Final means ready for the client to read.** So the draft is not the end of the conversation.
Once it is written, the copilot lists every piece that is not yet client-ready and asks one
targeted question per piece until the list is empty. **Mark final stays unavailable while
anything is on the list.**

What is on the list:

- A missing or empty section: header, Purpose, Character, Setting and camera, the shot table,
  Watch-outs (all 28 outlines have each).
- Disclaimers, when one applies by the KB's rules; when none applies, the script says so,
  never by leaving it blank.
- A shot with no beat, length, visual, VO or on-screen text.
- A placeholder anywhere, such as the review beat's "[real review, verbatim]": the copilot asks the
  person to paste a real, cleared Amazon review on that theme; if none fits, it offers to swap the
  theme, as the house rules say.
- The post date and occasion customs the copilot proposed (a festival day, onion and garlic off
  screen): the person confirms each; once confirmed it may stay as a watch-out note.

The list lives in the reel's notes, so someone who comes back later sees what is still open.
Rules held in the KB as text (§4.1) are not checked here; the copilot follows them when it
writes, and the person owns what they type (§9).

Full detail: the interaction model §3.6a.

## 9. Editing

Three ways to change a script or its notes. In the two AI ways, **only the targeted part changes**
(parent §5.4); every other shot, line and field stays exactly as it was.

| | Where | For | Applied how |
|---|---|---|---|
| **Inline AI edit** | Select text anywhere in the script or the notes; a small prompt appears beside it | Local changes: "shorter", "warmer", "add the claim line" | **At once, with undo** |
| **Chat** | The left pane | Larger moves across several parts: "redo the hook", "move the review earlier" | A chat edit that touches several shots is **shown as a before-and-after** to accept or reject; a single-part chat edit applies at once |
| **Typing** | Directly in the script or the notes | Anything the person would rather write, such as pasting the real review | — |

Behaviours:

- After an AI edit, the copilot says **what it changed** in a line.
- A chat edit may add, remove, split or reorder shots when that is what was asked; it still leaves
  every other shot as it was.
- What the person types is the script. The copilot reads the script as it currently stands on
  every turn and does not undo a person's edits when it makes its own.
- **The copilot does not flag rule breaks in text the person types**, for the demo; the person
  owns what they type.
- The rules in §7 hold for edits as they do for the first draft.

## 10. Mark final, and reopening

**Mark final** moves the script from Generate to **Visualise** (parent §5.5). It is available only
when the fill-to-final list (§8) is empty. It is the only stage change this spec makes.

**Reopening** a final script for writing is **spec 3's action, from Visualise**: avatars and panels
are kept, and panels for shots that then change are marked out of date (spec 3). Marking final
again re-runs fill to final. A script that is In review goes back to Visualise through spec 4's
action first; this spec needs no path of its own for that.

## 11. The model that writes

The model that writes and edits the script is **chosen by testing**, not inherited from the canvas
copilot. The plan includes a probe: write Reel 04 with two or three candidate models and score each
against success items 2 to 5 (§14).

## 12. Decisions this spec makes for the other specs

| Decision | Touches |
|---|---|
| The Generate workspace is spec 1's script view, made editable, with the copilot on its left and the reel's notes beneath | 1, 2 |
| **Each script has its own notes**, for that reel only; client-level notes come later | 1, 2, 3, 4 |
| The house rules live in the **brand KB** (pasted as text for the demo), including a list of cleared-but-not-locked lines | 2, 3 |
| Formats and beat structures come from the client's scripts in the library; **spec 1 seeds Reel 06 and Reel 08 beside Reel 01** | 1, 2 |
| The copilot links cast members to existing client Avatars; the person can change the link | 2, 3 |
| **Final means ready for the client to read**; fill to final gates Mark final; no placeholders reach Visualise | 2, 3, 4 |
| Reopening lives in Visualise (spec 3); Generate → Visualise is spec 2's only stage change | 2, 3 |
| New script lives in the library and opens Generate | 1, 2 |

What the later specs can rely on:

- **Spec 3** receives a complete, client-ready script: a full cast (one lead, each person described
  and linked to an Avatar where one exists), every shot naming who is on screen with a VO line and
  on-screen text, setting and transitions in each visual, the real review in place, and the reel's
  notes holding the confirmed brief. It reads the regional kits from the KB.
- **Spec 4** never receives a placeholder: a script cannot leave Generate with one.

## 13. What this spec changes in other specs

| Change | Where |
|---|---|
| Two more seeded scripts, Reel 06 (Founder-led) and Reel 08 (UGC, review first), split by hand like Reel 01 | Spec 1 §6; spec 1's plan |
| The house spec pasted into the brand KB's free-text consistency notes for the demo | KB content, no code |
| Per-script notes replace the parent's per-client "script notes" field for now | Parent §5.1 |
| The parent's "three questions" become four pieces, any skippable | Parent §5.2 |

## 14. Not in scope

| Item | Why |
|---|---|
| Importing a script written elsewhere | The copilot is the only way in (parent §5.5) |
| More tools than Market Research | One tool for the prototype |
| More questions than the four pieces (confirming a new product use, a date-check tool) | Keep the copilot minimal; add later |
| Proper KB fields for locked lines, cleared lines, disclaimer rules, kits, product uses | Pasted as text for the demo |
| Client-level script notes; a client reel plan | Later, with the series level |
| A pool of cleared reviews the copilot picks from | Later; the person pastes the review for now |
| Flagging rule breaks in typed text; a rule check at Mark final | Later |
| Writing or editing a customer review | House rules: reviews are real and verbatim |
| Making or picking avatars for the cast | Spec 3 |
| Alternate drafts side by side, branching versions | One script, edited in place |
| Two people writing the same script at once | One writer at a time |

## 15. Success

Spec 2 is done when, for the Jackfruit365 client, with its KB holding the house spec and Reels 01,
06 and 08 seeded:

1. From **New script**, the copilot asks for at most the four pieces, never for anything in §4,
   and skipping all four ("take the narrative and generate the rest") still produces a confirmation
   card and a draft.
2. It writes a reel the outline plans but the examples do not contain (Reel 04, Kerala Piravi,
   Rajan and Saraswathi) that the content team accepts as a **first draft**: the right persona and
   regional kit, the locked lines verbatim, the disclaimers the house rules require, nothing from
   the never-list (parent §9, item 1).
3. The draft is in spec 1's shape: a header, a context card, a cast with exactly one lead, and
   **12 to 15 shots** each with a VO line and on-screen text and naming who is on screen, in-row
   cuts split, transitions in the visual. The lengths add up to the client's target length.
4. A Founder-led reel (Reel 06's topic) comes out with the fixed frame and five labelled topic
   beats, with no review and no payoff.
5. The first draft's review beat holds a placeholder, never an invented review; **fill to final**
   lists it and the unconfirmed date, and **Mark final is unavailable until both are resolved**.
6. An inline edit and a chat request each **change only the part they target** (parent §9, item
   2), checked by comparing the script before and after; a multi-shot chat edit shows a
   before-and-after first.
7. **Mark final** moves the script to Visualise, and the conversation and notes are there when the
   script is reopened.
8. The written script, once approved and dragged onto a canvas, **parses with no manual fixing**
   (parent §9, item 5; spec 1 §10, item 3), checked on repeated runs.

## 16. Risks

- **Rules drift over a long conversation.** The first draft may honour the house rules and a later
  edit break it. §7's rules apply to every edit, and items 2 and 6 are checked after edits.
- **Rules held as text.** For the demo the house spec is prose in the KB, so nothing checks that
  the copilot followed it; item 2 is checked by a person.
- **An invented review.** A model asked for a review beat may write one. Item 5 exists for this.
- **Edits that reach too far.** "Make it warmer" may rewrite the whole script. Item 6 compares every
  untargeted part.
- **The length budget.** Splitting rows into shots can push the reel past its target length. Item 3
  checks the sum.
- **The parse round trip.** If the shape slips, item 8 fails (parent §11).
- **Cultural detail.** The house rules ask a native speaker to check local words and family names.
  The copilot does not replace that check; the watch-outs carry it.
- **Market signal text as instructions.** Signal notes are written by people and imported from
  social posts; the copilot treats them as data (§6).

## 17. Decisions (8 Oct 2026)

Every question this spec's draft raised was answered on 8 Oct; the answers, with the options and
reasons, are in [the questions file](2026-10-08-script-copilot-open-questions.md), sections
Spec 2, Spec 2b (interaction model) and Spec 2c (formats, slots and tools). In one line each:

| # | Decision |
|---|---|
| 2.1 | Notes belong to each script, for that reel only; client-level notes later |
| 2.1b | House rules live in the brand KB |
| 2.2 | Reel 01 as the example for the demo; the interaction model generalises beyond it |
| 2.3 | The conversation is kept with the script |
| 2.4 | A fixed order of pieces, skipping anything already given |
| 2.5 | Market Research runs on every angle proposal, over all signals, for where and when only |
| 2.6 | Inline edits apply at once with undo; multi-shot chat edits show a before-and-after |
| 2.7 | Final = ready for the client to read; fill to final; every shot has VO and on-screen text |
| 2.8 | Reopening lives in Visualise; changed shots' panels marked out of date |
| 2.9 | The copilot links existing Avatars; the person can change the link |
| 2.10 | Title proposed from the hook; reel number from the chat or next free; both editable |
| 2.11 | The writing model is chosen by testing (probe on Reel 04) |
| 2.12 | No flagging of rule breaks in typed text, for the demo |
| 2b.1 | The person states the plan slot in the chat; a reel plan comes with the series level |
| 2b.2 | The review is a placeholder in the draft; fill to final asks for the real one |
| 2b.3 | The copilot proposes dates and customs; the person confirms them before Final |
| 2b.4 | A KB list of cleared-but-not-locked lines; locked lines only as the fallback |
| 2b.5 | Only product uses the KB names; the copilot stays minimal |
| 2b.6 | The lead is who reacts to the review; James in Founder-led; never a narrator |
| 2b.7 | The reel's notes start as the confirmed brief plus open items |
| 2b.8 | The format is taken in the person's words, with the library's structures offered |
| 2c.1 | The house spec is pasted into the KB's free-text notes for the demo |
| 2c.2 | Structures are inferred from the library; seed Reels 06 and 08 too |
| — | The opening is four pieces, any skippable, ending on the confirmation card |

**Still open:** none.
