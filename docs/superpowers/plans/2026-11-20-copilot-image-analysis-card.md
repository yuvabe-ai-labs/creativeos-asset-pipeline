# Image Analysis through a change card (piece 2b): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A study of the client's images never changes an Image Analysis field a person has reviewed: it proposes the change on the existing change card in the copilot thread, and still updates unreviewed and counted fields directly.

**Architecture:** The study's write step splits its result with one pure function: what it may write (the section to store) and what it proposes (reviewed written fields that would change). The proposals become an ordinary change card (D505) in the client's onboarding thread, built by the existing `buildChangeCard` given the Image Analysis fields. A study that wrote first marks any earlier, still-pending image-study card out of date, and leaves out values a person already turned down for that field. Approving goes through the existing route unchanged (`isPatchablePath` already accepts `image_analysis.*`); the panel then refreshes the Image Analysis tab's own read so the tab shows the approved value at once.

**Tech Stack:** TypeScript, Vitest, Supabase (service-role client), Trigger.dev background run (`src/lib/image-analysis/run.ts`), TanStack Query v5.

**Spec:** `docs/superpowers/specs/2026-11-20-copilot-image-analysis-card-design.md`

## Global Constraints

- Counted fields (`TALLIED_FIELDS`: `content_mix`, `purpose_mix`, `dominant_colors`) are never put on a card; they keep a review as their numbers move.
- A field with status `edited` is never changed and never proposed.
- A reviewed field is `approved` or `rejected`. "Says something different" is `!sameValue(before.value, after.value)` (`src/lib/kb/changes/card.ts`).
- Card source text, exact: `Image study`. `docId` is `null`.
- Card message words, exact: `The new images read differently for a field you reviewed. Nothing changes until you approve.` (one field) / `The new images read differently for N fields you reviewed. Nothing changes until you approve.` (N > 1).
- Footer of an image-study card marked out of date, exact: `The images were studied again after this was proposed, so it no longer applies.`
- The thread line `Studied the images again. Changed: …` names only fields changed directly.
- A study never fails, and never reports failure, because the thread could not be written: best effort, logged (`[image-analysis] could not write the change card`).
- No migration. No new request from the page; no polling added.

## Review Focus

1. **Two studies in a row, the first card unanswered.** Expected: the first card is out of date with the image-study footer; only the second can be approved. Test in Task 3.
2. **A discarded value comes back in the next study.** Expected: no card for it. A different value: a card. Tests in Task 2.
3. **A field approved by hand between the study reading the KB and writing.** Expected: the study re-reads the active version before splitting (it already does), so the field is treated as reviewed. Test in Task 3.
4. **A study with nothing to propose after an earlier card.** Expected: the earlier card is still marked out of date (the study now agrees with what is approved, or wrote a newer reading). Test in Task 3.
5. **The thread cannot be written** (no thread yet is fine: `ensureOpening`; an insert error). Expected: the section is still stored, the job succeeds, one log line. Test in Task 3.

---

### Task 1: Split a study's result into what is written and what is proposed

**Files:** Modify `src/lib/image-analysis/merge.ts`; Test `src/lib/image-analysis/merge.test.ts`

**Interfaces:**
- Produces:

```ts
/** What a finished study may write, and what it must propose instead (piece 2b). Pure. */
export function studyImageAnalysis(
  reviewed: ImageAnalysis | null | undefined, next: ImageAnalysis,
): { section: ImageAnalysis; proposals: { key: keyof ImageAnalysis; value: unknown }[] };
```

Rules, field by field (`before` = reviewed, `after` = next): no `before` or `before.value === null` → `after`. `edited` → `before`. `approved`/`rejected` and (`TALLIED_FIELDS.has(key)` or same value) → `{ ...after, status: before.status }`. `approved`/`rejected`, written field, different value → **`before` kept, and a proposal `{ key, value: after.value }`**. Otherwise → `after`. `mergeImageAnalysis` is left as it is: the review screen still uses it to take a stored section into its draft.

- [ ] **Step 1: Write the failing tests**

