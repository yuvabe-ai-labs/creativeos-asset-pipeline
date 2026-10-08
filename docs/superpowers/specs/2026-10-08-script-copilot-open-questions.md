# Script copilot · open questions for specs 2, 3 and 4

**8 October 2026.** Every open question from the three draft specs, copied word for word from
each spec's Open questions section, with its options and the draft's recommendation. Each has an
**Answer** line to fill in. Answers are written back into the specs when they are finalised.

Settled decisions these questions must not re-open: spec 1 §8 and
https://claude.ai/artifact/RLbXdnfrXHf6dYTbm7uN4k#decisions


## Spec 2 · Generate

Source: [2026-10-08-script-copilot-2-generate-design.md](2026-10-08-script-copilot-2-generate-design.md), 14. Open questions.


1. **Where are a client's script notes edited?**
   - (a) A Script notes section on the client's KB page.
   - (b) A Script notes panel on the client's Scripts library.
   - (c) Inside the Generate workspace, beside the chat.
   *Recommendation: (b), because it sits with the scripts it governs and leaves the KB's own build untouched.*


   **Answer (8 Oct):** None of (a)–(c). Notes belong to **each script**, for that reel only, shown under the script and edited with the copilot or an inline AI edit, like the script itself. **Client-level notes come later.** This changes the parent spec §5.1 (one per-client free-text field) for now.

   **Follow-up 1b (8 Oct):** the house rules (locked claim lines, never-list, disclaimers, regional kits) live in the **brand KB**, which the copilot already reads. When finalising spec 2, check what the Jackfruit365 KB already holds and list the gaps.

2. **Which finished scripts does the copilot use as examples?**
   - (a) Always the seeded Reel 01, for the demo.
   - (b) The person picks one or two from the library.
   - (c) The client's most recent final scripts of the same format.
   *Recommendation: (a) for the demo; (c) once the client has its own final scripts.*


   **Answer (8 Oct):** (a), **for the demo only**: the seeded Reel 01. Beyond the demo, the copilot works from a **general interaction model** derived from all 28 Jackfruit365 outlines (what it asks: format, content, research and so on). See [2026-10-08-script-copilot-2-interaction-model.md](2026-10-08-script-copilot-2-interaction-model.md).

3. **Is the conversation kept with the script?** The canvas copilot keeps its chat only for the
   session (`use-copilot-chat.ts`; D71).
   - (a) Kept with the script, visible when it is reopened.
   - (b) Session only; the script is the record.
   *Recommendation: (a), since the parent spec names "no record of how a script was arrived at" as part of the problem (parent §1).*


   **Answer (8 Oct):** (a) Kept with the script, visible when reopened. On reopening, the copilot works from the **current** script and notes, not the old chat.

4. **How strictly does the copilot pace the three questions?**
   - (a) One at a time, always in the order occasion, persona, angle.
   - (b) Asks only what the person's message leaves out, in any order.
   *Recommendation: (b), the canvas copilot's existing rule that inferable answers are never asked (D68).*


   **Answer (8 Oct):** Both combined: a **fixed order, skipping anything already given**. Order per the interaction model §3.2: (1) format + occasion or theme, (2) who leads (UGC only; Founder-led skips), (3) which angle. Anything the person's message already says is never asked.

5. **When does Market Research run, and over which signals?**
   - (a) Every time the copilot proposes angles, over all the client's signals.
   - (b) Only when the person asks, over the signals the copilot judges relevant.
   - (c) The person picks one signal, as on the Script node (D256).
   *Recommendation: (a) for the demo, so the card always appears and the angles show their source.*


   **Answer (8 Oct):** (a) Every time angles are proposed, over all the client's signals (demo). Research shapes WHERE and WHEN only (interaction model §3.4); the card names which signals each angle actually used. Revisit (b) after the demo.

6. **Is an AI edit applied at once, or shown first?**
   - (a) Applied at once, with undo.
   - (b) Shown as a before-and-after to accept or reject.
   *Recommendation: (a) for inline edits and (b) for chat edits that touch several shots.*


   **Answer (8 Oct):** The split. Inline edits (script and notes) apply at once with undo; chat edits that touch several shots show a before-and-after to accept or reject.

