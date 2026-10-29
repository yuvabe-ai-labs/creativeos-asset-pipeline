# Brand-neutral Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the client specifics outside the script copilot (a skincare client in the script
reader, CHUPPS in the video prompt writer, Jackfruit's kit regions in Visualise) and remove the UGC
bench.

**Architecture:** Prompt text changes plus one data table generalised; one feature deleted. No new
runtime behaviour.

**Tech Stack:** TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-28-brand-neutral-system-design.md` (§3.2, §3.3, §3.4, §3.7).
Runs after `2026-10-28-brand-neutral-copilot.md` (it reuses that plan's `CLIENT_TERMS`).

## Global Constraints

- No shared prompt text names a client or its product: `clientTermsIn(text)` (from `src/lib/scripts/copilot/client-terms.ts`) is `[]` for every prompt changed here.
- Examples in prompts use made-up, neutral items (spec §3.3), never a real client's product.
- Code comments and test fixtures that mention a client as history stay (spec §4).
- Avatars keep working after the bench is gone.

## Review Focus

1. **Product naming still works after the examples change:** a multishot prompt written for a script that names a product must still name it before each reference token. Pinned in Task 2.
2. **A script set in a city, not a state** ("Chennai") must still find the right regional kit when the KB's kit table names the state. Pinned in Task 3.
3. **A non-product reel** (a flat, a service) must not be told to name "the product" in every shot. Pinned in Task 1.
4. **Avatar voice uploads** must keep their 2–30 s limits once the bench's constants file is gone. Pinned in Task 4.
5. **Dead links:** nothing may still link to `/ugc` or import `@/lib/ugc`. Pinned in Task 4.

---

### Task 1: The script reader's subject rule, in neutral words

**Files:**
- Modify: `src/prompts/script-parse.ts:189-215` (`SETTING_ONLY` and its comment)
- Test: `src/prompts/__tests__/script-parse.test.ts` (create if absent)

**Interfaces:** `scriptParsePrompt` keeps its shape; only `SETTING_ONLY`'s text changes.

- [ ] **Step 1: Write the failing test:** `clientTermsIn(SETTING_ONLY_TEXT)` is `[]` and the text contains none of `"cream"`, `"jar"`, `"skin"`, `"forearm"`, `"rose petal"`, `"butter"`, `"These are product films"`; it still contains `"Lead with the SUBJECT"` and `"NAMES the product as the source script names it"`. Export the constant for the test if it isn't already.
- [ ] **Step 2: Run** `npx vitest run src/prompts/__tests__/script-parse.test.ts`. Expected: FAIL.
- [ ] **Step 3: Rewrite** keeping the three measured clauses (subject first; name the product every time it is on screen; setting follows the subject). Product forms become "in its packaging, in use, in close-up, or as part of the scene". The material-noun example becomes "'the product', 'the pack' and 'the texture' must each carry the product's name". The non-product example becomes "a raw ingredient, a prop, a tool or a hand keeps its own name". Replace "These are product films…" with: `When the reel is about a product, a reader must be able to tell from one description alone which product is on screen. When it is about a place, a service or a person, lead with that subject the same way.`
- [ ] **Step 4: Run** the test and `npx vitest run src/lib/nodes src/prompts`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(prompts): the script reader's subject rule names no client's product`.

### Task 2: The video prompt writer's examples, neutral

**Files:**
- Modify: `src/prompts/multishot-prompt-generate.ts:46-56,85` (examples), `src/lib/nodes/video-prompt.ts:79,87` (token usage examples)
- Test: `src/prompts/__tests__/multishot-prompt-generate.test.ts:121`, `src/lib/nodes/video-prompt.test.ts`

**Interfaces:** No signature changes. The examples become: `the green ceramic mug` / `the navy canvas backpack` (triple and timecode examples), `"the green ceramic mug <IMAGE_REF_0>"` (Omni) and `"the green ceramic mug @Image 1"` (Seedance), and the passing-mention list `"the green ceramic mug", "the tan leather sliders", "a young woman in a loose oatmeal shirt"`.

