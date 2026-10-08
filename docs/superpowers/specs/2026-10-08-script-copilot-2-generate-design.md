# Script copilot · spec 2 — Generate: the copilot that writes and edits a reel script

**8 October 2026 · product spec (the *what*) · spec 2 of 4 · real AI**
Branch: `worktree-script-copilot`. Parent spec: [2026-10-07-script-copilot-design.md](2026-10-07-script-copilot-design.md) (§5).
Builds on: [spec 1](2026-10-08-script-copilot-1-library-and-script-design.md) (approved), whose §2 is the script shape this spec writes into and whose §8 lists what this spec must honour.
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

## 1. Problem

Today the team writes reel scripts in an outside AI chat tool and re-supplies the client's rules
by hand each time: brand voice, locked claim lines, the never-list, the cast, the regional rules
(parent §1). For Jackfruit365 those rules are a long rulebook, §2 "House spec" of the reel outline
document (`docs/sample-scripts/Jackfruit365_Reel_Script_Outlines_Oct26-Mar27.docx.md`): seven
locked claim lines used verbatim, four disclaimers with rules for when each applies, a never-list,
regional rules (roti first in the North and West; rice and tiffin first in the South; what goes
into which meal), seven regional kits, and nineteen recurring personas.

Whoever writes the script either pastes all of that in or forgets part of it. The result is a
document that then has to be uploaded and parsed, and it has none of the shape spec 1 defines.

## 2. Who

A member of the content team writing the next reel for a client whose brand KB is set up
(parent §3). They know the idea; they should not have to re-state the rules.

## 3. The Generate workspace

Opening a script at the Generate stage shows a two-pane workspace (parent §5):

- **Left: the copilot chat.**
- **Right: the script**, in spec 1's script view (spec 1 §4) — header, context card, cast with
  the lead marked, shots in order with running timecodes, the Group by beat switch — **made
  editable**. It is the same view, not a second drawing of the script.

Above the script sits **Mark final** (§9).

**New script** appears in the library (spec 1 §3 held it back until this spec). It opens the
workspace with an empty script and the copilot's first question.

## 4. What the copilot knows without asking

The copilot never asks for any of these in the chat (parent §5.1).

| Source | What it holds | Exists today? |
|---|---|---|
| **Brand KB** | Brand profile and tone of voice, visual identity, target audience and human casting, image and video direction, compliance: preferred verbs and phrases, never-use words, claims and tone, disclaimers (`src/lib/kb/schema.ts`) | Yes |
| **Script notes** | One free-text field per client for what the KB does not hold: product usage, the recurring cast, the reel format (length, beats), regional rules. For Jackfruit365, the House spec | New in this spec |
| **Example scripts** | One or two finished scripts of the client's, showing the format | The seeded Reel 01 (spec 1 §6) |

**Script notes** are plain text the team writes or pastes, kept with the client, and read by the
copilot on every turn. They are deliberately not structured fields (parent §10). Where they are
edited is open question 1.

**Formats and people's names come from these sources**, not from a product list (spec 1 §2.1).
For Jackfruit365 that means UGC, UGC review first, the option modifier, and Founder-led; and the
personas named in the House spec's recurring cast.

## 5. Starting a reel: the three questions

The copilot asks **three things per reel: occasion, persona, angle** (parent §5.2). Everything
else follows from the answers and from §4, and the copilot proposes it rather than asking: format,
region, the meal moment, setting, the review theme, post date, length.

The flow:

1. **Occasion.** The person names it ("Kerala Piravi", "a weekday lunch in Madurai").
2. **Persona.** The person names who leads, or picks from the people the script notes describe.
   The copilot proposes the rest of the cast where the occasion calls for it (Reel 01's husband
   at the table).
3. **Angle.** The copilot **proposes three angles**, each a sentence or two. The person picks
   one, blends two, or writes their own.
4. **Draft.** The copilot writes the whole script into the right pane (§7) and says in the chat
   what it chose on the person's behalf (format, region, setting, length) so any of it can be
   changed.