7. **What does Mark final require?**
   - (a) Nothing; the person decides.
   - (b) Every shot has a visual and a length, and the cast has a lead.
   - (c) As (b), and no review placeholder is left unfilled.
   *Recommendation: (b); a placeholder may be filled later, but it should be shown as unfilled.*


   **Answer (8 Oct):** Stricter than (c). **Final = ready for the client to read.** (1) Every section present and written: header, Purpose, Character, Setting and camera, the shot table, Watch-outs (all in 28/28 outlines). (2) Disclaimers written whenever one applies (the KB says which); when none applies the script says so, never blank. (3) Every shot has a beat, a length, a visual, a VO line and on-screen text (**corrected 8 Oct:** every row of all 28 reel tables has both VO and on-screen text; the 7 empty cells counted earlier were in the house spec's locked-lines and cast tables, not in reels). (4) No placeholders anywhere (e.g. Reel 01's real review must be in). (5) The copilot builds the outline from the chat, then asks a targeted question for each missing piece. Spec 1 gains a header **production** field ('AI-generated', in all 28 header lines).

8. **Who owns reopening a script, and what happens to its Visualise work?**
   - (a) A Reopen action in Visualise (spec 3); avatars and panels are kept, and panels for changed shots are marked out of date.
   - (b) A Reopen action in the library; all panels are kept as they were.
   *Recommendation: (a); this spec's constraint keeps its own stage change to Generate → Visualise.*


   **Answer (8 Oct):** (a) Reopen lives in Visualise (spec 3); avatars and panels are kept, panels for changed shots marked out of date. Marking final again re-runs fill-to-final. A script In review goes back to Visualise via spec 4 first.

9. **How does the cast relate to people already in the client's Avatars library?**
   - (a) The copilot writes the cast in words only; spec 3 links each person to an Avatar.
   - (b) When a persona already has an Avatar (Meenakshi after Reel 01), the copilot links it and reuses its description.
   *Recommendation: (b), since spec 1 §2.3 makes a person once and reuses them across reels.*


   **Answer (8 Oct):** (b) The copilot links an existing client Avatar when a persona has one (offered at the 'Who leads?' question, interaction model §3.2) and reuses its description. **The person can always change it**: swap to another Avatar, or unlink to words only so spec 3 makes a new one. The Avatar holds who the person is; per-reel styling (e.g. the silk saree for guests) lives in the script.

10. **How are the title and reel number set?**
    - (a) The copilot proposes the title; the reel number is the next free one for the client.
    - (b) The person types both.
    *Recommendation: (a), both editable.*


   **Answer (8 Oct):** (a), both editable. The copilot proposes the title from the chosen angle's hook. The reel number is the slot named in the person's message when there is one ("Reel 04, Kerala Piravi"), otherwise the next free number.

11. **Which model writes and edits the script?**
    - (a) The model the canvas copilot already uses.
    - (b) A model chosen for this job by testing on success items 2 to 5.
    *Recommendation: (b); the choice should come from runs against the House spec, not from a default.*


   **Answer (8 Oct):** (b) Chosen by testing. The plan includes a probe: write Reel 04 with 2–3 candidate models and score each against the success checks (persona and kit, locked lines verbatim, nothing from the never-list, targeted edits only, clean parse). Today the canvas copilot uses gpt-4o-mini and the parse gpt-5.4-mini.

12. **Does the copilot flag rule breaks in text the person types?**
    - (a) No; the person owns what they type.
    - (b) Yes, a quiet note in the chat when typed text hits the never-list or drops a locked line.
    *Recommendation: (a) for the demo; (b) belongs with the automatic checks the parent spec defers (parent §10).*

   **Answer (8 Oct):** (a) No, for the demo; the person owns what they type. A rule check at Mark final (option c, raised 8 Oct) is a possible later addition.

## Spec 2b · Interaction model

Source: [2026-10-08-script-copilot-2-interaction-model.md](2026-10-08-script-copilot-2-interaction-model.md), 5. Gaps and open questions. Derived from all 28 Jackfruit365 outlines.


Things in the outlines the model cannot produce from the KB, the plan and the answers.

1. **Where does the reel plan live?** The plan holds each reel's format, occasion, date, region and often its lead (§1 rows 1, 3–5, 7), plus series balance ("every month has an Avatar reel, a UGC reel and an occasion reel"). (a) The person states the slot in the chat each time. (b) A client reel plan the copilot reads. (c) The plan pasted into the brand KB. *Recommendation: (a) now; (b) with the series level (parent open question 2).*


   **Answer (8 Oct):** (a) The person states the slot in the chat (a whole plan row can be pasted). A client reel plan (b) comes with the series level later.