- [ ] **Step 1: Update the tests first:** `multishot-prompt-generate.test.ts:121` expects `/green ceramic mug/`; add `expect(clientTermsIn(spec.system)).toEqual([])`; in `video-prompt.test.ts` assert the Omni and Seedance usage strings contain `"the green ceramic mug"` and not `"CHUPPS"`.
- [ ] **Step 2: Run** `npx vitest run src/prompts/__tests__/multishot-prompt-generate.test.ts src/lib/nodes/video-prompt.test.ts`. Expected: FAIL.
- [ ] **Step 3: Replace** the example strings only (keep the D262/D263 comments as history).
- [ ] **Step 4: Run** the same tests and `npx vitest run src/lib/nodes`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(prompts): video prompt examples use made-up products, not a client's`.

### Task 3: Kit place names keyed by state, not by one client's table

**Files:**
- Modify: `src/lib/scripts/visualise/kits.ts:53-71`
- Test: `src/lib/scripts/visualise/__tests__/kits.test.ts`

**Interfaces:**
- `KIT_PLACE_HINTS` is replaced by `export const STATE_PLACES: Record<string, string[]>`, keyed by Indian state or territory names only (Tamil Nadu, Kerala, Karnataka, Telangana, Andhra Pradesh, Delhi, Uttar Pradesh, Punjab, Maharashtra, Gujarat, West Bengal, Rajasthan), each with its major cities and language name. `namesFor(kit)` adds the places of every state named anywhere in `kit.region` (so "Delhi and Lucknow" and "Karnataka and Telangana" keep matching through their parts). Generic geography, no client's row names. *(Plan author's call; the spec allowed "goes or comes from the KB".)*

- [ ] **Step 1: Write the failing tests:** a kit with region `"Karnataka and Telangana"` matches a script saying `"Hyderabad"`; a kit with region `"Tamil Nadu"` matches `"Chennai"` (the existing Reel 01 test keeps passing); a kit with region `"West Bengal"` matches `"Kolkata"` (no Jackfruit row has it, so this proves the table is generic).
- [ ] **Step 2: Run** `npx vitest run src/lib/scripts/visualise/__tests__/kits.test.ts`. Expected: FAIL on West Bengal.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/lib/scripts/visualise`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(visualise): regional kit matching uses general geography, not one client's rows`.

### Task 4: Remove the UGC bench

**Files:**
- Delete: `src/app/ugc/`, `src/app/api/ugc/`, `src/components/ugc/`, `src/hooks/use-ugc-bench.ts`, `src/lib/ugc/` (including `omnihuman/` and the bench's tests)
- Modify: `src/lib/avatars/constants.ts` (add `VOICE_MIN_SECONDS = 2`, `VOICE_MAX_SECONDS = 30`), `src/lib/avatars/voice-preview-run.ts:4`, `src/lib/avatars/voice-reference.ts:6` (import from `./constants`), `src/lib/media/ffmpeg.ts:101` (comment: "the flags proven in the former UGC bench")

- [ ] **Step 1:** Move the two constants and switch both imports. Run `npx vitest run src/lib/avatars "src/app/api/clients/[id]/avatars"`. Expected: PASS.
- [ ] **Step 2:** Delete the bench folders and files listed above.
- [ ] **Step 3: Run** `git grep -n -E "@/lib/ugc|components/ugc|use-ugc-bench|/api/ugc|\"/ugc\"" -- src scripts`. Expected: no output.
- [ ] **Step 4: Run** `npx tsc --noEmit`, `npm run lint`, `npx vitest run`. Expected: all pass (Kling cold-cache timeout: re-run that file alone).
- [ ] **Step 5: Commit** `chore: remove the UGC bench; avatars own their voice-length limits`.

### Task 5: Final sweep and ADR line

- [ ] **Step 1: Run** `git grep -n -i -E "chupps|v-straps|rose petal|jackfruit" -- src ':!**/__tests__/**' ':!**/*.test.ts' ':!**/fixtures/**'`. Expected: only code comments recording history.
- [ ] **Step 2:** Add a "Refined" line to the brand-neutral ADR (from the copilot plan's Task 10) listing the script reader, video prompt writer, kit geography and the UGC bench's removal.
- [ ] **Step 3: Commit** `docs(adr): brand-neutral cleanup recorded`.