```ts
it("keeps an approved written field the study reads differently, and proposes the new reading", …)
  // reviewed.aesthetic { value: "Earthy", status: "approved" }, next.aesthetic value "Bold" → section.aesthetic.value "Earthy", status "approved"; proposals [{ key: "aesthetic", value: "Bold" }]
it("does the same for a rejected field", …)
it("updates an unreviewed field and proposes nothing", …)
it("keeps a counted field's review as its numbers move, and proposes nothing", …)   // dominant_colors approved, new list
it("leaves a hand-written field alone and proposes nothing", …)                      // status "edited"
it("proposes nothing when the study says the same", …)
it("writes the study as it is when nothing was reviewed before", …)                 // reviewed null → section === next, proposals []
```

- [ ] **Step 2: Run them to see them fail.** `npx vitest run src/lib/image-analysis/merge.test.ts` Expected: FAIL (`studyImageAnalysis` is not a function).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to see them pass.** Same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(image-analysis): a study keeps reviewed fields and proposes what it would change`

---

### Task 2: A change card for Image Analysis fields

**Files:** Modify `src/lib/kb/changes/card.ts`, `src/lib/kb/changes/copy.ts`; Test `src/lib/kb/changes/__tests__/card.test.ts`, `src/lib/kb/changes/__tests__/copy.test.ts`

**Interfaces:**
- Consumes: Task 1's proposals (`{ key, value }`).
- Produces:

```ts
// card.ts
export const IMAGE_STUDY_FROM = "Image study";
/** A card every field of which is an Image Analysis field: one a study made. */
export function isImageStudyCard(card: ChangeCard): boolean;
/** The values a person turned down per Image Analysis path: every field of a discarded image-study
 *  card, and each field dropped from an applied one (not one left because it was changed by hand). */
export function refusedImageValues(cards: ChangeCard[]): Map<string, unknown[]>;
/** A pending card from a study's proposals, or null: a value equal to what is stored, and a value
 *  turned down before for that field, are left out. */
export function buildImageStudyCard(input: {
  versionId: string; current: TraceableBrandKB;
  proposals: { key: string; value: unknown }[]; settled: ChangeCard[];
}): ChangeCard | null;
// copy.ts
export const imageStudyCopy: { card: (fields: number) => string; superseded: string };
```

`buildImageStudyCard` builds each field as `{ path: "image_analysis.<key>", label: "Image Analysis · <FIELD_LABELS[key] ?? key>", before: stored value, after, from: IMAGE_STUDY_FROM, docId: null }`. `settledLine` in `copy.ts` returns `imageStudyCopy.superseded` for a `stale` card when `isImageStudyCard(card)`, and its existing line otherwise. `buildChangeCard`, `decideChange`, `refusedKeys` are unchanged.

- [ ] **Step 1: Write the failing tests**

```ts
// card.test.ts
it("makes a card from a study's proposals, sourced to the image study", …)        // path "image_analysis.aesthetic", label "Image Analysis · Aesthetic", from "Image study", docId null, status "pending"
it("leaves out a value equal to what is stored, and makes no card when nothing is left", …)
it("leaves out a value the person discarded for that field", …)                   // Review Focus 2: settled discarded card with after "Bold" → proposing "Bold" again → null
it("proposes again when the study reads something different from what was discarded", …)   // "Minimal" → card
it("remembers a field dropped from an approved card, not one kept or left as changed by hand", …)
it("isImageStudyCard: true only when every field is an Image Analysis field", …)
it("an approved image-study card is applied by decideChange like any other", …)   // patches path ["image_analysis","aesthetic"], status "approved"
// copy.test.ts
it("words the study's card for one field and for several", …)                     // exact strings from Global Constraints
it("says an out-of-date image-study card was overtaken by a newer study", …)      // settledLine(stale image card) === the exact footer; a stale document card keeps its line
```

- [ ] **Step 2: Fail.** `npx vitest run src/lib/kb/changes`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Pass.** Same command.
- [ ] **Step 5: Commit** `feat(kb): a change card for what an image study would change`

---

### Task 3: The study proposes instead of overwriting

**Files:** Modify `src/lib/image-analysis/run.ts`, `src/lib/db/copilot-messages.ts`, `src/lib/image-analysis/change-note.ts` (its header comment only); Test `src/lib/image-analysis/run.test.ts`, `src/lib/db/__tests__/copilot-messages.test.ts`

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces:

```ts
// db/copilot-messages.ts
/** Every change card of the client's onboarding thread still waiting for a decision, with its message id. */
export async function listPendingChangeCards(clientId: string): Promise<{ id: string; card: ChangeCard }[]>;
```

`run.ts`, in the write step: replace `mergeImageAnalysis(reviewed, …)` with `studyImageAnalysis(reviewed, …)`; store `section`; keep the last iteration's `proposals` and the version they were made against (`active`). `changed` labels come from `changedImageFields(reviewed, section)` as today (so they are only the direct changes). After the loop, when the run wrote (`result.written`), in one best-effort block (own try/catch, the log line in Global Constraints):
1. read `listPendingChangeCards` and `listSettledChangeCards` in parallel;
2. for each pending card with `isImageStudyCard`, `claimChangeCard(clientId, id, { ...card, status: "stale" })`;
3. `buildImageStudyCard({ versionId, current: the active KB with `image_analysis: section`, proposals, settled })`; when it returns a card, `ensureOpening(client)` then `insertCopilotMessages(clientId, ONBOARDING, null, [{ role: "assistant", content: imageStudyCopy.card(card.fields.length), card, suggestions: [] }])`.
`sayWhatChanged` stays before it, unchanged.

- [ ] **Step 1: Write the failing tests** (in `run.test.ts`, with its existing mocks, adding `listPendingChangeCards`, `listSettledChangeCards`, `claimChangeCard`, `insertCopilotMessages` to the copilot-messages mock)

```ts
it("stores a reviewed field as it was and puts the new reading on a card", …)
  // active KB aesthetic approved "Earthy"; summary says "Bold" → setKBImageAnalysis section.aesthetic.value "Earthy";
  // insertCopilotMessages called with a card whose fields[0] { path: "image_analysis.aesthetic", before: "Earthy", after: "Bold" } and the one-field words
