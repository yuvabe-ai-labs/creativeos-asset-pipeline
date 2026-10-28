# No client in the system · brand-neutral, brand-aware

**28 October 2026 · design (the *what*) · refines spec 2 (Generate), D336, D262/D263**
Architecture traced first: [Script Copilot Anatomy](https://claude.ai/artifact/5hRHFqvXrTKApqwGodGJbc).

---

## 1. Why

CreativeOS serves many clients. Several features were built and proven on one client at a time, and
that client's specifics went into instructions and code that **every** client gets.

What surfaced it, on 27 October: writing a script for Propalyst (a real-estate brand), the copilot's
occasion question offered **"Kerala Piravi, Sun 1 Nov"**. That chip is fixed text written for the
Jackfruit 365 demo. Behind it, every client's script copilot is told that each angle has a **meal
moment**, that the brief has a **"Meal and product use"** line with **the spoon count when the flour
goes into batter**, that reels have **nine beats** and a **review beat**, and it is shown Jackfruit's
examples ("onion and garlic", "not a substitute for medication", "Sun 1 Nov (Kerala Piravi)").

It is not only Jackfruit and not only the copilot. The writer of video prompts shows **CHUPPS**
(another client) as its examples; the team already saw that pull CHUPPS's look into other reels
("CHUPPS reels kept arriving in the monsoon", D262). The script reader's subject rule is written
around a skincare product (cream, jar, skin, rose petal) and assumes every reel is a product film.

The user's rule (28 Oct): **"Anywhere it becomes part of the system it should be removed and made
neutral."** And: the copilot should be **"more smart and neutral"**, and **"intelligently look at the
brand and suggest themes while it asks questions."** Jackfruit is **one client among many**.

## 2. What success looks like

1. **Nothing shared names a client.** No instruction, example, label, suggestion or rule that every
   client gets names a brand, a product, a food, a festival, a region or one client's reel formula.
2. **The brand comes from the brand.** What makes work *this client's* comes only from that
   client's own material: its brand KB (house rules included), its finished scripts, its avatars,
   its references and its market signals.
3. **Smart suggestions while the copilot asks.** The one-tap suggestions under a question fit this
   brand and today's date (an occasion that matters to a real-estate buyer in the coming weeks),
   not fixed demo text.
4. **Every client is treated the same, Jackfruit included.** Jackfruit's drafts keep their house
   rules, locked lines and review placeholder because they come from *its* KB and scripts, the
   same way any client's do. Its formats come from the shared menu, like everyone's.
5. **No added wait.** Nothing here makes any step slower than it is today.
6. **Checks are client-agnostic.** The test that a draft holds up scores it against that client's
   own KB and examples, so it runs on any client.

## 3. Goals

### 3.1 Script copilot (the largest part)
- **Neutral instructions.** An angle commits to a human situation, how this client's product or
  service appears in it, who else is there, the proof it leans on, and a hook. The confirmation
  card lists the brief in neutral lines. A draft follows the structure of the chosen format.
- **Formats are a shared menu, offered to every client** (user, 28 Oct: "formats don't belong to a
  client — it's offered as options for every client"). Today the format options are read from the
  client's own finished scripts, so a client with none (Propalyst) is offered no format at all.
  Every client is offered the same list (today: UGC, UGC review first, Founder-led). What each
  beat *does* is described in neutral words; Jackfruit's descriptions go ("the spoon, the batter,
  the atta", "a real Amazon review card", "the meal as always", "Available on Amazon"). What goes
  *inside* each beat comes from the brand. **A format's beats are a starting point, not fixed**
  (user, 28 Oct: "review might not be relevant for some brands, so it might vary"): a beat that
  doesn't fit the brand, such as a review beat for a brand that doesn't use customer reviews, is
  left out or adapted. *My call:* the copilot decides this from the client's KB and material and
  shows the beats on the confirmation card, where the person can change them.
- **Compliance comes from the client's KB.** Jackfruit's legal setup leaves the shared prompt:
  "locked" and "cleared" lines, the never-list, the `[real review, verbatim]` placeholder and the
  review card, proof as a named study (user, 28 Oct: "this is specific for Jackfruit"). A client
  with such rules has them in its own KB, which still outranks everything. **One neutral safety
  line stays shared** (user, 28 Oct): "Follow the client's compliance rules in its KB. Never make
  up a testimonial, a number or a claim the KB doesn't give." It names no brand and no legal setup.
- **Every chip comes from the client and the brand** (user, 28 Oct: "chips should be based on the
  client and the brand"). No suggestion is fixed text: not the occasion chips, not the confirm
  chips ("Make it lunch instead"), not the edit chips ("Make the hook punchier", "Move the review
  earlier"). Each is worked out from the brand, the client's material and where the conversation
  is, when the copilot replies, without adding a wait. Lead chips stay the client's own avatars;
  format chips are the shared menu.
- **Scripts in progress keep working.** A script mid-brief or mid-draft still opens and continues.

### 3.2 Script reader (turning a pasted script into shots)
- The rule that every shot description leads with the subject and names the product stays, in
  neutral words. Skincare specifics (cream, jar, skin, forearm, rose petal) and the assumption that
  every reel is a product film go: a reel may be about a home, a service or a person.

### 3.3 Video prompt writer
- Its examples of naming a referenced thing use made-up, neutral items, never a real client's
  product (today: "the black CHUPPS V-Straps").

### 3.4 Visualise
- Regional kits already come from the client's KB. The fixed list of Indian place names that points
  a script at one of Jackfruit's kit regions goes or comes from the KB.

### 3.5 House rules get their own KB field
- Today a client's script house rules (Jackfruit's whole house spec) are pasted into
  `image_analysis.brand_consistency_notes`. That field means "how consistent the look is across
  uploads, website and social", and the image analyser writes it too: a re-run keeps the paste only
  when it is marked "edited", and replaces an "approved" paste with a description of the photos.
- House rules move to **one free-text field of their own** in the brand KB (user, 28 Oct). It holds
  what a script needs that the KB has no field for: what the brand sells, the claims and proof it
  may use, its disclaimers, whether it uses customer reviews, regional customs, things never shown.
- **An LLM drafts it** from the client's own material (brand documents, website, existing scripts),
  stating only what the sources say and leaving out what they don't. It arrives as "needs review";
  the team approves or edits it like any KB field. Jackfruit's existing paste moves into it.
- **Organised later.** Once several clients have one, the recurring parts become structured fields
  (products and services, approved claims, proof, review policy). Not now: fields chosen from one
  client's rules would repeat this design's mistake.

### 3.6 What the copilot's context must carry
Removing client text works only if each client's own material reaches the model. Gaps today:
- **The house rules field** above, read in place of the image-analysis field.
- **Where the audience is.** The KB holds the audience's location, pain points and desires; the
  renderer that turns the KB into prompt text drops them. Occasions depend on location.
- **Today's date.** No copilot prompt has it; occasion suggestions need "the coming weeks".
- **The format menu**, shared by every client, with each format's starting beats and neutral beat
  descriptions, instead of formats read from the client's finished scripts.
- **Market signals on every turn that suggests**, loaded once per turn alongside everything else
  and in a compact form, not only at the angles step.
- **Chips carried with each copilot reply**, produced by the call that writes the reply (the quick
  model's read, the writer's edit); not built in the browser from fixed text. They are **not
  stored** (user, 28 Oct, "for now"): the turn's answer carries them and the browser keeps them for
  the session, so a reload clears them until the next message. The conversation itself is stored.
- **Beats on the confirmation card**, which the first draft follows.
- **Example scripts stay the client's own.** No other client's script is ever shown as an example;
  a client with none writes from the format menu and its KB.
- **Assembled fresh on every turn, as one context.** The context is still built from its sources on
  each turn (the sources stay the only truth, so nothing goes stale), but as one assembled context
  whose sources load together, and whose standing part is identical from call to call. A stored,
  pre-built context per client is **not** part of this work (user, 28 Oct); it is an option for the
  speed work, where its gains (fewer reads, smaller and cacheable prompts) matter and its cost
  (rebuilding it whenever the KB, scripts, avatars or signals change) is worth paying.

### 3.7 The UGC bench is removed
- The internal `/ugc` test page (Seedream faces × Seedance/Omni scripts) is no longer needed (user,
  28 Oct), so its CHUPPS starter rows go with it: the page, its routes, its hook, components and
  library. Avatars keep working: the voice-length limits they borrow from the bench's constants move
  to the avatars' own constants. Specs and ADRs that mention the bench stay as history.

## 4. Non-goals

- **Speed.** Slow copilot edits are separate work, next after this. A stored context object per
  client is considered there, not here.
- **Structured KB fields** for products, claims, proof, kits and review policy. House rules stay
  free text, in their own field (§3.5), until several clients show the right shape.
- **Changing the copilot's order of questions** (format → occasion → lead → angle → card → write).
- **A new model choice.**
- **Comments and test data.** Code comments that mention a client as history, and test fixtures,
  are not instructions to anyone and stay.

## 5. Anti-goals (a failure even if it works)

- Suggestions that invent things the brand never said: a claim, an offer, a price, a launch.
- Swapping one client for another in the shared text, or for a vague stand-in that still describes
  one industry.
- A client's own rules getting lost on the way out (Jackfruit losing its meal moment, spoon line,
  review beat or locked lines; CHUPPS reels losing correct product naming).
- A client with no KB and no scripts getting a confident script with no sign that it is guessing.

## 6. Decided in conversation

- No client's specifics belong in anything shared (user, 27 and 28 Oct), anywhere in the system.
- Neutral *and* smart: the brand drives the content and the suggestions.
- Jackfruit is one client among many. Formats are a shared menu offered to every client, not a
  client's own (user corrected this, 28 Oct).
- Jackfruit's compliance setup (locked lines, never-list, review placeholder) is not shared.
- Every chip is based on the client and the brand; none is fixed text.
- A format's beats are a starting point that varies by brand; a review beat appears only where
  reviews fit the brand.
- House rules are one free-text KB field of their own, drafted by an LLM from the client's own
  material and reviewed by the team; organised into structured fields later (user, 28 Oct).
- The copilot's context stays assembled per turn; no stored context object in this work.
- One neutral safety line stays in the shared prompt: never make up a testimonial, a number or a
  claim the client's KB doesn't give.
- Brand-neutral comes before the speed work.
- **An angle commits to five parts** (user, 28 Oct: "this is good"): the situation; the product
  moment (where the client's product or service shows up); who else is there; the proof, from the
  client's KB; and the hook. A sixth, the review theme, appears only when the client's own reels
  use customer reviews. Meal, review theme and study are no longer required of every angle.
- **Occasion suggestions draw on the brand KB, today's date and the client's market signals**
  (user, 28 Oct: "also use market"). Signals stay data: they can shape where and when, never a
  claim. A client with no KB and no signals is offered occasions coming up in the calendar, plus
  "You pick". Loading the signals must not make the question noticeably slower than today (they
  load alongside what the turn already loads); the builder measures it.

## 7. Known gap: the copilot's old test baseline is gone

The D336 probe never read Jackfruit's *saved* KB: it loaded the house spec from
`docs/sample-scripts/Jackfruit365_Reel_Script_Outlines_Oct26-Mar27.docx.md`, deleted on 19 Oct. So it
is not known whether Jackfruit's saved KB holds every rule the shared instructions carried. The build
reads the saved KBs first. Anything missing from a client's KB is reported to the user; adding it is
a change to client data and needs the user's yes.

## 8. Open questions (need the user)

None left.

## 9. Left to the builder

- How suggestions are produced without a wait (for instance, inside the call that already reads
  each message), and how they are stored with the message.
- Exact neutral wording of every changed instruction, example and label, provided §2 holds.
- How older scripts' saved angles and cards are read after the slots change.
- Reworking the copilot probe to be client-agnostic (§2.6) and running it on Jackfruit and
  Propalyst. A pass for a client with few or no scripts (builder's call, to confirm with the user):
  no other client's words leak in, it follows the client's own examples where there are any, and it
  says when it is guessing.
- Checking the script reader and video prompt writer still name products correctly after their
  examples change.
- The order of work: copilot first, then the script reader, video prompt writer and Visualise.
- Recording the change as an ADR refining D336 and D262/D263.

## Appendix · where it is today (staging, 28 Oct)

- Copilot instructions: `src/prompts/script-copilot.ts` lines 14, 17, 22, 24, 39–40, 46, 49–51, 56,
  61, 65.
- Copilot code: angle fields (`output.ts` 71–74), angle card labels (`copilot-angles-card.tsx` 19),
  chips and founder ordering (`suggestions.ts` 33–37, 48), "Amazon review" (`fill-to-final.ts` 32),
  probe scoring (`probe-score.ts`, `scripts/probe-script-writer.itest.ts`).
- Script reader: `src/prompts/script-parse.ts` `SETTING_ONLY` (201).
- Video prompt writer: `src/prompts/multishot-prompt-generate.ts` 51–54, 85;
  `src/lib/nodes/video-prompt.ts` 79, 87.
- Visualise: `KIT_PLACE_HINTS` in `src/lib/scripts/visualise/kits.ts`.
- UGC bench starter: `src/lib/ugc/starter.ts`.
