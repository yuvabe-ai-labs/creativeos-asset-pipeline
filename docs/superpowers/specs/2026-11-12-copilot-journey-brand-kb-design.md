# Copilot journey, piece 2: the brand KB copilot

**Date:** 2026-11-12
**Parent spec:** [2026-11-12-copilot-journey-design.md](2026-11-12-copilot-journey-design.md) (sections 4.2, 4.3, 4.5, 5.1 and build order item 2)
**Mockups:** the "Brand audit" artboard in the Design artifact, https://claude.ai/artifact/VP7fUPMcBEbvyt1mKHwe4C
**Status:** questions answered 2026-11-13; awaiting Cyril's approval of the whole document. Lines marked *(my call)* were not decided by Cyril and can be overruled.

This spec says what piece 2 does and why. It names no tables, routes or libraries; those belong to the plan.

## 1. Problem

Piece 1 put a panel called Copilot on the Brand KB page. It shows where the client stands and has no input, so it reads as broken.

Three things are wrong with building and keeping a brand KB today:

- **Nothing guides the build.** A new client lands on a form asking for a website, social handles, documents and images. Nothing says which matter, what is happening during the build, or what to do with 40-odd fields once they arrive.
- **Nothing asks.** When the site is silent or ambiguous, the build guesses. The guess is marked "inferred" and the person has to spot it.
- **Adding to an approved KB destroys it.** "Save & Re-analyze" rebuilds six sections from scratch. Every review and every hand edit in them is lost, and the KB goes from ready back to in review. That locks the client's home page and blocks market research until someone reviews every field again. So people avoid adding documents to a KB that works.

## 2. What piece 2 delivers

On the Brand KB page, the panel becomes a chat with the brand KB copilot. It does four jobs.

### 2.1 Gets the build started

- On a new client the copilot opens by asking for the website. It then asks for Instagram and Facebook handles, and for any brand documents or images.
- The person answers in the chat. Documents and images are attached in the chat (section 4).
- The copilot starts the build when it has a website or at least one document, the same minimum as today. It says what it is starting from before it starts.
- Everything the form on the right collects today can still be entered there by hand. Whichever way it is entered, both sides show it.

### 2.2 Says what is happening

- During the build the panel shows real status lines for what is actually running: reading the website, reading the documents, collecting images and video from the site and socials, studying the images.
- Each line turns into a done line when that step finishes. A step that fails says so, says what the person can do, and never reads as "nothing found".
- Collecting images takes longer than the KB text. The copilot says the KB is ready to review while images are still coming in, as today.
- The copilot asks nothing while the build runs. What it needs is asked before the build starts; questions about the result start once the KB has landed.

### 2.3 Walks the review

- When the build lands, the copilot gives a short account of what it found and where it was unsure.
- It asks about what it could not settle, one question at a time, with likely answers as buttons and free text always allowed. Example: the audience age range was inferred, not stated; is 25 to 40 right?
- It asks about the few that matter most: up to five of the inferred or empty fields that scripts rely on hardest, such as audience, tone of voice and compliance rules. *(My call: the number five and which fields rank highest.)* A "keep asking" reply continues through the rest; otherwise they are left to the review on screen.
- An answer fills or corrects the field. The value is marked as coming from the person.
- It tells the person what is left: which sections still have fields to review. It links to them; it does not review them.
- The person reviews on the screen as today. The panel keeps up with what was done by hand and does not ask about a field the person has already settled.
- When every field is reviewed, the copilot shows the gate card: approve the brand KB, which opens market research. The approval is the person's action. *(My call: the gate card carries the same "Mark KB ready" action the page header has, so the person can approve from either place.)*
- Any teammate who can open the client can approve, as today. The thread records who approved the KB and who approved each change card.

### 2.4 Takes additions without wrecking what is approved

This is section 4.5 of the parent spec, applied to the brand KB.

- The person can add a document, an image or a plain statement ("we no longer say 'chemical-free'") at any time, including after the KB is approved.
- A plain statement lives in the thread and in the fields it changed. It is not a source file. *(My call. Reading an arbitrary link is not in piece 2: sources stay the kinds the KB has today.)*
- The copilot reads the new material against the current KB and answers with a **change card**: each field it would change, shown before and after, with where the new value came from.
- Each field on the card can be kept or dropped. Approving the card applies the kept ones. Discarding it applies nothing.
- Applied fields count as approved by the person. Fields the card did not name are untouched, with their reviews and hand edits intact.
- The KB stays approved throughout. Nothing locks.
- An approved card changes the client's one live KB, exactly as a hand edit does today. What is already written in an existing script is not rewritten. The next copilot turn on that script, and anything drawn for it afterwards, reads the new KB. Scripts are not frozen on the KB they started with.
- **A refused change is remembered.** When the person discards a card or drops a field on it, the attached document stays in Source files, and the copilot does not propose that change from that document again unless the document changes.
- If the new material changes nothing, the copilot says so and shows no card.
- If a field on a pending card was edited by hand in the meantime, the card says it is out of date for that field and does not overwrite the hand edit. This is how the script copilot's before-and-after card already behaves.
- A hand edit on the screen applies at once and needs no approval, as today.