it("names only the fields it changed directly in the thread line", …)             // an unreviewed field changed + a proposed one → note lists only the unreviewed one
it("marks an earlier unanswered image-study card out of date, and leaves a document card alone", …)   // Review Focus 1
it("marks the earlier card out of date even when it has nothing new to propose", …)                   // Review Focus 4
it("treats a field approved while the summary was being written as reviewed", …)                      // Review Focus 3: getActiveKBVersion's second read returns it approved
it("still stores the section and succeeds when the card cannot be written", …)                        // Review Focus 5: insertCopilotMessages rejects → succeedJob called, console.error with the log line
it("writes no card and touches no thread when the run wrote nothing", …)
// copilot-messages.test.ts
it("lists the pending change cards of the onboarding thread with their ids", …)   // filters client_id, thread, card->>kind "change", card->>status "pending"
```

- [ ] **Step 2: Fail.** `npx vitest run src/lib/image-analysis/run.test.ts src/lib/db/__tests__/copilot-messages.test.ts`
- [ ] **Step 3: Implement.** Update `change-note.ts`'s header comment: the section is no longer written whole; the note names what was changed directly.
- [ ] **Step 4: Pass, type-check.** Same command; `npx tsc --noEmit` (only the known image-generate error).
- [ ] **Step 5: Commit** `feat(image-analysis): a study proposes changes to reviewed fields on a change card`

---

### Task 4: The tab shows an approved card at once; records

**Files:**
- Modify: `src/hooks/queries/copilot-thread.ts` (`useDecideChange` `onSuccess`: `queryClient.invalidateQueries({ queryKey: imageAnalysisKeys.status(clientId) })`, since the Image Analysis tab reads the section through that query, not through the page re-read)
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (CRLF): append the next free ADR (check the log's last number; D510 expected): decision, why, rejected (approach B; cards for counted fields; proposing over hand-written fields).
- Modify: `docs/qa/2026-11-18-copilot-journey-manual-qa.md`: rewrite check 6.26 and add the checks below to section 6.
- Modify: the spec's Status line (built), `2026-11-12-copilot-journey-brand-kb-design.md` line 70 (the exception is now closed, pointing to this spec), this plan (Outcome after the review).

QA checks (Do / Expected), *(approved client whose Image Analysis has an approved Photography or Aesthetic field)*:
1. Upload several different-looking images. When the study finishes: the approved field on the Image Analysis tab still says what was approved; a card in the thread shows it before and after, from "Image study".
2. Approve the card. The tab shows the new value, approved, without a reload.
3. Upload more images so a card appears, do not answer it, then upload again. The first card says the images were studied again and no longer applies; only the newest can be approved.
4. Discard a card. Upload one more similar image. No card comes back for the same reading.
5. Rewrite an Image Analysis field by hand and save. Upload different-looking images. That field is not on any card and keeps your words.
6. On a new client in first review, with nothing reviewed on the tab: uploads still fill Image Analysis in directly, with no card.
7. Check the counted fields (format mix, purpose mix, colours) after an upload: their numbers move, their review stays, and they are never on a card.

- [ ] **Step 1: Implement the invalidation** (no unit test: it is one line of cache wiring, covered by QA check 2).
- [ ] **Step 2: Type-check, lint, full suite.** `npx tsc --noEmit`; `npx eslint src/hooks/queries src/lib/image-analysis src/lib/kb/changes`; `npx vitest run` (only the two known image-generate failures).
- [ ] **Step 3: Write the documents.**
- [ ] **Step 4: Commit** `docs(copilot): Image Analysis through a change card (ADR, QA)`

---

## Outcome (2026-11-20)

**Built** on `feat/copilot-journey`, commits `8d737f0`..`5983a0a` plus the fix pass, inline execution, test first. One independent whole-branch review (most capable model): no critical findings, two important, ten minor; verdict "with fixes". Full suite: 5,898 pass, only the two known image-generate failures. No migration.

**Departures from the plan (rulings):**
- `buildImageStudyCard` is its own builder rather than `buildChangeCard` with extra fields: `buildChangeCard` is tied to the 43 review fields.
- The study writes its card through `getClientById` + `ensureOpening`, so a client with no thread yet still gets the card.
- The pending-cards db test is its own file.

**Fixed after the review:**
- An earlier study's waiting card is now retired **before** the new study writes the section (each pass), not after: the older reading could be approved in between.
- The new card is made against what is stored when it is written (a fresh read), so its "before" is never out of date as it appears; no card when the brand KB was rebuilt while the study ran.
- An image card a person decided on after a rebuild says the rebuild is why; only a card retired by a newer study says "The images were studied again…".

**Settled 2026-11-20 (Cyril chose option 1):** the summary model is now shown the written fields the team approved (`approvedWords`, added to `buildSummaryInput`) and told to return them word for word unless the images now show something different (summary prompt 1.2.0). Not yet proven against the live model: QA check 6.36. The question as it was raised:

**The question (now settled):** the written fields are prose the model writes afresh on every study, so its wording will differ slightly each time even when the images say the same. Once those fields are reviewed, almost every study may produce a card, and a discard is remembered only for the exact words. The spec's last success step ("the same reading, no card") may not hold in practice. Options: show the model the reviewed values and ask it to keep them unless the images now say otherwise; ask the model a separate yes/no "does the reviewed value still describe the images?"; stop quoting numbers in the prose fields; remember a refusal for a field until the image set changes a lot. A live run (approve the prose fields, upload one image) will show how bad it is.

**Left for later (minor):** the study's whole-section write can undo an approval made in the same instant (tiny window, existed before for hand reviews); a reviewed field with an empty value is still replaced without a card; "The new images read differently" also shows on a forced re-run with no new images; if retiring succeeds and the insert fails, the proposal is lost until the next study; an old card stays approvable when every image is removed; an unsaved hand edit of an image field beats an approved card on Save; two meanings of "same value" in `merge.ts`; `listSettledChangeCards` reads whole cards on every study with proposals; no route-level test for approving an `image_analysis.*` card.

**Owed:** QA checks 6.26 and 6.30–6.35 in the browser, with a live model.
