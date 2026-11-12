# Copilot journey, piece 2: the brand KB copilot

**Date:** 2026-11-12
**Parent spec:** [2026-11-12-copilot-journey-design.md](2026-11-12-copilot-journey-design.md) (sections 4.2, 4.3, 4.5, 5.1 and build order item 2)
**Mockups:** the "Brand audit" artboard in the Design artifact, https://claude.ai/artifact/VP7fUPMcBEbvyt1mKHwe4C
**Status:** draft for Cyril's review. Lines marked *(my call)* were not decided by Cyril and can be overruled.

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

### 2.3 Walks the review

- When the build lands, the copilot gives a short account of what it found and where it was unsure.
- It asks about what it could not settle, one question at a time, with likely answers as buttons and free text always allowed. Example: the audience age range was inferred, not stated; is 25 to 40 right?
- An answer fills or corrects the field. The value is marked as coming from the person.
- It tells the person what is left: which sections still have fields to review. It links to them; it does not review them.
- The person reviews on the screen as today. The panel keeps up with what was done by hand and does not ask about a field the person has already settled.
- When every field is reviewed, the copilot shows the gate card: approve the brand KB, which opens market research. The approval is the person's action. *(My call: the gate card carries the same "Mark KB ready" action the page header has, so the person can approve from either place.)*

### 2.4 Takes additions without wrecking what is approved

This is section 4.5 of the parent spec, applied to the brand KB.

- The person can add a document, an image or a plain statement ("we no longer say 'chemical-free'") at any time, including after the KB is approved.
- A plain statement lives in the thread and in the fields it changed. It is not a source file. *(My call. Reading an arbitrary link is not in piece 2: sources stay the kinds the KB has today.)*
- The copilot reads the new material against the current KB and answers with a **change card**: each field it would change, shown before and after, with where the new value came from.
- Each field on the card can be kept or dropped. Approving the card applies the kept ones. Discarding it applies nothing.
- Applied fields count as approved by the person. Fields the card did not name are untouched, with their reviews and hand edits intact.
- The KB stays approved throughout. Nothing locks. Scripts keep working from the approved KB, and scripts started after the card is approved use the new one.
- If the new material changes nothing, the copilot says so and shows no card.
- If a field on a pending card was edited by hand in the meantime, the card says it is out of date for that field and does not overwrite the hand edit. This is how the script copilot's before-and-after card already behaves.
- A hand edit on the screen applies at once and needs no approval, as today.

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

- The Brand KB screen on the right: its tabs, fields, review states, inline editing, "Approve all", and "Mark KB ready".
- How the website is read, how documents are read, how images are collected and studied.
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

## 10. Open questions for Cyril

These change what gets built. They are not decided.

1. **"Save & Re-analyze" in the Source files drawer.** It is started by hand but the rebuild is done by the model, and today it wipes reviews. Under "only copilot changes need approval", should it now produce a change card in the chat instead of rebuilding? If not, the destructive path stays one click away.
2. **"Refine with AI" on a single field.** Today it rewrites the field at once. Should it show a before and after first, or stay as it is because the person asked for that one field?
3. **Removing a source from an approved KB.** Should the copilot propose removing what came from that source, as a change card, or leave the KB alone?
4. **Who may approve the brand KB.** Still open from the parent spec (question 2): any teammate, or a named role?
5. **Mid-build questions.** May the copilot ask a question while the build is still running (for example about socials), or only once the KB has landed?
6. **What "existing scripts are not touched" means.** Today every script reads the client's one live KB each time the copilot works on it, so a hand edit to the KB already reaches existing scripts on their next turn. Does an approved change card behave the same way (what is already written in a script is not rewritten, but its next turn reads the new KB)? Or must a script stay on the KB as it was when the script started, which hand edits do not do today?
7. **Image Analysis.** Adding an image today re-studies the images and rewrites the Image Analysis section with no approval, and can put an approved field there back to "needs review". Is Image Analysis exempt from the change-card rule, as it already is from the "every field reviewed" rule, or must it go through a card too?
8. **A discarded card.** When the person discards a card, does the attached document stay in Source files? If it stays, a later rebuild reads it again.
9. **How many questions.** The build marks fields as inferred or leaves them empty; a new KB can have a dozen or more. Does the copilot ask about all of them, or only the few that matter most and leave the rest to the review on screen?
