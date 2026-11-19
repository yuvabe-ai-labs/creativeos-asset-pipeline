# The Brand KB page follows the copilot

**Status:** draft for Cyril's review, 2026-11-19.
**Part of:** the copilot journey, brand KB (`2026-11-12-copilot-journey-brand-kb-design.md` §2.3, the review walk). Built on the same branch.

## 1. Problem

The copilot asks about one field at a time ("Visual Identity · Lighting: I could not find this in the sources. What should it be?"), but the page on the right does not move. The person has to find the tab and the field themselves to see what is being asked, and when they answer, the value changes somewhere they may not be looking. The panel and the page feel like two separate tools. Cyril, 2026-11-19: "the idea is that you communicate to the user that I am editing this."

## 2. What it does

### 2.1 The page goes to the field being asked about

When the copilot asks about a field, the page on the right:
- switches to that field's tab;
- scrolls the field into view;
- marks the field as the one being asked about, quietly: a soft tint and a small "Copilot is asking" label. The mark stays while the question is waiting and goes once it is answered, skipped, or no longer waiting.

### 2.2 A field shimmers while the copilot writes it

When the copilot is saving a value into a field (an answer, a confirm, "There is none"), the field shimmers while "Saving your answer…" shows in the panel. When the save lands, the new value appears with a short highlight that fades. This holds for any field the copilot writes in a turn, not only the one it asked about: if the person gives the age range while being asked about something else, the page goes to Age Range and shimmers it there.

### 2.3 It always follows

Cyril decided 2026-11-19: the page always follows the copilot, including when the person is on another tab or has unsaved changes. Following only moves the view: unsaved changes on the page are kept as they are. Skipping a question moves the page to the next question's field, like any new question.

### 2.4 The chat answer wins over an unsaved edit of the same field

Cyril decided 2026-11-19. When the copilot writes a field that has an unsaved edit on the page, the field shows the copilot's saved answer, with the shimmer and the "landed" highlight; the unsaved edit of that one field is replaced, and pressing Save afterwards never writes it back over the answer. Unsaved edits of every other field are kept. This also holds while the person is typing in that very field. It settles the open part-2 question "a chat answer against an unsaved edit", which today keeps the page's draft and overwrites the chat answer on Save.

## 3. Calls I made (Claude), for Cyril to check

- **The mark is for everyone; moving is for the person chatting.** The "Copilot is asking" mark reflects what the thread is waiting on, so everyone looking at the client sees it. The page *moves* (tab and scroll) only in the browser that sent the turn, and when the review screen first appears: on opening the page, and when a build lands and the walk's first question arrives. A teammate's conversation never moves anyone else's view.
- **Moving happens when the field changes.** The page moves when the copilot asks about a different field, or writes one. When the walk asks the same question again after the person talked about something else, the page stays where it is and the mark stays on the field.
- **No navigating between pages.** When the person answers from the panel on another page (client home, Avatars, Brand assets), they are not taken to Brand KB. When they next open it, it lands on the waiting field.
- **Approving a change card** (D505) does not move the page. The person pressed a button in the panel about fields the card already lists; the changed fields get the short "landed" highlight if they are on screen.
- **The look:** the shimmer is a calm sweep across the field, not the loud brand-coloured shimmer the copilot's working line uses. Motion follows the design system (the house easing, no bounce) and is switched off for people who ask for reduced motion: they still get the tint and the label.
- **Image Analysis fields** are never asked about by the walk, so they are never followed.

## 4. Goals, non-goals, anti-goals

**Goals**
- The person always sees the field the copilot is talking about, without looking for it.
- The person sees their answer land in the field.

**Non-goals**
- Following on other pages (market research, scripts). Each stage gets its own when it is built.
- Showing the copilot's activity to teammates.
- Changing how fields are edited or saved.

**Anti-goals: it fails if...**
- An unsaved change on the page is lost or overwritten because the page followed. (The one exception is §2.4: the field the copilot itself just wrote.)
- A chat answer is silently overwritten by an older draft when the person later presses Save.
- The page jumps when the copilot did nothing to a field (a plain chat reply, a question about the KB).
- The page becomes slower: the panel's regular check for new messages makes no extra request for this.

## 5. Constraints

- AGENTS.md design rules: purple used sparingly, the house easing only, shadcn primitives only.
- AGENTS.md performance rules: no new request per field, no new polling.

## 6. Left to the builder

How the panel tells the page which field to show, how the field is found and scrolled to, the exact tint, label and shimmer, and timings within the design system's 200/320/500 ms steps.

## 7. Success

Cyril answers five questions in a row on Propalyst without touching the page. Each time, the page is already on the right tab with the field in view and marked; each answer visibly lands in the field; the marker moves to the next field.