2. **How does the copilot know a review exists for a theme?** The House spec says "if none exists for a theme, swap the theme or hold the reel", and 20 reels need one. (a) Placeholder and theme only; the team checks. (b) A client pool of cleared reviews the copilot proposes themes from. (c) The team pastes the cleared review before angles. *Recommendation: (a) for the demo, (b) after.*


   **Changed by spec 2 Q7 (8 Oct):** a placeholder can't reach Final, so (a) alone no longer works: the copilot must ask for the real review (c) or read a cleared pool (b) before Mark final.

   **Answer (8 Oct):** (a) for the demo: the draft holds the review beat as a placeholder with its theme; fill-to-final asks the person to paste a real, cleared Amazon review on that theme; if none fits, the copilot offers to swap the theme (house spec). A client pool of cleared reviews (b) later.

3. **Who checks festival dates and customs?** Dates disagree across sources (R16) and need a Panchang (R01); customs such as onion and garlic off screen (R01) are in no KB. (a) The copilot proposes them and writes a "confirm" watch-out. (b) Dates come only from the plan. (c) A date-check tool. *Recommendation: (a).*


   **Changed by spec 2 Q7 (8 Oct):** the date or custom must be confirmed before Final; a "confirm" watch-out alone is not enough.

   **Answer (8 Oct):** (a) The copilot proposes the date and occasion customs; fill-to-final asks the person to confirm each before Mark final; once confirmed it may stay as a watch-out note.

4. **May the copilot use proof lines outside the locked table?** R06 and R09 use "Naturally high in soluble fibre", R23 "Patented", R06 and R23 the study's size. (a) Locked lines only. (b) Allowed, with a "to clear" watch-out. (c) The KB gets a list of cleared but unlocked lines. *Recommendation: (c), so legal decides once.*


   **Changed by spec 2 Q7 (8 Oct):** an uncleared line blocks Final, so (b) only works if the line is cleared in the chat before Mark final; (a) or (c) avoid the block.

   **Answer (8 Oct):** (c) The brand KB gains a second list: lines legal has cleared but that are not locked (e.g. 'Naturally high in soluble fibre'). The copilot uses locked lines verbatim and cleared lines freely, and never invents proof wording. If the KB lacks that list at demo time, fall back to locked lines only.

5. **May the copilot propose product uses the brand has not confirmed?** Appam batter (R12), oats (R13), a protein shake (R15), a travel pack (R03, R22); and the brand's FAQ on reducing rice sits badly with "No change to your diet" (outline §3). (a) Only uses the KB names. (b) Others, with a "confirm with the brand" watch-out, as the outlines do. *Recommendation: (a) once the KB holds the usage guide; (b) until then.*


   **Changed by spec 2 Q7 (8 Oct):** an unconfirmed use blocks Final, so (b) only works if the brand's confirmation is recorded before Mark final.

   **Answer (8 Oct):** (a) Only product uses the brand KB names. **Keep the copilot minimal: the three questions only for now; further questions (e.g. confirming a new use) can be added later.** Fill-to-final still asks for pieces that must be filled before Final (the real review, date confirmation), per spec 2 Q7.

6. **Who is the lead in a reel with several households or a narrator?** R16 has three families and a female narrator who is no persona; Bhavna reacts to the review. (a) The person who reacts to the review. (b) The copilot asks. (c) A narrator is a voice-only cast member and the lead. *Recommendation: (b).*


   **Answer (8 Oct):** (a) The person who reacts to the review is the lead (UGC). It depends on the kind of reel: in Founder-led reels the lead is James. A narrator is never the lead (no face to carry onto the canvas).

7. **What do a reel's own notes hold?** (a) The confirmed brief (§3.5) and the items to confirm. (b) Only what the person adds. *Recommendation: (a), so the reel keeps why it was written this way.*


   **Answer (8 Oct):** (a) The reel's notes start as the confirmed brief (interaction model §3.5) plus the items fill-to-final is still waiting on; the person and the copilot edit them from there.

8. **Where do formats come from for a client with no scripts yet?** (a) The copilot asks for the format in the person's words. (b) The client's formats are written into the brand KB. *Recommendation: (b), since question 1 depends on them.*

   **Answer (8 Oct):** (a) The first question takes the format in the person's words, suggesting the formats seen in the client's library so far. No KB change. A format with no example script yet (e.g. Founder-led today) is written from the description and the house rules alone.