### 2.5 Every other way the model changes the KB follows the same rule

- **"Save & Re-analyze" in Source files** no longer rebuilds the KB. It saves the added and removed files, and the copilot answers in the panel with a change card. No review is wiped and the KB stays approved.
- **Removing a source** works the same way: the copilot re-reads what is left and shows a card of the fields the remaining sources no longer support, before and after, to accept or reject.
- **Image Analysis** follows the rule too. When the images are studied again, after a chat attachment, an upload or a refresh from the site and socials, the result is held back and shown as a change card. The section does not change until the person approves. On a KB nobody has reviewed yet, the first study fills the section directly.
- **The "Refine with AI" sparkle button on each field is removed.** A field is changed by typing in it, or by asking in the chat, and a chat change comes back as a change card.
- **Every copilot change gets a card, even to one field.** This differs from the script copilot, which applies a change to a single shot at once.

**The rule behind it:** the copilot never overwrites a field a person has reviewed without a change card. *(My call on the boundary: during the first review, a field nobody has reviewed yet can be updated directly, because there is nothing of the person's to lose. Once a field is approved, edited or rejected, changes to it go through a card, whether or not the whole KB is approved yet.)*

## 3. The thread

- This is the client's **onboarding thread** from the parent spec. There is one per client. Everyone on the team who can open the client sees the same thread. *(My call: shared, like a script's thread.)*
- It is saved. Leaving and coming back shows it where it stopped, with pending cards still pending.
- In piece 2 the thread is shown on the Brand KB page only. Market research and Scripts keep the piece 1 guide until their own pieces. *(My call.)*
- A client that already has an approved KB when this ships starts with an empty thread and a short opening: the KB is approved, and here is how to add to it.
- The panel folds to the rail as in piece 1. The rail shows when the copilot is waiting for the person, including a pending change card.

## 4. Attachments

- The chat input takes files by picking them, dropping them or pasting an image.
- It accepts the same kinds of file, with the same size limits, that the brand KB accepts today.
- An attached document or image becomes a source of the brand KB. It appears in "Source files" exactly as if it had been uploaded there.
- The thread shows what was attached, by name, with a thumbnail for images.
- A file that is too large or of the wrong kind is refused in the chat with the reason and the limit.

## 5. What the panel can say

The five message kinds from the parent spec, section 4.3, all used here: status line, question with reply choices, waiting for you, gate card, change card. Plus plain conversation: the person can ask why a field says what it says, and the copilot answers with the source.

## 6. What the copilot never does

- It never approves the brand KB and never marks it ready.
- It never changes a reviewed field without an approved change card.
- It never proposes a value without saying where it came from: a named document, an image, or the person. If it has no source it asks. *(My call: this covers what comes through the chat from now on. For a field filled by the original build, the copilot can say only what the KB already records, that it was stated or inferred; it does not claim a page or a document it cannot show.)*
- It never starts a paid collection of images from the site or socials again without the person saying so. Refreshing those costs money and is confirmed today; that stays.
- It never sends the person to another screen to supply something it could take in the chat.

## 7. What stays as it is

- The Brand KB screen on the right: its tabs, fields, review states, inline editing, "Approve all", and "Mark KB ready". The one removal is the "Refine with AI" button (section 2.5).
- How the website is read, how documents are read, how images are collected and studied. What changes is what happens to the result on a reviewed KB: it is proposed, not written.
- The rule that every field must be reviewed before the KB can be marked ready, with Image Analysis exempt.
- The Brand assets page and the Source files drawer as places to see and remove sources.

## 8. Success

- A teammate who has never used the tool can take a new client from a website address to an approved brand KB without being told the order of steps.
- During a build the person can always tell what is running and what is finished.
- Adding a document to an approved KB changes only the fields the person approved on the card. No review is lost and nothing locks.
- Closing the tab mid-review and coming back shows the same thread, the same pending question or card.
- The copilot has never approved anything.

## 9. Out of scope

- Market research, scripting, visualise and canvas guidance (pieces 3 to 6).
- Suggesting avatars from the audience section.
- A history of KB versions, or rolling back to one.
- Any change to what the website reader or the image collectors can reach.
- Retiring the old canvas copilot.

## 10. Decided by Cyril on 2026-11-13

No open questions remain for piece 2.

1. An approved change card updates the live KB like a hand edit. Existing scripts are not rewritten and are not frozen on an old KB; their next turn reads the new one.
2. "Save & Re-analyze" answers with a change card and wipes nothing.
3. Image Analysis goes through a change card too.
4. A discarded card leaves the document in Source files, and what was refused is remembered and not proposed again.
5. After a build the copilot asks about the few fields that matter most, not all of them.
6. The "Refine with AI" button is removed. Refinement happens in the chat or by a direct edit.
7. Removing a source produces a change card to accept or reject, like the script copilot's before and after.
8. Any teammate with access to the client may approve. Who approved is recorded.
9. The copilot asks nothing while a build is running.