If the person's first message already answers a question ("a Pongal reel for Harpreet and
Gurmeet"), the copilot does not ask it again. How strictly the three questions are paced is open
question 4.

## 6. The Market Research tool

The copilot has **one tool: Market Research** (parent §5.3). It reads the client's **market
signals**, which exist today on the client's Market page: each signal has a name, tags, a
description, and notes on its evidence (`src/lib/market/signal-brief.ts`).

- The copilot uses it to **shape its angles**, not to write shots.
- When it is used, the result appears **as a card in the conversation**: which signals were read
  and what the copilot took from them, so the person can see why an angle was proposed.
- Signal text is treated as information about a market, never as instructions to the copilot,
  and the client's rules always outrank it. The script parse already holds this line for signals
  (`src/prompts/script-parse.ts`, "compliance first").

When the tool is used, and how many signals it reads, is open question 5. Signals today shape a
script parse only as setting, where and when (D255), one signal at a time (D256). Whether the same
limit applies to angles is part of that question.

## 7. What the copilot writes

Every script is written **in spec 1's shape** (spec 1 §2, §8):

- **Header**: title, reel number, format, region, post date and occasion, theme, aspect, target
  length.
- **Context card**: Purpose; Setting and camera; Disclaimers and watch-outs.
- **Cast**: one or more people, **exactly one lead**, each a name and a description in words
  (age, place, clothing, identity markers, voice), as spec 1 §2.3's Meenakshi example.
- **Shots**, in order, each with a free-text beat label, a length, the visual, the VO, the
  on-screen text, and who is on screen (or nobody).

Rules the copilot follows when it writes, all from spec 1:

- **The shot is the unit.** Where the team's own layout would put an in-row cut inside one row
  ("Cut to", "Quick cuts", "dissolve to", a montage, a split screen), the copilot writes **one
  shot per cut**. A nine-beat reel comes out at roughly **12 to 15 shots** (spec 1 §2.4).
- **Setting changes and transitions go into the visual line**, the way the team writes "Soft
  dissolve to the family at the breakfast table" (spec 1 §2.4).
- **The running timecode is worked out from the lengths**; the copilot writes lengths, not
  timecodes.

Rules that come from the client's sources, not from the product. For Jackfruit365 they are in the
House spec; another client's notes would carry others:

- the **locked claim and proof lines** used verbatim;
- the **disclaimers** each reel needs, by the client's own rules (D3 only when the study is named);
- **nothing from the never-list**;
- the **regional rules and kits** for the reel's region and meal moment;
- the client's **length and beat** pattern (for Jackfruit365, 45 to 55 seconds, about 50, nine
  beats, the claim card held at least 3 seconds).