## Spec 2c · Formats, slots and tools

Source: [2026-10-08-script-copilot-2-formats-slots-tools.md](2026-10-08-script-copilot-2-formats-slots-tools.md), 5. Open questions.

1. **Where do the KB's missing parts go for the demo?** (a) Add the missing fields to the brand KB;
   (b) paste the house spec into the KB's free-text consistency notes, read whole by the copilot;
   (c) the demo's KB is hand-filled once for Jackfruit365 only. *Recommendation: (b) for the demo,
   since it needs no KB change and the copilot reads it as text; (a) when the KB is extended.*

   **Answer (8 Oct):** (b) For the demo, paste the house spec into the brand KB's free-text consistency notes; the copilot reads it whole as text. No KB change. Proper KB fields (a) later. The fill-to-final check cannot verify these rules (consistent with spec 2 Q12).

2. **Where do the format structures live?** (a) Built into the copilot as Jackfruit365's three
   structures; (b) inferred from the client's scripts in the library; (c) written into the KB.
   *Recommendation: (b), with the seeded Reel 01 plus one seeded Founder-led and one review-first
   script so all three structures have an example for the demo.*

   **Answer (8 Oct):** (b) Inferred from the client's scripts in the library. For the demo, seed two more hand-split scripts beside Reel 01: **Reel 06 (Founder-led)** and **Reel 08 (UGC, review first)**, so all three structures have an example. This extends spec 1 §6 (seeded scripts) — add to its plan.

## Decisions made outside the numbered questions

