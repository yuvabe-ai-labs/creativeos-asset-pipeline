# Reference-led video prompts — design

*2026-10-30 · closes YUV-371 · ADRs D441–D445 · first of three projects (see §8)*

## 1. Problem

Generated products drift: the pack changes colour, the label turns to mush, the shape softens.
Operators report that "text takes precedence over the refs" whenever the prompt describes the
product.

The evidence, read-only from production and staging (2026-09-20 → 2026-10-29):

- **J365, last 200 production clips.** 75 carry a product-appearance line ("the yellow Jackfruit365
  pouch … holds its shape, colour, and printed branding exactly"). That wording comes from our own
  writer: the PRESERVATION rule and the PRODUCT role in `multishot-prompt-generate.ts` ask for
  colour, material, components, logo and lettering in every beat.
- **The AI-written look describes the product's surfaces** ("the palette is yellow packaging against
  warm wood"). Operators delete it, or re-use the field for rules that apply to every shot
  ("strictly do not use the same hand for eating and picking the phone"). 28 of 89 J365 plan
  versions hold a look; most sent prompts have none.
- **Images reach the video model unlabelled.** About 90% of clips on every client send images the
  prompt never names (J365 167/200; Madras 52/55; Penguin 35/35). Omni's header lists them as
  `<IMAGE_REF_0>@Image1 …` with no role, so the model guesses which one is the product.
- **The writer's input pulls in visual brand context.** The Multishot Prompt node sends every KB
  slice by default, including Visual Style and Image Direction (lighting, environment, surfaces),
  under a heading the same system prompt tells the writer not to use for setting.
- **No on-screen-text guard on Kling or Seedance.** Only Omni sends "No on-screen text."; the
  Seedance writer is told to use 【】 for subtitles.

Outside guidance agrees on one rule (Google Omni and Flow docs, Kling 3.0 Omni guide, Runway's
Seedance guide, Runware's Omni guide): **the reference carries identity; the text carries action,
camera and framing.** "Your text prompt should complement, not contradict, your visual inputs"
(Google Flow). "An unassigned reference leaves the model free to borrow anything from it" (Runway).

## 2. Goals and non-goals

**Goals**
1. No writer describes a referenced product's appearance.
2. The AI no longer writes a look & atmosphere block; the operator keeps a "Rules for every shot"
   field.
3. Every image sent to a video model arrives with a role label where we know one.
4. The writer's default brand context carries no visual slices.
5. Every model gets the no-on-screen-text guard.

**Non-goals (later projects, §8)**
- Script-level Products / Locations / background plates.
- Keyframe-first product shots.
- Changing which images are sent. **Every wired image is still sent; @ mentions stay optional**
  (operator decision, 2026-10-30). Selection (`selectReferences`, D308) is unchanged.

## 3. Products are named, not described (D441)

Applies to every writer: multishot Omni / Kling / Seedance (`multishot-prompt-generate.ts`, shared
blocks) and the single-take motion prompts (`video-prompt-shared.ts` SPINE,
`video-prompt-seedance.ts`, `video-prompt-gemini-omni.ts`, `video-prompt-kling.ts`,
`video-prompt-veo.ts`).

- A referenced product is mentioned by a **short identifying name only**: "the Jackfruit365 pouch",
  "the tan sliders". No colour, material, component list, label text, lettering or logo wording.
  Exception: when two similar products share a shot, one distinguishing word plus their position is
  allowed (Kling's separator rule stays, reworded to position-first).
- PRESERVATION becomes **one short pin that points at the picture**, not at the product's
  attributes: "the pouch exactly as in its reference". Said once per beat the product is on screen.
- Deleted: the PRODUCT role's "name every distinct element … each one's colour and material";
  the schema `contents` description's "for a product, every component and colour"; the SPINE's
  "restate … the product's shape, its label text, logo, lettering, colours".
- The CHARACTER role keeps wardrobe description (a person has no "exact" reference across angles
  the way a packshot does), but only in shots where that person appears (§6).

## 4. Look block → "Rules for every shot" (D442, closes YUV-371)

- **The writer stops returning `look`.** Removed from `MULTISHOT_PLAN_SCHEMA`; `MULTISHOT_LOOK_SCHEMA`,
  `MULTISHOT_LOOK_BLOCK_RULES`, `LOOK_DESCRIPTION` and the `"look"` refine scope are deleted, with
  their UI (the look card's Refine / Rewrite with AI, the "look" suggestion chips).
- **The stored field stays, renamed in the UI only.** `MultishotPlan.look` keeps its name in data, so
  stored plans need no migration. The focus view shows it as a plain text box labelled **"Rules for
  every shot"**, operator-written, rendered where the look was (top of the prompt, via `withLook`).
- **Operator-owned, so it survives a regenerate.** A whole-sequence write copies the previous plan's
  `look` onto the new plan. The rules travel to the writer in the user turn ("Rules for every shot:
  …") so the beats obey them; the writer is told never to restate them.
- **Old plans:** saved look text stays visible and keeps being sent; the operator can clear it.
  Nothing is deleted silently.
- **Backgrounds:** a background reference is no longer turned into a lighting/palette paragraph.
  Each beat names the setting in a few words ("at the podcast desk"); the image carries the rest.
- `checkPlanLimits`' message "Shorten the look block …" becomes "Shorten the rules or the longest
  shots."

## 5. Every image gets a role label (D443)

**Source of the label.** The writer already reads each attached image into the scratch
`references` array (D319) and the route throws it away. It is now kept:

- `REFERENCE_READING` items become `{ image, role, name, contents }`:
  - `role`: enum `product | person | location | storyboard | style | brand mark | other`
    (replaces the free-text role).
  - `name`: 1–5 words, what the operator would call it ("Jackfruit365 pouch", "podcast set").
- The route maps `image` N → the N-th vision attachment's id (the same `isVisionAttachment` order
  `labelImages` numbers), and stores `plan.refRoles: { id, role, name }[]`. `parsePlan` preserves
  it like `targetModel`; a cut refine keeps the existing `refRoles`; a whole write replaces them.
  An `image` number outside the attachment list is dropped, not an error.

**Fallback.** An image with no reading (added after the plan was written, or on the single-take
lane, whose writer has no reading) is labelled from its source: the presenter's front and sheet →
`person` named after the avatar. Anything else goes unlabelled.

**The line sent.** Built by one pure function, `referenceRolesLine(sentIds, labels, dialect)`, in
`src/lib/video-gen/reference-roles.ts`, called in the video-generate route after `selectReferences`
so it numbers only what is actually sent. Tokens come from the lane's existing dialect
(`dialectForCapability(...).tokenForId`), so it can never number differently from the prompt.

```
Reference roles: <IMAGE_REF_0> is the product (Jackfruit365 pouch): keep it exactly as pictured.
<IMAGE_REF_1> is the location (podcast set): the place, not a subject. <IMAGE_REF_2> is a person
(James).
```

Per role: product → "keep it exactly as pictured"; location → "the place, not a subject";
storyboard → "layout and framing only, never show the drawing"; style → "light and colour only";
brand mark → "a logo graphic, not an object"; person / other → name only. No line when no sent
image has a label.

**Placement.** Omni: directly after the `[# References …]` header (composeOmniPrompt already puts
the header first; the line leads the prompt body). Kling: lead prose ahead of the triples, the same
slot the look uses (D238's acknowledged guess applies equally). Seedance: leads the prompt.

**Frames** are not labelled; `<FIRST_FRAME>` / `<LAST_FRAME>` already say what they are.

## 6. Cleaner writer input (D444)

- New `DEFAULT_MULTISHOT_PROMPT_SLICES` = Casting, Personality, Tone, Compliance (no Visual Style,
  no Image Direction) in `src/lib/kb/parse-context.ts`, used by the Multishot Prompt node when
  `kbSlices` is unset. A node with saved slices keeps them; any slice can still be switched on.
- `MULTISHOT_SHOT_TEXT_CONTRACT`: the claim "The brand context tells you … what the product is
  called" is removed (the KB has no product field). It says the brand context is voice and claims
  only.
- **The presenter appears only where a person does.** CHARACTER role and the shot-text contract:
  a character reference applies to the shots whose text involves a person; a product-only shot shows
  nobody. Refines D438: the avatar is still wired and sent by default, the writer just stops
  putting James into B-roll.

## 7. One no-text guard on every model (D445)

- `NO_ON_SCREEN_TEXT_LINE` moves from `compose-omni-prompt.ts` to a shared module and is added to
  Kling (lead prose, semicolon-free) and Seedance (closing line) requests in their providers.
- Seedance writers (`multishot-prompt-seedance.ts:74`, `video-prompt-seedance.ts:46`): drop "【】
  for subtitles".

## 8. Later projects (not in this spec)

2. **Script-level assets.** Products (clean packshots per SKU), Locations (a background plate,
   generated or uploaded, no people), Cast — attached once to the script, offered to every shot,
   feeding `refRoles` directly instead of the writer's inference.
3. **Keyframe-first product shots.** Compose a start frame with the real packshot, animate it with
   Omni's `<FIRST_FRAME>`.

## 9. Testing

- `reference-roles.test.ts`: the line per role; Omni / Kling / Seedance tokens; numbering after a
  left-out image; avatar fallback; no line when nothing is labelled; frames skipped.
- `multishot-plan.test.ts`: `parsePlan` keeps `refRoles`; regenerate carries `look`; the look
  refine scope is gone.
- `multishot-prompt-generate.test.ts` and single-take prompt tests: the product-description and
  look wording is gone; the pin wording is present; schema has no `look`, has the role enum.
- Route tests: `multishot-prompt` stores `refRoles` mapped to ids and carries the rules forward;
  `video-generate` sends the roles line, and the no-text line on Kling and Seedance.
- Live check: one J365 podcast shot on Omni, old prompt vs new, compared by eye.

## 10. Records

- ADRs D441–D445 appended to the roadmap §7: D441 refines D319/D263; D442 refines D262/D231 and
  closes YUV-371; D443 refines D233/D319 (the writer still writes no tokens; code labels); D444
  refines D262/D438; D445 refines D428.
- Prompt ids bumped: `multishot-prompt-generate@12`, the Kling and Seedance multishot writers, and
  each single-take record.
