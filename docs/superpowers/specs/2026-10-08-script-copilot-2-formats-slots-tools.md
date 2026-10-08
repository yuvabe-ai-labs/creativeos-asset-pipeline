# Script copilot · spec 2 companion — formats, slots and tools

**8 October 2026 · product model (the *what*) · companion to spec 2 and its interaction model**
Spec: [2026-10-08-script-copilot-2-generate-design.md](2026-10-08-script-copilot-2-generate-design.md) ·
Interaction model: [2026-10-08-script-copilot-2-interaction-model.md](2026-10-08-script-copilot-2-interaction-model.md) ·
Answers so far: [2026-10-08-script-copilot-open-questions.md](2026-10-08-script-copilot-open-questions.md)
Source: all 28 reels in `docs/sample-scripts/Jackfruit365_Reel_Script_Outlines_Oct26-Mar27.docx.md`
(main repo), counted, not sampled.

---

## 0. What this is

The interaction model says what the copilot asks. This says **what it is filling** and **what it
needs to fill it**:

1. **Formats** — the beat structures the 28 reels actually use.
2. **Slots** — every piece of a finished script, where each comes from, and what makes it complete.
3. **Tools** — the capabilities the copilot needs to hold the conversation and write the script.

Decisions it honours: Final means ready for the client to read (spec 2 Q7); the copilot stays
minimal, three questions (format and occasion, who leads, angle), more added later (model Q5);
house rules live in the brand KB (Q1b); each script has its own notes (Q1); formats are taken in
the person's words (model Q8).

## 1. Formats

Every reel is 9:16, about 50 seconds, **nine beats** (house spec "Format and look"). The 28 reels
use three beat structures. "Option" is not a structure: the five UGC option reels and the one
Founder-led option reel use their parent's structure unchanged; option marks the monthly reel for
places and people the core reels miss (away from home, younger viewers, curd-based uses).

### 1.1 UGC — review mid-reel

Reels 01, 03, 04, 05, 07, 12, 15, 16, 22, 24, 25 (11 of 13) follow it exactly:

| # | Beat | Typical length | What it does |
|---|---|---|---|
| 1 | HOOK | 4–5 s | The persona's moment at the occasion, a line to camera |
| 2 | INTRO | 5–7 s | States the problem or the situation (house spec "Text system") |
| 3 | STORY | 5–8 s | The product enters the persona's routine |
| 4 | STEP | 6–8 s | How it is used: the spoon, the batter, the atta |
| 5 | REVIEW | 8 s, always | A real Amazon review card; the persona reacts; VO reads it |
| 6 | BODY | 4–6 s | The meal as always: "no change to your diet" |
| 7 | PAYOFF | 3–7 s | The family moment; the claim line on the pack |
| 8 | PROOF | 3–6 s | Claim card held 3 s, study line |
| 9 | OUTRO | 3–5 s | Pack shot, "Available on Amazon", disclaimers |

Variants inside the structure: Reel 19 (FAQ) replaces INTRO, STEP and BODY with Q1–Q3 questions;
Reel 21 moves REVIEW to beat 7 and adds a TIP. Both keep HOOK first and PROOF, OUTRO last.

### 1.2 UGC — review first

Reels 08, 10, 11, 17, 18, 26, 27 (all 7):
HOOK › **REVIEW** › INTRO › STORY › STEP › BODY › PAYOFF › PROOF › OUTRO. The review comes right
after the hook (house spec "Review beat"), and the outro says "Available on Amazon, where you can
read the reviews" (house spec "Presentation and outro"). Reel 18 swaps INTRO and STORY.

### 1.3 Founder-led

Reels 02, 06, 09, 13, 14, 20, 23, 28 (all 8). A **fixed frame with free middle beats**:

| Position | Beat | Fixed? |
|---|---|---|
| 1 | HOOK | Always |
| 2 | INTRO | 7 of 8 (Reel 09 puts WHY IT MATTERS first) |
| 3–7 | Topic beats, labels written per reel: WHAT IT IS, WHY NO CHANGE, THE LIMITS, PLACEBO, PUBLISHED, PATENTED, HABIT STACKING, THE SPOON, STEP, BODY | Free; 5–10 s each |
| 8 | PROOF | Always (beat 8; Reel 23 also has PUBLISHED and PATENTED before it) |
| 9 | OUTRO | Always |

No REVIEW and no PAYOFF. James speaks to camera; B-roll is hands and kitchens only, no speaking
personas (Reel 02 Character). The middle is where the topic lives: how-to, myth, study, habit.

### 1.4 What the copilot does with a format

- The format the person names (interaction model question 1) picks the structure.
- For UGC and review first, the nine beats are fixed; the copilot fills them.
- For Founder-led, HOOK, INTRO, PROOF and OUTRO are fixed; the copilot proposes the five middle
  beats from the topic, labelled the way the outlines label them.
- A beat becomes one or more **shots** (spec 1 §2.4): in-row cuts are split.

## 2. Slots

A **slot** is one piece of a finished script. Each row: where its content comes from, and what
"complete" means under the Final rule.

### 2.1 Script-level slots

