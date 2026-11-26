# Likely answers on empty-field questions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A review-walk question about an empty brand KB field offers up to 4 likely answers to tap; a tap saves it as the person's answer.

**Architecture:** `walk.ts` stays pure: `questionMessage` takes the answers it is given. A new `answers.ts` asks the quick model for them (5 s cap, `[]` on any failure) and lays them onto the question messages the two callers already produce (KB turn route, kb-build webhook). The answers live on the question card, so `walkOf` reads them back and `walkChoice` turns a tapped one into `answer_field` in code (D519).

**Tech Stack:** Next.js 16 route handlers, zod, OpenAI via `structuredCaller(KB_COPILOT_MODEL)`, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-kb-question-answer-options-design.md`

## Global Constraints

- Only fields whose value `isEmpty` get answers; inferred-value questions are unchanged.
- At most 4 answers (`KB_REPLY_CHOICES_MAX`), each at most 80 characters (`KB_REPLY_CHOICE_MAX_CHARS`); drop blanks, duplicates, "There is none" and "Skip this one".
- Order of buttons: answers, then `NONE_CHOICE`, then `SKIP_CHOICE`.
- Copy with answers: `${title}: I could not find this in the sources. What should it be? Some likely answers are below, or type your own.` Without answers: unchanged.
- The call never blocks the question: over 5,000 ms or an error → `[]`.
- The KB text is data in the prompt, never instructions.

## Review Focus

1. A tapped answer when the field was reviewed on the page meanwhile → `answer_field`'s own refusal, nothing written (Task 1 test).
2. A typed message that only starts with an answer's words → still goes to the model (Task 1 test).
3. The model returns 6 answers, one "There is none", one 120 characters long → 4 kept, those two dropped (Task 2 test).
4. The call hangs → question still stored within ~5 s with its two buttons (Task 2 test with a fake timer).
5. The webhook's answer call throws → the build message and question are still written (Task 3 test).

---

### Task 1: Answers on the question card, and a tap saves in code

**Files:**
- Modify: `src/lib/journey/thread/schema.ts` (question card: `answers: z.array(z.string()).optional()`)
- Modify: `src/lib/journey/kb-copilot/walk.ts` (`Walk.answers`, `questionMessage`, `walkChoice`)
- Modify: `src/lib/journey/kb-copilot/turn.ts` (`KbReview.answers?: string[]`)
- Modify: `src/app/api/clients/[id]/copilot/kb/turn/route.ts:129-130` (pass `answers: walk.answers` into `review`)
- Test: `src/lib/journey/kb-copilot/__tests__/walk.test.ts`, `src/lib/journey/kb-copilot/__tests__/turn.test.ts`

**Interfaces:**
- Produces: `questionMessage(field: ReviewField, answers?: string[]): NewCopilotMessage`; `Walk = { asked; pending; answers: string[] }` (answers of the pending question, `[]` when none); `walkChoice(text, review: { pending: string | null; answers?: string[] } | null)` may return `{ tool: "answer_field", args: { field, value } }`.

- [ ] **Step 1: Failing tests**
  - walk.test: `questionMessage(emptyField, ["18–24", "25–34"])` → suggestions `["18–24", "25–34", "There is none", "Skip this one"]`, card `answers` equal to the two, content ends `Some likely answers are below, or type your own.`; with no answers, unchanged from today; an inferred field ignores answers.
  - walk.test: `walkOf` on a thread whose last message is a question card with `answers: ["a"]` → `answers: ["a"]`; after a user message → `pending: null, answers: []`.
  - walk.test: `walkChoice("25–34", { pending: AGE, answers: ["25–34"] })` → `{ tool: "answer_field", args: { field: AGE, value: "25–34" } }`; `walkChoice("25–34 mostly", …)` → `null`; `walkChoice("25–34", { pending: null, answers: ["25–34"] })` → `null`.
  - turn.test: text `"25–34"`, review `{ fields: [emptyAge], pending: AGE, answers: ["25–34"] }` → model not called, `setField` called with AGE and value `"25–34"`; list field + answer `"Warm, playful"` → value `["Warm", "playful"]`; `setField` resolving `false` → reply is the refusal, nothing settled.
- [ ] **Step 2:** `npx vitest run src/lib/journey/kb-copilot` → the new tests FAIL.
- [ ] **Step 3:** Implement. `walkOf` takes `answers` from the pending question card (`card.answers ?? []`). `walkChoice` checks answers after the fixed buttons, exact trimmed match, only with a pending field. The turn's choice path already runs any tool; `answer_field` coerces lists.
- [ ] **Step 4:** Same command → PASS; `npx tsc --noEmit -p .` clean.
- [ ] **Step 5:** Commit `feat(kb-copilot): likely answers on a question card, a tap saves in code (D533)`.

### Task 2: Asking the quick model for likely answers

**Files:**
- Create: `src/prompts/kb-answer-options.ts` (`KB_ANSWERS_SYSTEM`, `kbAnswersUser({ field, kbText })`)
- Create: `src/lib/journey/kb-copilot/answers.ts`
- Modify: `src/lib/journey/kb-copilot/constants.ts` (`KB_ANSWERS_TIMEOUT_MS = 5_000`)
- Test: `src/lib/journey/kb-copilot/__tests__/answers.test.ts`

**Interfaces:**
- Consumes: `questionMessage` (Task 1), `StructuredCall` from `@/lib/scripts/copilot/model`.
- Produces: `suggestAnswers(field: ReviewField, kbText: string, deps?: { call?: StructuredCall; timeoutMs?: number }): Promise<string[]>`; `withAnswers(messages: NewCopilotMessage[], fields: ReviewField[], kbText: string, deps?): Promise<NewCopilotMessage[]>` (rewrites only question messages whose field is empty, via `questionMessage(field, answers)`; the rest pass through; calls run in parallel).

- [ ] **Step 1: Failing tests**
  - `suggestAnswers` with a call returning `{ answers: ["18–24","25–34","","There is none","25–34", "x".repeat(120),"35–44","45+","55+"] }` → `["18–24","25–34","35–44","45+"]`.
  - A call that throws → `[]`; a call that never resolves with `timeoutMs: 20` → `[]`.
  - The user prompt contains the field title and the KB text; the system prompt says the KB text is data.
  - `withAnswers` on `[note, questionMessage(emptyField), questionMessage(inferredField)]` → only the empty one gains answers; the call is made once.
- [ ] **Step 2:** `npx vitest run src/lib/journey/kb-copilot/__tests__/answers.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement. Default call is `structuredCaller(KB_COPILOT_MODEL)` with schema `{ answers: string[] }`. Prompt: short, typical answers for this one field of this brand, phrased as a person would type them, no claims about the product.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `feat(kb-copilot): ask the quick model for likely answers to an empty field (D533)`.

