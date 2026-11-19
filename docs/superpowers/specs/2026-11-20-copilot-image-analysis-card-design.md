# Image Analysis through a change card (piece 2b)

**Status:** built 2026-11-20 (D510). Approved by Cyril, 2026-11-20. Plan: `docs/superpowers/plans/2026-11-20-copilot-image-analysis-card.md`. Approach A chosen by Cyril on 2026-11-20.
**Part of:** the copilot journey (`2026-11-12-copilot-journey-design.md`), piece 2b. Built on the same branch. Follows the brand KB spec (`2026-11-12-copilot-journey-brand-kb-design.md` §2.4, where Cyril decided on 2026-11-13 that Image Analysis must go through a change card too).

## 1. Problem

The Image Analysis section of the brand KB is rewritten every time the client's images are studied again: when an image is uploaded or removed, when images are brought in from the website or socials, when one is attached in the chat, or when someone presses re-run. The study writes straight into the brand KB.

For most fields that is fine. But when a person has **approved or rejected** a written field and a later study reads the images differently, the field is replaced and sent back to "needs review". The person only sees one line in the thread ("Studied the images again. Changed: …"). Something they reviewed has been changed without their say, which is the one thing the rest of the brand KB no longer allows (D505).

## 2. What changes

A study never changes a field a person has reviewed. It proposes the change on a card in the copilot thread, and a person decides.

What a study does with each field of Image Analysis when it finishes:

| The field… | Today | After |
|---|---|---|
| has not been reviewed | updated | updated, as today |
| is a counted field (format mix, purpose mix, colours), reviewed or not | updated; a review is kept | as today: it is the same measure, only its numbers move |
| was approved or rejected, and the study says the same | kept | kept, as today |
| was approved or rejected, and the study says something different | **replaced, back to "needs review"** | **left as it is; the new value is proposed on a change card** |
| was rewritten by hand | left alone | left alone, and not proposed (Cyril, 2026-11-20) |

The card is the one the brand KB already uses: each field with its value before and after, where the new value came from ("Image study"), a box to keep or drop it, then Approve or Discard. Approving writes the kept fields as approved by that person and records who approved. Nothing else on the brand KB changes, and the brand KB stays approved throughout.

## 3. Rules

- **Decided by Cyril:** reviewed written fields go on a card; unreviewed and counted fields update directly; a hand-written field is left alone and is not proposed.
- **The study is shown what was approved** (Cyril, 2026-11-20, after the review). The written fields are prose the model writes afresh on every study, so without this it would reword an approved field each time and raise a card for nothing. The study is given the approved words and told to return them exactly unless the images now show something different. A card therefore means the images changed, not the wording.
- **A newer study replaces an unanswered card** *(my call)*. If a card from an earlier study is still waiting when a new study finishes, the earlier card is marked out of date and the new one stands. A person never approves an older reading of the images.
- **A discarded proposal is not offered again with the same wording** *(my call)*. If a person discards a proposed value for a field (or drops that field from a card they approve), later studies do not propose that same value for it again. A study that reads something different proposes again.
- **The line in the thread stays, for what changed directly** *(my call)*: "Studied the images again. Changed: …" names only the fields that were updated without a card. When a study only produces a card, the card speaks for itself.
- **The same in a first review and after approval** *(my call)*. Whether the brand KB is still being reviewed or is approved, a reviewed Image Analysis field is only ever changed through a card.
- **Everything a change card already does holds here:** a field changed by hand after the card was made is never overwritten and is shown as changed; two people deciding at once settle it once; the card survives a reload; a pending card shows on the rail as waiting.
- **Image Analysis stays exempt** from "every field must be reviewed before the KB can be marked ready", as today.

## 4. Goals, non-goals, anti-goals

**Goals**
- A field of Image Analysis that a person has reviewed never changes without a person approving the change.
- Fields nobody has reviewed keep updating by themselves, so a new client's Image Analysis fills in as images arrive.

**Non-goals (this piece)**
- Changing what a study reads, how often it runs, or what starts it.
- Changing the Image Analysis tab's own layout, its re-run button, or how a person reviews its fields by hand.
- Proposing changes to fields a person rewrote by hand.
- The page following the copilot to Image Analysis fields (the tab is not one of the page's targets yet; an approval does not highlight them).

**Anti-goals: it fails if…**
- A reviewed field changes without an approved card.
- Every image upload produces a card (the counted fields must not be put on cards).
- A study's card proposes a value the person already turned down for that field.
- Two cards from two studies are both waiting, and approving the older one writes an out-of-date reading.
- A study fails, or reports failure, because a card could not be written to the thread. (The study's direct updates still stand; the failure is logged.)

## 5. Constraints

- The existing change card and its rules (D505); no second approval mechanism (approach B, a separate pending copy on the Image Analysis tab, was turned down).
- A study runs in the background; nothing here adds a wait for the person or a request from the page.
- AGENTS.md rules: turn traces do not apply (no agent turn is involved: a study is not a copilot turn); streaming does not apply (background work reports through status lines).

## 6. Approaches

- **A (chosen): reuse the change card.** The study writes what it may write and proposes the rest on the thread's change card. No new screen, no new table; approving goes through the same route as every other card.
- **B: a separate "pending" copy on the Image Analysis tab**, with its own before-and-after review there. Turned down: a second approval mechanism to keep in step, and the copilot thread would not show it.

## 7. Left to the builder

How a study's result is split into what is written and what is proposed; how change cards come to accept Image Analysis fields; how an earlier study's waiting card is found and marked out of date; how a turned-down value is remembered; the exact wording of the source line on the card.

## 8. Success

On a client whose Image Analysis has an approved "Photography Style": Cyril uploads a batch of different-looking images. When the study finishes, "Photography Style" on the tab still says what he approved, and a card in the thread shows it before and after. He approves it and the tab shows the new value, approved by him. He uploads more images that would change it again, discards that card, uploads one more image that leads to the same reading, and no card appears for it.