| Slot | Filled from | Complete when |
|---|---|---|
| **Title** | Proposed from the angle's hook line | Written |
| **Reel number** | The slot named in the chat, else next free (spec 2 Q10) | Set |
| **Format** | Question 1, in the person's words | Set |
| **Region** | The persona's home, the occasion, or the chat (never asked) | Set |
| **Post date and occasion** | Question 1; proposed if missing | Confirmed by the person (model Q3) |
| **Theme** | Question 1 | Written |
| **Aspect, target length** | KB "Format and look" (9:16, 45–55 s) | Set |
| **Production** | KB ("AI-generated") | Set |
| **Purpose** | The chosen angle | Written |
| **Cast** | Question 2 (UGC) or James (Founder-led); supporting cast from the angle | Every person has a name and a description; one lead (model Q6) |
| **Setting and camera** | Persona's home and the region's kit; occasion props; KB light and camera rules | Written |
| **Shots** | The format's beats, filled from the angle (§2.2) | Every shot complete |
| **Disclaimers** | Which proof lines appear: D1, D2 always; D3 when the study is named; D4 as the KB says | Written, or "none apply" stated |
| **Watch-outs** | KB rules that apply to this combination; confirmed items | At least one; nothing unconfirmed |
| **Notes** | The confirmed brief and open items (model Q7) | Open items empty |

### 2.2 Shot-level slots

| Slot | Filled from | Complete when |
|---|---|---|
| **Beat** | The format's structure | Set |
| **Length** | The beat's typical length (§1), summing to about 50 s | Set |
| **Visual** | The angle, the persona, the kit; transitions in the prose | Written |
| **VO** | The angle, in the KB's voice; locked lines verbatim | Written on the beat's first shot; split shots carry it (every row in all 28 reels has VO) |
| **On-screen text** | Locked lines where the beat calls for one; else a short card | Written on the beat's first shot; split shots carry it (every row in all 28 reels has a card) |
| **On screen** | The cast | Set, or nobody (B-roll) |

### 2.3 Beat-specific rules

| Beat | Rule | Source |
|---|---|---|
| REVIEW | Real review, verbatim; theme chosen by the angle; 8 s; card held 3 s | House spec "Review beat", "Real only" |
| STEP | Uses the usage line: "Just 1 tablespoon per meal" | Locked lines |
| BODY | Uses the diet line: "No change to your diet" | Locked lines |
| PROOF | Claim card "Helps control blood sugar levels*", held at least 3 s; study line if named | Locked lines; "Format and look" |
| OUTRO | Pack shot, "Available on Amazon" (review first: "…where you can read the reviews"), disclaimers | Locked lines; "Presentation and outro" |

## 3. Tools

What the copilot needs to have the conversation in the interaction model and fill every slot
above. "Exists" means the capability is in the platform today; "new" means it must be built.

### 3.1 Reading

| Tool | What it gives the copilot | Used for | Exists? |
|---|---|---|---|
| **Brand KB** | Voice, never-lists, disclaimers, locked and cleared lines, format and look | Every slot's rules | Exists; some content has no field yet (§4) |
| **Client Avatars** | The client's people: name, description, face | Question 2 ("who leads"), the cast slot | Exists (spec 2 Q9) |
| **The client's scripts** | Example scripts, the formats seen so far, taken reel numbers | Opening statement, question 1 suggestions, reel number | New (reads spec 1's library) |
| **Market Research** | Market signals for where and when | Question 3, the angles | Exists (spec 2 Q5) |

### 3.2 Writing

| Tool | What it does | Used for | Exists? |
|---|---|---|---|
| **Write the draft** | Writes a whole script in spec 1's shape from the confirmed brief | After the confirmation card | New |
| **Edit a part** | Changes one section, shot or cell, nothing else; multi-shot chat edits shown before and after (spec 2 Q6) | Inline and chat edits | New |
| **Update the notes** | Writes the brief and open items to the reel's notes | Confirmation; fill to final | New |
| **Link a person to an Avatar** | Sets or changes a cast member's Avatar (spec 2 Q9) | Question 2; any time | New |

### 3.3 Checking

| Tool | What it does | Exists? |
|---|---|---|
| **Fill-to-final check** | Lists every slot in §2 that is not complete; "Mark final" is unavailable while the list has anything on it. A plain check of the script, not a model call. | New |

### 3.4 What no tool supplies

The person supplies these through fill to final: the real review (model Q2), confirmation of the
post date and occasion customs (model Q3). Nothing in the platform can source them.

## 4. What the KB can't hold yet

The brand KB today has brand basics, visual and motion style, audience, text system, preferred
phrases, never-use words, claims and tone, and a flat list of disclaimers. These house-spec parts
have no place in it:

| House spec part | Needed by | Note |
|---|---|---|
| Locked lines, by use (claim card, usage, diet, ingredient, study, origin, outro) | STEP, BODY, PROOF, OUTRO slots | Preferred phrases is a flat list with no "use" |
| Cleared-but-not-locked lines | Founder-led topic beats (model Q4: a second list) | New |
| When each disclaimer applies (D3 when the study is named) | Disclaimers slot | Today's list has no conditions |
| Regional kits: dishes, props, wardrobe by region | Setting and camera; visuals | A table in the house spec |
| Recurring cast | Question 2 | Covered by client Avatars once made |
| Product uses the brand confirms | STEP, angles (model Q5) | New |
| Review rules | REVIEW slot | Could sit in the KB's text |
| The three format structures (§1) | Question 1, every shot | Could be inferred from the client's scripts, but the library has only Reel 01 today |

## 5. Open questions

1. **Where do the KB's missing parts go for the demo?** (a) Add the missing fields to the brand KB;
   (b) paste the house spec into the KB's free-text consistency notes, read whole by the copilot;
   (c) the demo's KB is hand-filled once for Jackfruit365 only. *Recommendation: (b) for the demo,
   since it needs no KB change and the copilot reads it as text; (a) when the KB is extended.*
2. **Where do the format structures live?** (a) Built into the copilot as Jackfruit365's three
   structures; (b) inferred from the client's scripts in the library; (c) written into the KB.
   *Recommendation: (b), with the seeded Reel 01 plus one seeded Founder-led and one review-first
   script so all three structures have an example for the demo.*