- **8 Oct · The copilot's opening, for the demo: four pieces, any skippable.** Format first (it
  decides the sequence), then occasion or theme with date, then lead (UGC only), then narrative.
  The copilot asks only for what is missing; the person can skip any or all ("take the narrative
  and generate the rest") and the copilot proposes the rest; every path ends on the confirmation
  card marking each piece given or proposed. Recorded in the interaction model §3.0. Supersedes the
  "three questions" framing in spec 2 Q4 and model Q8.

## Spec 3 · Visualise

Source: [2026-10-08-script-copilot-3-visualise-design.md](2026-10-08-script-copilot-3-visualise-design.md), 13. Open questions.


1. **Where an avatar is made.** (a) Visualise opens the existing Avatar Studio with the cast
   description filled in, and returns to the script on save; (b) a slimmed Look step inside the
   Visualise view; (c) the operator makes avatars in the Avatars library first and only picks in
   Visualise. *Recommend (a): it reuses the Studio whole, including consent, and costs one round trip.*

   **Answer (8 Oct):** (b) A slimmed avatar maker inside the Visualise view (not a trip to the Studio). **Scope (1b): keep everything, as on the Visualise board** (https://claude.ai/artifact/65cg8RQ1NgTFUCjgmgQ2dM#artboard-c1426575309f): AI-generated / Specific person switch, four-view sheet, voice picker, avatar instructions box, Regenerate avatar, saved to Avatars. Likeness consent for a Specific person stays as a required step. The result is a client Avatar in the library (spec 1 §2.3).

2. **Does a cast member need a profile sheet before their panels?** (a) No, the front image is
   enough; (b) the lead only; (c) everyone on screen. *Recommend (a) for the demo, then test whether
   the sheet improves panel likeness before requiring it.*

   **Answer (8 Oct):** Yes: each person on screen gets the full sheet before their panels (as the Visualise board shows).

3. **Three views or four on the sheet.** The Studio makes three (front, side, back, D288); the parent
   spec's sketch shows four (front, left, right, back). (a) Keep the Studio's three, with the
   profile's direction stated; (b) change the Studio to four for every avatar; (c) four only for
   avatars made from Visualise. *Recommend (a): (c) would make a second kind of sheet, and (b) reopens
   D288.*

   **Answer (8 Oct):** **Four views: Front, Left, Right, Back** (as the Visualise board). **Scope: every avatar, Studio included** (one kind of sheet). Supersedes D288 (three views) with a new ADR; avatars made earlier keep three views until their sheet is regenerated.

4. **Voice per cast member.** (a) Not part of Visualise; the Studio's optional voice step is enough;
   (b) Visualise shows each person's declared voice and the preview clip, for the client to hear;
   (c) the lead must declare a voice before the package is ready. *Recommend (a) for the demo; spec 4
   decides whether the client hears voices.*

   **Answer (8 Oct):** Yes: a voice per cast member, chosen in Visualise (the board's voice picker).

5. **Panels for card and pack shots.** (a) Draw the scene with the card or pack area blank, as the
   house spec says for production; (b) no panel, a plain placeholder naming the graphic; (c) draw
   them like any shot and rely on the no-text rule. *Recommend (a): it shows the client the framing
   and follows the house spec.*

   **Answer (8 Oct):** (a) Draw the scene with the card or pack area left blank (review card, claim card, pack shot); the real pack and graphics go in during the edit.

6. **Panels when an avatar changes.** (a) Mark them out of date, never regenerate on their own;
   (b) regenerate them automatically; (c) do nothing. *Recommend (a): it matches the Studio's stale
   sheet and spends no credits unasked.*

   **Answer (8 Oct):** (a) Panels showing a changed avatar are marked out of date and never redrawn on their own; **'Generate all' redraws every out-of-date or missing panel in one action**.

7. **Credits and regeneration limits.** (a) Panels bill like any image, cost shown, no limit beyond
   the monthly cap; (b) a fixed number of regenerations per panel; (c) a per-script budget shown in
   the readiness line. *Recommend (a): it is the platform's existing rule and the demo needs no more.*

   **Answer (8 Oct):** (a) Panels bill like any image; cost shown before generating; no limit beyond the monthly cap. Generate all shows its total first (e.g. 'Redraw 9 panels · about N credits').

8. **Generate all.** (a) One action draws every shot still without a current panel, plus per-shot
   generate; (b) per-shot only, as the parent spec sketched. *Recommend (a): fourteen clicks is
   friction in a demo whose point is the visual.*

   **Answer (8 Oct):** (a) Yes (answered with Q6): 'Generate all' draws every shot without a current panel (missing or out of date), plus per-shot generate.

9. **A note per panel.** (a) A short instruction box per panel, added to that panel's inputs;
   (b) regenerate only; changes go through the script's visual line in Generate. *Recommend (a): a
   framing fix should not force the script back to Generate.*

   **Answer (8 Oct):** Neither as written: each panel has a **hidden-by-default prompt box showing the exact prompt sent to generate that frame**. It can be **edited and regenerated**, or **reset** to the prompt composed from the script and regenerated. (Boundary to carry: an edit for how the frame is drawn; a story change still belongs in the shot's visual line.)

10. **Earlier versions of a panel.** (a) Regenerate replaces it; (b) keep the versions and let the
    operator choose which one the client sees. *Recommend (b) only if spec 4 needs a history of the
    panels; otherwise (a).*

   **Answer (8 Oct):** (b) Each panel keeps its earlier takes; the operator picks one; the client only ever sees the picked take. (Needed because editable prompts mean a redraw can be worse.)

11. **Panels when the shot's text changes.** If the script is reopened in Generate and a shot is
    edited, split, added or removed: (a) an edited shot's panel is marked out of date, a new shot has
    none, a removed shot's panel goes; (b) every panel is kept and nothing is marked; (c) all panels
    are cleared. *Recommend (a).*

   **Answer (8 Oct):** (a) Edited shot: panel marked out of date; new shot: no panel; removed shot: its panel goes. A hand-edited prompt does not carry over to a changed shot: the redraw starts from a fresh prompt built from the new text; the old prompt stays with its earlier take. Split: the first half keeps the old panel as an out-of-date take, the second starts empty.

12. **An archived avatar in a cast.** (a) The link stays and the slot offers Change; (b) the link is
    cleared and the slot is empty again. *Recommend (a): panels drawn from it stay explained.*

   **Answer (8 Oct):** Neither: **not allowed for now** — an avatar used in any script cannot be archived; the Avatars library's archive action refuses while a script uses it (a change to the existing Avatars feature, for spec 3's plan). Spec 1's handoff keeps its archived-avatar safeguard for older data.

13. **Which image model draws the panels.** The dry run used Nano Banana 2, the Studio's default
    sheet model. Untested: whether it accepts an uploaded real photo as a reference, how well it
    holds two faces in one panel, and its reference limit. (a) Nano Banana 2 for every panel;
    (b) a model picker per panel, as the Studio has; (c) a fixed model chosen after a probe on Reel 01
    and one Founder-led reel. *Recommend (c): probe first, then fix one model and show no picker.*

   **Answer (8 Oct, changed):** (a) **Nano Banana 2 for every panel, for now**, no picker. Untested risks to watch in the demo: two faces in one panel (Reel 01 S6, S10, S12), a Specific uploaded photo as reference, and the reference-image limit (4 views x people on screen).

14. **Whether the existing consent covers panels and client review.** The house spec requires James' written consent
    "covering paid promotion". (a) The Studio's existing likeness consent covers panels too; (b) the
    Specific avatar's consent must also say it covers client review. *Recommend (a), with legal to
    confirm the wording.*

   **Answer (8 Oct):** (a) The Studio's existing likeness consent covers panels and client review; **legal to confirm the wording** (carried in the spec as unconfirmed). If legal requires wider wording, the Studio consent text changes (b).


## Spec 4 · Client review

Source: [2026-10-08-script-copilot-4-client-review-design.md](2026-10-08-script-copilot-4-client-review-design.md), 13. Open questions.


1. **What is a version, and what does the client see of earlier ones?**
   (a) A version is each send; the link shows only the latest, and earlier versions survive only as
   activity entries naming what changed. (b) The client can open any earlier version, read-only.
   (c) The client sees what changed, highlighted, between the last version and this one.
   *Recommendation: (a).* D309 has no versions at all (a new cut is a new node), and the post
   approval design kept history out of V1 (its §13 Q2); the mockup's "S1, S4, S5 revised" entry
   already tells the client where to look.


   **Answer (8 Oct):** (a) A version is each send; the link shows only the latest; earlier versions survive as activity lines naming what changed, each linking to the part (e.g. 'S1 revised' jumps to S1). (Reply was 's', read as (a).)

2. **Between sends, does the link show the version that was sent, or the team's live work?**
   (a) The version sent, frozen until the next send. (b) Live: every team edit shows at once.
   *Recommendation: (a).* The post approval design binds approval to exactly what the client saw
   (D111); live edits would let a client approve a half-made revision.


   **Answer (8 Oct, changed):** (a) **The version that was sent, frozen until the next send.** At each send CreativeOS saves a record: the script text, the picked panel take per shot, and the avatar images. The link shows that record; the team keeps editing in Visualise between sends without the client seeing it; approval binds to the record the client saw. (Lock-while-in-review, option c, was considered and dropped.)

3. **What moves a script from In review back to Visualise?**
   (a) Any client comment. (b) The team, with one action when it starts revising. (c) An explicit
   client "Request changes" action. *Recommendation: (b).* D309 comments never change any state, a
   comment can be a question rather than a change, and spec 1 §2's "when the client comments" is an
   example, not a rule.


   **Answer (8 Oct):** Manual both ways: the team moves the script into and out of In review. **Editing stays allowed while In review** (each share is a frozen version, so edits reach the client only on the next share). Client comments never change the stage.

4. **Who can send to the client, and must every part be visualised first?**
   (a) Anyone on the team; send whatever exists. (b) Anyone; every cast member must have an avatar
   and every shot a panel. (c) Senior or owner only. *Recommendation: (b) once spec 3 lands, (a)
   until then.* The post approval design lets any role send (its §8), and parent spec §0 says the
   client signs off on the visual reel, which an incomplete storyboard does not show.


   **Answer (8 Oct):** **Anyone on the team can share, at any stage.** The team chooses what the share includes: **script only**, **script + avatars**, or **script + avatars + panels**. **4b:** only after Mark final (the script the client reads is always complete; "any stage" = Visualise, In review, Approved). **4c:** Approve appears only on a full share (script + avatars + panels); partial shares are for comments only (whole-package approval stands). **4d:** the team **moves the script to In review manually** (after Mark final); **the Share action only appears in In review**. "Share at any stage" therefore means any stage of visual completeness (script / + avatars / + panels), shared from In review.

5. **Who can approve, and how is the approver recorded?**
   (a) Anyone with the link, under their typed name. (b) Only a client contact named by the team at
   send. (c) (a), plus a team member recording an offline approval, labelled as recorded.
   *Recommendation: (a).* It is D309's trust model, and the post approval design accepts it with the
   limit stated (its §6); the recorded fallback (its §7) can follow if clients approve by phone.


   **Answer (8 Oct):** (a) Anyone with the link, recorded under their typed name. Limit stated in the spec: a typed name proves nothing; a forwarded link can approve.

6. **Can an approval be withdrawn, and what happens to the link afterwards?**
   (a) The client cannot withdraw; the team can reopen the script to Visualise and re-send on the
   same link. (b) The client can withdraw until the script is first dragged onto a canvas.
   (c) Approval is final; changes need a new script. *Recommendation: (a).* Spec 1 §5.4 already
   handles re-approval (canvas nodes keep their copy), and the post approval design keeps every
   round append-only (D111).


   **Answer (8 Oct):** (a) The client cannot withdraw; the team can reopen the script to Visualise and share again on the same link for a new approval. Canvas nodes keep their copy (spec 1 §5.4); activity records Approved › Reopened › Approved.

7. **Can the client comment after approval?**
   (a) No; the link becomes a read-only record showing "Approved on …". (b) Yes, but comments do not
   change the stage. *Recommendation: (a).* Comments after sign-off are the late changes the
   parent spec exists to stop (parent spec §0).


   **Answer (8 Oct):** (a) No comments after approval; the link becomes a read-only record showing 'Approved on …'. A needed change goes through reopen + share again (Q6).

8. **Does the client need an account or a password?**
   (a) Neither: the name typed once, as in D309. (b) A password on the link, the follow-up D311
   already plans. (c) Client accounts. *Recommendation: (a) now, (b) when it lands for D309 links
   too.* The post approval design rejected client accounts for the pilot (its §2 C), and one
   password scheme should cover both kinds of link.


   **Answer (8 Oct):** (a) Neither for now: the name typed once. A link password (b) follows when it lands for the video review links (D311 follow-up), one scheme for both; worth doing soon after the demo (real faces, unreleased claims).

9. **How does the team learn there is something new?**
   (a) Nothing beyond the stage chip; they open the script. (b) An in-app count of new comments and
   approvals, on the library card and the script, like D310's "Client feedback" chip. (c) Email.
   *Recommendation: (b).* D310 shows a total count in-app with no seen-state, and neither D309 nor
   the post approval design sends email (its §9).


   **Answer (8 Oct):** (b) An in-app count of client comments and approvals on the library card and the script, like D310's 'Client feedback' chip. A total, not 'new since seen' (seen-state later). No email.

10. **Does the team reply in a thread and mark comments resolved, and can comments be edited or
    deleted?** (a) As the mockup: team replies, the team marks a thread Resolved; comments edited
    by anyone, never deleted, as D309. (b) The team reads only, as D309 and D244. (c) Resolve
    without replies. *Recommendation: (a).* The mockup shows it, it is how the client sees a comment
    was acted on, and D309's edit-not-delete rule carries over unchanged.


   **Answer (8 Oct):** (a) As the Review board: team replies in a thread and marks it Resolved; comments can be edited, never deleted (D309). Known limit: with no client login, anyone with the link can edit any comment; fixed with Q8's later password/accounts.

11. **What happens to comments on a part that was deleted, split or replaced?**
    (a) They stay, shown under "on a removed shot" with the shot's last text. (b) They move to the
    context card. (c) They are dropped. *Recommendation: (a).* D309 never deletes a comment, and
    D244 keeps old annotations attached to the version they were made on rather than overlaying
    them on newer output.


   **Answer (8 Oct):** (a) Comments stay, shown under 'On a removed shot' with the shot's last text; each comment belongs to the version it was made on. On a split, the first half keeps the shot's identity, so its comments stay with it.

12. **Can a comment point at a spot on a panel or an avatar sheet?**
    (a) No; a comment is on the whole part. (b) A tap-to-place pin, with no painting.
    (c) A painted region, as D239–D251. *Recommendation: (a).* D309 rejected painting for clients on
    phones, and the post approval design called anchored pins a V2 (its D112).


   **Answer (8 Oct):** (a) No spot pins: a comment is on a whole part — context card, shot, avatar, **each avatar view** (Front, Left, Right, Back, as the Review board shows), or panel.

13. **Can the client approve while comments are unresolved?**
    (a) Yes. (b) Yes, after a confirm that names the open threads. (c) No.
    *Recommendation: (b).* The client owns the verdict, and approval is of the whole package; a
    confirm stops an approval that contradicts the client's own open comment.

   **Answer (8 Oct):** (b) Yes, after a confirm that names the open threads ('You have 1 open comment: …  Approve anyway?').