**The copilot never writes a customer review.** The House spec says reviews are real, verbatim and
cleared ("Never write or edit a review"). Where a reel has a review beat, the copilot writes a
placeholder and a note on what kind of review to find, exactly as the outlines do in Reel 01
(`"[real review, verbatim]"`, "Use a real, cleared review on this theme: fitting the habit into
a busy week"). The team types the real review in themselves.

**Words.** The founder format is **Founder-led**, never "Avatar" (spec 1 §2.1). "Avatar" in the
product means the asset only. The word "presenter" never appears in anything the user sees.

## 8. Editing

Three ways to change a script. In the two AI ways, **only the targeted part changes** (parent
§5.4); every other shot, line and field stays exactly as it was.

| | Where | For | Example |
|---|---|---|---|
| **Inline AI edit** | Select text anywhere in the script; a small prompt appears beside it | Local changes | "shorter", "warmer", "add the claim line" |
| **Chat** | The left pane | Larger moves across several parts | "redo the hook", "move the review earlier", "try the second angle" |
| **Typing** | Directly in the script | Anything the person would rather write | Pasting the real review |

Behaviours:

- After an AI edit, the copilot says **what it changed** in a line, so the person can check it.
- A chat edit may add, remove, split or reorder shots when that is what was asked ("move the
  review earlier"); it still leaves every other shot as it was.
- What the person types is the script. The copilot reads the script as it currently stands on
  every turn, and does not undo a person's edits when it makes its own.
- The rules in §7 hold for edits as they do for the first draft.

Whether an AI edit is applied at once or shown first to accept or reject is open question 6.

## 9. Mark final

**Mark final** moves the script from Generate to **Visualise** (parent §5.5). It is the only stage
change this spec makes. The script then opens in Visualise (spec 3).

A script **can be reopened** for writing (parent §5.5). Who owns that action, and what happens to
work already done in Visualise, is open question 8. What Mark final requires before it is allowed
is open question 7.

## 10. Decisions this spec makes for the other specs

| Decision | Touches |
|---|---|
| The Generate workspace is spec 1's script view, made editable, with the copilot on its left | 1, 2 |
| A client has **script notes**: one free-text field the copilot reads | 2, 3 |
| A script reaches Visualise only through Mark final; Generate → Visualise is spec 2's only stage change | 2, 3 |
| A review beat carries a placeholder and a note until the team types the real review in; the copilot never writes one | 2, 3, 4 |
| New script lives in the library and opens Generate | 1, 2 |

What the later specs can rely on:

- **Spec 3** receives a script with a full cast (one lead, each person described in words), every
  shot naming who is on screen, and setting and transitions written into each visual. It can read
  the client's **script notes** for the regional kits, which parent §11.1 found are needed in
  every panel prompt.
- **Spec 4** receives scripts whose review beats may still hold a placeholder if the team has not
  filled them; whether that may reach a client is open question 7.

## 11. Not in scope

| Item | Why |
|---|---|
| Importing a script written elsewhere | The copilot is the only way in (parent §5.5) |
| More tools than Market Research | One tool for the prototype (parent §5.3) |
| Structured fields for product usage, cast and format | Free-text script notes for now (parent §10) |
| Automatic checks of the review pool, festival dates, disclaimers | Later (parent §10) |
| Writing or editing a customer review | House spec: reviews are real and verbatim |
| Making or picking avatars for the cast | Spec 3 |
| A series or campaign level, or planning a month of reels at once | Parent open question 2 |
| Alternate drafts side by side, branching versions | One script, edited in place |
| Two people writing the same script at once | One writer at a time |
| Avoiding repetition of angles across the client's other scripts | Later; the copilot reads only its one or two examples |

## 12. Success

Spec 2 is done when, for the Jackfruit365 client, with its KB, the House spec as script notes, and
Reel 01 as the example:

1. From **New script**, the copilot asks no more than occasion, persona and angle, proposes three
   angles, and never asks for anything in §4.
2. It writes a reel the outline plans but the example does not contain (for instance Reel 04,
   Kerala Piravi, Rajan and Saraswathi) that the content team accepts as a **first draft**: the
   right persona and regional kit, the locked claim lines verbatim, the disclaimers the House spec
   requires, nothing from the never-list (parent §9, item 1).
3. The draft is in spec 1's shape: a header, a context card, a cast with exactly one lead, and
   **12 to 15 shots**, each naming who is on screen, with in-row cuts split and transitions in the
   visual. The lengths add up to the client's target length.
4. A review beat holds a placeholder, never an invented review.
5. An inline edit and a chat request each **change only the part they target** (parent §9, item 2).
   Checked by comparing the script before and after.
6. **Mark final** moves the script to Visualise.
7. The written script, once approved and dragged onto a canvas, **parses with no manual fixing**
   (parent §9, item 5; spec 1 §10, item 3). Checked on repeated runs, as spec 1 §11 requires.

## 13. Risks

- **Rules drift over a long conversation.** The first draft may honour the House spec and a
  later edit break it (a phulka at breakfast, a banned verb). §7's rules apply to every edit, and
  success items 2 and 5 are checked after edits, not only on the first draft.
- **An invented review.** A model asked for a review beat may write one. The House spec forbids it
  outright; success item 4 exists for this.
- **Edits that reach too far.** "Make it warmer" may rewrite the whole script. Success item 5 is
  checked by comparing every untargeted part.
- **The length budget.** Splitting rows into shots can push the reel past its target length.
  Item 3 checks the sum.
- **The parse round trip.** The copilot writes in spec 1's shape and the handoff prints it in the
  team's layout; if the shape slips, criterion 7 fails (parent §11).
- **Cultural detail.** The House spec asks a native speaker to check local words and family names.
  The copilot does not replace that check; the watch-outs should carry it, as the outlines do.
- **Market signal text as instructions.** Signal notes are written by people and imported from
  social posts; the copilot treats them as data (§6).

## 14. Open questions

1. **Where are a client's script notes edited?**
   - (a) A Script notes section on the client's KB page.
   - (b) A Script notes panel on the client's Scripts library.
   - (c) Inside the Generate workspace, beside the chat.
   *Recommendation: (b), because it sits with the scripts it governs and leaves the KB's own build untouched.*

2. **Which finished scripts does the copilot use as examples?**
   - (a) Always the seeded Reel 01, for the demo.
   - (b) The person picks one or two from the library.
   - (c) The client's most recent final scripts of the same format.
   *Recommendation: (a) for the demo; (c) once the client has its own final scripts.*

3. **Is the conversation kept with the script?** The canvas copilot keeps its chat only for the
   session (`use-copilot-chat.ts`; D71).
   - (a) Kept with the script, visible when it is reopened.
   - (b) Session only; the script is the record.
   *Recommendation: (a), since the parent spec names "no record of how a script was arrived at" as part of the problem (parent §1).*

4. **How strictly does the copilot pace the three questions?**
   - (a) One at a time, always in the order occasion, persona, angle.
   - (b) Asks only what the person's message leaves out, in any order.
   *Recommendation: (b), the canvas copilot's existing rule that inferable answers are never asked (D68).*

5. **When does Market Research run, and over which signals?**
   - (a) Every time the copilot proposes angles, over all the client's signals.
   - (b) Only when the person asks, over the signals the copilot judges relevant.
   - (c) The person picks one signal, as on the Script node (D256).
   *Recommendation: (a) for the demo, so the card always appears and the angles show their source.*

6. **Is an AI edit applied at once, or shown first?**
   - (a) Applied at once, with undo.
   - (b) Shown as a before-and-after to accept or reject.
   *Recommendation: (a) for inline edits and (b) for chat edits that touch several shots.*

7. **What does Mark final require?**
   - (a) Nothing; the person decides.
   - (b) Every shot has a visual and a length, and the cast has a lead.
   - (c) As (b), and no review placeholder is left unfilled.
   *Recommendation: (b); a placeholder may be filled later, but it should be shown as unfilled.*

8. **Who owns reopening a script, and what happens to its Visualise work?**
   - (a) A Reopen action in Visualise (spec 3); avatars and panels are kept, and panels for changed shots are marked out of date.
   - (b) A Reopen action in the library; all panels are kept as they were.
   *Recommendation: (a); this spec's constraint keeps its own stage change to Generate → Visualise.*

9. **How does the cast relate to people already in the client's Avatars library?**
   - (a) The copilot writes the cast in words only; spec 3 links each person to an Avatar.
   - (b) When a persona already has an Avatar (Meenakshi after Reel 01), the copilot links it and reuses its description.
   *Recommendation: (b), since spec 1 §2.3 makes a person once and reuses them across reels.*

10. **How are the title and reel number set?**
    - (a) The copilot proposes the title; the reel number is the next free one for the client.
    - (b) The person types both.
    *Recommendation: (a), both editable.*

11. **Which model writes and edits the script?**
    - (a) The model the canvas copilot already uses.
    - (b) A model chosen for this job by testing on success items 2 to 5.
    *Recommendation: (b); the choice should come from runs against the House spec, not from a default.*

12. **Does the copilot flag rule breaks in text the person types?**
    - (a) No; the person owns what they type.
    - (b) Yes, a quiet note in the chat when typed text hits the never-list or drops a locked line.
    *Recommendation: (a) for the demo; (b) belongs with the automatic checks the parent spec defers (parent §10).*
