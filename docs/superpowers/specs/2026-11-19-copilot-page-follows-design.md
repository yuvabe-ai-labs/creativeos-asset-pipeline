# The page shows the copilot's work: a principle, first applied to the brand KB

**Status:** approved in conversation by Cyril, 2026-11-19 (principle chosen as option A: general now). Plan: `docs/superpowers/plans/2026-11-19-copilot-page-follows.md`.
**Part of:** the copilot journey (`2026-11-12-copilot-journey-design.md`). Built on the same branch.

## 1. Problem

The copilot works in the panel on the left; what it changes lives on the page on the right. Today the two act like separate tools. When the copilot asks about a field ("Visual Identity · Lighting: I could not find this in the sources. What should it be?"), the page does not move: the person has to find the tab and the field. When the copilot saves an answer, the value changes somewhere the person may not be looking. Cyril, 2026-11-19: "the idea is that you communicate to the user that I am editing this", and then: "this is a general principle: whenever something happens on the left it needs to be shown on the right."

## 2. The principle

**Whatever the copilot changes on the page, the page shows it happening.** The page goes to what the copilot is working on, marks it, shows the change being made, and shows it land.

This holds for every stage's copilot, as streaming does (D502). Each stage's page says which of its things the copilot can work on (its *targets*: a field, a source, later a market signal, a script beat, a canvas node). One shared way of following, marking and showing changes serves every page, so a new stage adds its targets instead of building its own.

The four things a person sees:
1. **Go there.** The page brings the target into view: switching tab, scrolling, whatever the page needs.
2. **Asking.** A target the copilot is asking about carries a quiet mark: a soft tint and the label "Copilot is asking". It stays while the question waits.
3. **Working.** While the copilot is changing a target, it shimmers.
4. **Landed.** When the change is stored, the new value appears with a short highlight that fades.

## 3. Rules that hold everywhere

### 3.1 It always follows
Cyril decided 2026-11-19: the page follows the copilot even when the person is on another tab or has unsaved changes. Following only moves the view; unsaved changes are kept (with the one exception in §3.2).

### 3.2 The copilot's change wins over an unsaved edit of the same thing
Cyril decided 2026-11-19. When the copilot changes something the person has edited on the page and not saved, the page shows the copilot's stored change, with the working and landed signals; the person's unsaved edit of that one thing is replaced, and saving afterwards never writes it back over the change. Unsaved edits of everything else are kept. This holds while the person is typing in that very field. (It settles the earlier open question "a chat answer against an unsaved edit".)

### 3.3 Calls I made (Claude), approved with the spec
- **The marks are for everyone; moving is for the person chatting.** "Copilot is asking" reflects what the thread waits on, so everyone looking at the client sees it. The page *moves* only in the browser that sent the turn, and when a page first shows something the copilot is asking about (opening the page, a build landing with its first question). A teammate's conversation never moves anyone else's view.
- **Moving happens when the target changes.** When the copilot asks the same question again after the person talked about something else, the page stays where it is and the mark stays.
- **No navigating between pages.** Answering from the panel on another page does not take the person anywhere; the target page lands on what is waiting when they next open it.
- **A person's own approval does not move the page.** Approving a change card (D505) gives the changed fields the landed highlight where they are on screen, without moving.
- **Motion:** a calm sweep for "working", not the loud brand-coloured shimmer of the copilot's working line. The house easing only; for people who ask for reduced motion, no shimmer and no animated scroll, but the tint, label and highlight stay.
- **Something the page cannot show** (a target not on this page, or hidden in a closed drawer) is skipped silently: no move, no error. The Source files drawer is not opened for the copilot.

## 4. First application: the brand KB

What the brand KB copilot changes today, and what the person sees:

| The copilot… | The page… |
|---|---|
| asks about a review field (the walk) | goes to its tab, scrolls to it, marks it "Copilot is asking" |
| writes a review field (an answer, "Yes, that's right", "There is none", a field the person answers unprompted) | goes there, shimmers it, the answer lands |
| saves the website or a social handle, before a build | brings that form field into view, shimmers it, the value lands |
| saves a file attached in the chat as a source | the new file appears in the form's source list with the landed highlight |
| has a change card approved by the person | the changed fields on screen get the landed highlight, no move |

The pre-build questions ("What is the brand's website?") are written by the model, not by code, so they carry no "Copilot is asking" mark: only the review walk's questions name their field.

## 5. Goals, non-goals, anti-goals

**Goals**
- The person always sees what the copilot is talking about and what it changed, without looking for it.
- A new stage gets this by naming its targets, not by building it again.

**Non-goals (this piece)**
- The other stages' targets (market research, scripts, visualise, canvas): each adds its own when it is built.
- Showing a teammate's copilot activity beyond the shared "asking" mark.
- Changing how anything is edited or saved, apart from §3.2.

**Anti-goals: it fails if...**
- An unsaved change of something the copilot did not touch is lost.
- A change the copilot made is later overwritten by an older draft on Save.
- The page jumps when the copilot changed nothing (a plain reply, a question about the KB).
- A shimmer keeps running after the turn ended, whatever happened.
- The page becomes slower: no new request and no new polling.

## 6. Constraints

- AGENTS.md design rules: purple used sparingly, the house easing only, shadcn primitives only.
- AGENTS.md performance rules: nothing per item makes a request; the page reads what the panel already loaded.
- The principle is written into AGENTS.md beside the streaming rule, and recorded as an ADR.

## 7. Left to the builder

How targets are named and found, how the panel tells the page, how a page brings a target into view, and the exact tint, label, sweep and timings within the design system's 200/320/500 ms steps.

## 8. Success

On Propalyst: Cyril answers five review questions in a row without touching the page; each time the page is already on the field, marked, and each answer visibly lands. On a new client, he sends the website and an Instagram handle in the chat and attaches a PDF: each one visibly lands in the form, and the PDF appears in the source list highlighted.