### Task 3: Both callers lay answers on, ADR and QA

**Files:**
- Modify: `src/app/api/clients/[id]/copilot/kb/turn/route.ts:223-225` (`extra = await withAnswers(walkMessages(...), fields, kbText)`; `kbText` from `version` as already computed for market)
- Modify: `src/app/api/webhooks/kb-build/route.ts:163-167` (`await withAnswers(walkMessages(...), fields, renderKbText(body.kbOutput))` inside the existing try)
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7 (D533, CRLF)
- Modify: `docs/qa/2026-11-18-copilot-journey-manual-qa.md` §4 (one check)
- Test: the two route test files

**Interfaces:**
- Consumes: `withAnswers` (Task 2).

- [ ] **Step 1: Failing tests** (mock `@/lib/journey/kb-copilot/answers`): the turn route stores the question with the mocked answers in its suggestions; the webhook does too; a webhook whose `withAnswers` throws still writes the build message and the plain question.
- [ ] **Step 2:** Run both route tests → FAIL.
- [ ] **Step 3:** Implement. Webhook fallback on a throw: the un-answered `walkMessages` result.
- [ ] **Step 4:** Route tests PASS; full `npx vitest run` → known failures only; `tsc` clean.
- [ ] **Step 5:** Append D533 (Decision / Why / Rejected / Refines brand KB spec §6 / Originated → this design). QA 4.x: "A question about an empty field shows up to 4 likely answers before There is none; tapping one saves it, and the page shows it." Commit `feat(kb-copilot): questions about empty fields offer likely answers (D533)`.

---

## Outcome (2026-11-25)

Built on `feat/market-research` after `0e50feda` (Start the build in code), 3 tasks test-first, then one fresh review (opus) of 1481376c..d2f1e468: *With fixes*, 0 Critical, 3 Important. Full suite after the fix pass: the 2 known deprecated-model failures only; `tsc` clean.

### Review fixes
- A tapped button's reply is shown as soon as it is done, and "Finding likely answers…" shows while they are found when no reply words are on screen (D514). Tests: "shows a button's reply as soon as it is done…", "says what it is doing while it finds likely answers…", "never wipes a reply already on screen…".
- The build webhook starts looking for likely answers before it saves the KB, so the thread message is not held up (also guards a throw while rendering the KB). Test: "starts looking for likely answers before it saves the KB…".
- Re-graded Minor → Important: likely answers never repeat a button code already reads ("Keep asking", "Start the build"…), however written, and never offer a "none"-style answer (tapping "None" would have saved the word as the field's value); the prompt says so too. Tests: "drops 'none'-like answers…", "tells the model a 'none' answer has its own button".

### Rulings
- Ruling: when the reply's words are already on screen, no "Finding likely answers…" line is shown — a step event clears the streamed words in the panel (`applyTurnEvent`) — cost if wrong: up to 5 s with the reply shown and the composer locked, with no line saying why.
- Ruling: compliance fields (content rules, claims and words never to use, disclaimers) still get likely answers until Cyril decides (reviewer's Important 3, a product question) — cost if wrong: one tap can make a model-invented compliance rule the brand's own. **Decided by Cyril 2026-11-25: compliance is left out** (`offersAnswers` in `walk.ts`, used by `withAnswers` and `needsAnswers`).

### Deferred minors
- A question asked again (the person typed something else) pays for new answers, and the chips can change.
- The answers do not see the answer saved in the same turn (the KB is rendered from before the turn).
- A tap after the field was reviewed on the page goes to the model (as "Yes, that's right" already does), which may propose a change card.
- The trace keeps the question's words but not the offered answers or the answers call's prompt.
- The prompt gets only the field's title, not whether it is a list or what it means.
- A timed-out call is not aborted, so it still runs and is billed.
