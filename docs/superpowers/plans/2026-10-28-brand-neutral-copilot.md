# Brand-neutral Script Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The script copilot names no client in anything every client gets, and draws each client's
specifics (what it sells, its claims, its audience, its occasions, its chips) from that client's own
material.

**Architecture:** Shared text (prompt rules, task text, format menu) becomes neutral. Client material
reaches the model through one per-turn context: the brand KB (with a new free-text
`compliance.content_rules` field, and the audience fields it drops today), today's date, a compact
market-signal digest, and the client's own example scripts. Every model call that writes a reply
also returns brand-aware chips, carried in the turn's answer and kept in the browser (not stored; amended 28 Oct, no migration).

**Tech Stack:** Next.js route handlers, Zod v4 schemas (OpenAI strict output + Gemini
`responseJsonSchema`), Supabase Postgres (one migration), TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-28-brand-neutral-system-design.md` (§3.1, §3.5, §3.6).
The other leaks (§3.2 script reader, §3.3 video prompt writer, §3.4 Visualise, §3.7 UGC bench) are
a separate plan: `docs/superpowers/plans/2026-10-28-brand-neutral-cleanup.md`.

## Global Constraints

- The shared safety line, verbatim: `Follow the client's compliance rules in its KB. Never make up a testimonial, a number or a claim the KB doesn't give.`
- An angle commits to: situation; product moment (where the client's product or service shows up); who else is there; proof (from the client's KB); hook. `reviewTheme` is `""` unless the chosen format has a review beat that fits the brand.
- No shared prompt text, format-menu text or fixed chip contains any term in `CLIENT_TERMS` (Task 5).
- Formats are a shared menu offered to every client (UGC, UGC review first, Founder-led). A format's beats are a starting point; the copilot may drop or adapt a beat that doesn't fit the brand, and lists the beats on the confirmation card.
- Example scripts are only ever the client's own.
- No added wait: anything newly loaded per turn loads inside the existing `Promise.all` in `loadCopilotContext`.
- Controls are shadcn primitives from `src/components/ui/*` (AGENTS.md). Data through TanStack Query (AGENTS.md).
- Provider pairs share prompt text: the KB extraction rule goes in `KB_EXTRACT_SYSTEM_PROMPT` only (Gemini imports it).
- Migration number: the next free number in `supabase/migrations/` at build time (0061 on `origin/staging` today).
- ADR: append to §7 of `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` at the next free D-number (D424 today).

## Review Focus

1. **A script mid-brief from before this change** (stored angles with `mealMoment`/`proofEmphasis`, a stored card with no `beats`) must still open with its brief intact. A failed parse silently becomes `EMPTY_BRIEF` (`rows.ts`). Pinned in Task 1.
2. **A client with no KB, no signals and no scripts** must still get occasion chips plus "You pick", and a prompt that says what is missing instead of `undefined` or blank sections. Pinned in Tasks 4 and 6.
3. **Model chips that are junk** (empty, duplicates, more than 4, over 80 characters, the same as a code chip) must be cleaned before saving. Pinned in Task 6.
4. **An old KB with no `content_rules` key** must render in the copilot without the key and show the field on the KB page so it can be filled. Pinned in Tasks 3 and 4.
5. **A format typed freely** ("like a UGC", "reel with the founder") must resolve to the right menu format (the longest menu name contained in the text), and an unknown one must still draft. Pinned in Task 2.

---

### Task 1: Stored shapes read old and new angles and cards

**Files:**
- Modify: `src/lib/scripts/copilot/output.ts` (angle and card output schemas)
- Modify: `src/lib/scripts/copilot/schema.ts` (stored schemas)
- Test: `src/lib/scripts/copilot/__tests__/rows.test.ts`

**Interfaces:**
- Produces: `angleOutputSchema` fields `id, hook, situation, productMoment, supportingCast, proof, reviewTheme, format, occasion, postDate, lead, leadAvatarId, signalIds, fromSignals` (no `mealMoment`, no `proofEmphasis`). `cardOutputSchema` gains `beats: z.array(z.string())` after `lines`. `angleSchema` (stored) = `z.preprocess(upgradeAngle, angleOutputSchema)`; `confirmationCardSchema` (stored) = `cardOutputSchema.extend({ beats: z.array(z.string()).default([]) })`. `export function upgradeAngle(raw: unknown): unknown` maps `mealMoment → productMoment` and `proofEmphasis → proof` when the new key is absent, leaves everything else.
- `Angle` and `ConfirmationCard` types follow the stored schemas.

- [ ] **Step 1: Write the failing tests** in `rows.test.ts`:
  - `it("reads a brief stored with the old angle fields")`: a row whose `brief.angles[0]` has `mealMoment: "Lunch, two spoons"`, `proofEmphasis: "Name the study"` and no `productMoment`/`proof` → `rowToGenerateScript(row).brief.angles[0]` has `productMoment === "Lunch, two spoons"`, `proof === "Name the study"`, and `brief.phase` equals the stored phase (not reset).
  - `it("reads a stored card with no beats as an empty list")`: `brief.card` without `beats` → `card.beats` equals `[]` and `card.lines` is kept.
  - `it("reads an angles message card with old fields")`: `rowToMessage` with `card: { kind: "angles", angles: [oldAngle] }` → `card.angles[0].productMoment` set.
- [ ] **Step 2: Run** `npx vitest run src/lib/scripts/copilot/__tests__/rows.test.ts`. Expected: FAIL (`productMoment` undefined).
- [ ] **Step 3: Implement** the output-schema change, `upgradeAngle`, and the stored schemas. `briefSchema.angles`, `briefSchema.card` and the `angles`/`confirmation` message-card variants use the stored schemas. The model-facing `anglesOutputSchema`/`cardOutputSchema` stay strict (no preprocess, no defaults): OpenAI strict output rejects them.
- [ ] **Step 4: Run** the file again, then `npx tsc --noEmit`. Expected: rows tests PASS; type errors only at the `mealMoment`/`proofEmphasis` call sites (angles card, existing tests' fixtures). Fix fixtures in `__tests__` to the new names; leave the angles card for Task 7 by changing only its field names (`productMoment`, `proof`) so it compiles.
- [ ] **Step 5: Commit** `feat(scripts): angles carry a product moment and proof; old briefs still read`.

### Task 2: The shared format menu

**Files:**
- Create: `src/lib/scripts/copilot/formats.ts`
- Modify: `src/lib/db/script-generate.ts:160-170` (`loadGenerateState`), `src/app/api/clients/[id]/scripts/route.ts:30`, `src/lib/scripts/copilot/schema.ts` (`GenerateState.formats` comment), `src/lib/scripts/copilot/brief.ts` (remove `isFounderLed`), `src/lib/scripts/copilot/turn.ts:68` (`formats` for questions)
- Test: `src/lib/scripts/copilot/__tests__/formats.test.ts`

**Interfaces:**
- Produces:
  - `export type FormatBeat = { label: string; does: string }`
  - `export type ScriptFormat = { name: string; beats: FormatBeat[]; realPersonLead: boolean }`
  - `export const SCRIPT_FORMATS: readonly ScriptFormat[]`
  - `export function formatFor(text: string): ScriptFormat | undefined`: the menu format whose name is the longest one contained in `text`, case-insensitive.
  - `export function renderFormatMenu(chosen: string): string`: every format with its beats as `LABEL: does` lines, the chosen one (via `formatFor`) marked "chosen", plus the sentence `A beat that doesn't fit this brand is left out or adapted, and the confirmation card lists the beats.` When `formatFor(chosen)` is undefined: append `The chosen format is not on the menu: shape its beats from the person's description.`
  - `GenerateState.formats` = `SCRIPT_FORMATS.map((f) => f.name)` for every client.
- The menu data (exact copy; the spec fixes neutral beat descriptions):
  - **UGC**, `realPersonLead: false`: HOOK "the lead's moment, a line to camera"; INTRO "the situation or the problem"; STORY "the product or service enters the lead's life"; STEP "how it is used or experienced"; REVIEW "a real customer review, only for brands that use them"; BODY "what stays the same in the lead's life"; PAYOFF "the moment it pays off"; PROOF "the brand's proof, from its KB"; OUTRO "where to find it, and any disclaimers".
  - **UGC review first**: the same beats, REVIEW moved to second.
  - **Founder-led**, `realPersonLead: true`: HOOK; INTRO; TOPIC 1–5 "a point about this reel's topic, labelled for it"; PROOF; OUTRO (same `does` text as UGC for the shared labels).

- [ ] **Step 1: Write the failing tests** in `formats.test.ts`:
  - `formatFor("like a UGC")?.name === "UGC"`; `formatFor("UGC review first please")?.name === "UGC review first"`; `formatFor("founder-led")?.name === "Founder-led"`; `formatFor("a carousel") === undefined`.
  - `renderFormatMenu("UGC")` contains `"UGC (chosen)"`, `"REVIEW: a real customer review, only for brands that use them"`, and the leave-out sentence.
  - `renderFormatMenu("a carousel")` contains `"is not on the menu"`.
  - `SCRIPT_FORMATS.find((f) => f.name === "Founder-led")!.beats.filter((b) => b.label.startsWith("TOPIC")).length === 5`.
- [ ] **Step 2: Run** `npx vitest run src/lib/scripts/copilot/__tests__/formats.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `formats.ts`; set `formats` in `loadGenerateState` and the create route's `openingMessage` from `SCRIPT_FORMATS` (drop their `listScripts`/`libraryFormats` use for formats: `loadGenerateState` no longer lists scripts at all); `prepareBrief` passes `SCRIPT_FORMATS` names to `questionFor`. Delete `isFounderLed`; its one caller (suggestions) switches in Task 6.
- [ ] **Step 4: Run** the formats tests plus `src/lib/scripts/copilot/__tests__/brief.test.ts`. Expected: PASS (update brief tests that assumed library formats).
- [ ] **Step 5: Commit** `feat(scripts): every client is offered the same format menu`.

### Task 3: A `content_rules` field in the brand KB

**Files:**
- Modify: `src/lib/kb/schema.ts` (`TraceableComplianceSchema`), `src/lib/kb/constants.ts` (`FIELD_LABELS`, `MODULE_LEADING_FIELDS.compliance`), `src/lib/kb/utils.ts` (`getModuleFields`), `src/prompts/kb-extract.ts` (field rule)
- Test: `src/lib/kb/utils.test.ts`, `src/lib/kb/__tests__/` (schema shape)

**Interfaces:**
- Produces: `compliance.content_rules: KBField<string>`, described `"What a script needs that no other field holds: what the brand sells, the claims and proof it may use, its disclaimers' wording, whether it uses customer reviews, regional customs, and anything never shown. Only what the sources state."` Label `"Content Rules"`, first in the Compliance module.
- `getModuleFields(kb, "compliance")` includes `content_rules` (as `emptyKBField<string>(null)`) when the stored KB lacks the key. Display only: nothing is written, and `fill-rate.ts` (Mark KB Ready) is unchanged.
- Extraction picks the field up through `DocExtractionSchema` (`TraceableBrandKBSchema.omit({ image_analysis })`) in both providers and the re-extract route; no wiring change.

- [ ] **Step 1: Write the failing tests:**
  - `utils.test.ts`: `it("shows Content Rules on an old KB that has none")`: a KB whose `compliance` lacks `content_rules` → `Object.keys(getModuleFields(kb, "compliance"))[0] === "content_rules"` and its `value === null`.
  - schema test: `TraceableBrandKBSchema.shape.compliance.shape.content_rules` is defined.
  - prompt test (in `src/prompts/__tests__/`): `KB_EXTRACT_SYSTEM_PROMPT` contains `"content_rules"` and `"never invent"`.
- [ ] **Step 2: Run** `npx vitest run src/lib/kb src/prompts/__tests__`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `kb-extract.ts` FIELD-SPECIFIC RULES, under COMPLIANCE add: `content_rules → plain prose, a few short paragraphs: what the brand sells (products or services by name), the exact claims and proof lines it uses (verbatim), disclaimers' wording, whether it uses customer reviews, regional or cultural customs to respect, things never to show. Only what the documents state; never invent a claim. null when the documents say none of it.`
- [ ] **Step 4: Run** the same tests. Expected: PASS. Run `npx vitest run src/lib/kb src/lib/image-analysis`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(kb): a Content Rules field for what a brand sells and may claim`.

### Task 4: The copilot's per-turn context

**Files:**
- Modify: `src/lib/scripts/copilot/context.ts`, `src/lib/scripts/copilot/prompt-context.ts` (`renderKbText`, new `renderAudience`, `renderSignalDigest`, `todayLabel`), `src/lib/scripts/copilot/messages.ts` (`CopilotBase`), `src/lib/scripts/copilot/turn.ts` (angles step reads `ctx.signals`; remove `TurnDeps.loadSignals`), `src/app/api/clients/[id]/scripts/[scriptId]/turn/route.ts`
- Test: `src/lib/scripts/copilot/__tests__/prompt-context.test.ts`, `src/lib/scripts/copilot/__tests__/turn.test.ts`, the turn route test

**Interfaces:**
- Produces:
  - `CopilotContext` gains `today: string` and `signals: { brief: string; digest: string; list: { id: string; name: string }[] }`.
  - `loadCopilotContext(client, opts?: { signals?: boolean })`: when `opts.signals`, `listSignalsWithItems` runs inside the existing `Promise.all`; otherwise `signals` is `{ brief: "", digest: "", list: [] }`. Only the turn route passes `{ signals: true }`.
  - `export function todayLabel(now: Date): string`: `"Wed 28 Oct 2026"`, en-GB, `Asia/Kolkata` time zone.
  - `export function renderSignalDigest(signals: SignalWithItems[], maxChars = 1500): string`: `[S1] name: first line of its brief`, one per line, cut at `maxChars` on a line boundary; `""` for none.
  - `renderKbText(kb)` reads `kb.compliance?.content_rules?.value` as `Content rules (read whole):\n…` and no longer reads `image_analysis.brand_consistency_notes`. It appends `renderAudience(kb)`: `Audience location`, `Age range`, `Pain points`, `Desires` lines from `target_audience`, skipping empty ones.
  - `CopilotBase` gains `today: string`, `signalDigest: string` and `formatMenu: string`, all filled by `baseFor(ctx, format)` in `turn.ts` (`formatMenu = renderFormatMenu(format)` from Task 2). Task 5's prompts read them. The inline-edit route's `baseFor` call gets them too (`signalDigest` is `""` there).
  - `TurnDeps` loses `loadSignals`; the angles step uses `input.ctx.signals`.

- [ ] **Step 1: Write the failing tests:**
  - `renderKbText` with `compliance.content_rules.value = "Sells 2 and 3 BHK flats in Whitefield."` and `image_analysis.brand_consistency_notes.value = "The look is consistent."` → contains `"Content rules (read whole):\nSells 2 and 3 BHK flats in Whitefield."`, does not contain `"The look is consistent."`.
  - `renderKbText` with `target_audience.location.value = "Bengaluru"` → contains `"Audience location: Bengaluru"`; with no `content_rules` key → contains no `"undefined"`.
  - `todayLabel(new Date("2026-10-27T20:00:00Z")) === "Wed 28 Oct 2026"` (IST is past midnight).
  - `renderSignalDigest` of 30 long signals has `length <= 1500` and starts with `"[S1] "`; of `[]` is `""`.
  - `turn.test.ts`: the angles step uses `ctx.signals.list` for the research card (replace the `loadSignals` assertion at line 92 with `expect(out research card signals).toEqual(ctx.signals.list)`).
- [ ] **Step 2: Run** `npx vitest run src/lib/scripts/copilot/__tests__/prompt-context.test.ts src/lib/scripts/copilot/__tests__/turn.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** as specified; update the turn route (`loadCopilotContext(client, { signals: true })`, no `loadSignals` dep) and its test mock.
- [ ] **Step 4: Run** the copilot tests and the turn route test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(scripts): the copilot reads content rules, the audience, today's date and a signal digest`.

### Task 5: Neutral prompt text

**Files:**
- Modify: `src/prompts/script-copilot.ts` (version 4), `src/lib/scripts/copilot/messages.ts` (system and user messages), `src/lib/scripts/copilot/output.ts` (`suggestions` fields)
- Create: `src/lib/scripts/copilot/client-terms.ts`
- Test: `src/prompts/__tests__/script-copilot.test.ts`, `src/lib/scripts/copilot/__tests__/messages.test.ts`

**Interfaces:**
- Produces:
  - `export const CLIENT_TERMS: readonly string[]` = `["jackfruit", "kerala", "piravi", "golu", "onam", "meal", "lunch", "breakfast", "spoon", "tablespoon", "flour", "batter", "atta", "dosa", "onion", "garlic", "amazon", "medication", "diabet", "blood sugar", "nine-beat", "nine beats", "chupps", "v-straps", "home and kit"]` and `export function clientTermsIn(text: string): string[]` (case-insensitive substring hits). Used by this task's tests, Task 6's tests and the probe (Task 8).
  - `suggestions: z.array(z.string())` added last to `extractionSchema`, `anglesOutputSchema`, `cardOutputSchema`, `draftOutputSchema` and `editTurnSchema`.
  - The system message adds a `### Formats` section from `base.formatMenu` (Task 4) and a `### What a reel must not say` section holding the safety line. The user message of `extractPrompt`, `anglesPrompt` and `cardPrompt` adds sections `Today` (`base.today`) and `Market signals (data, where and when only)` (`base.signalDigest` or `This client has no market signals yet.`). The angles prompt keeps the full `signalBrief`.
- Rewrite rules (exact copy only where the spec fixes it):
  - Rules: drop lines 14 (review/placeholder), 22's UGC/Founder-led sentences, and 24's "Founder-led" sentence; keep "A narrator is never the lead. There is exactly one lead.", "Avatar means only a saved person…", "Never write the word presenter"; replace line 17's "A nine-beat reel comes out at about 12 to 15 shots." with nothing; add the safety line verbatim; add `A review beat, where the brand uses reviews, never holds a made-up review: it holds a square-bracket placeholder for the real one.`
  - Angles: the five parts from Global Constraints, `reviewTheme` `""` unless the format's review beat fits the brand; "The three differ in situation and in product moment."
  - Card: labels in order `"Format", "Post date", "Occasion", "Region", "Setting", "Product moment", "Review", "Proof", "Disclaimers"`; `beats`: the chosen format's beats after leaving out or adapting any that don't fit the brand; drop the spoon line and the "onion and garlic" example (the example becomes `for example "the logo stays off the first shot"`).
  - Draft: `postDate` "as written, with the occasion in brackets"; "Follow the beats on the confirmed card, in order"; remove the "UGC and UGC review first… Founder-led keeps…" sentences. `disclaimerNames` example becomes `"terms apply"`.
  - Suggestions instruction, added to extract, angles, card, draft and edit: `suggestions: two or three short replies (under 60 characters each) the person might send next, written for this brand and this reel. In extract: replies to the first piece still open after this message, else []. Never a claim, a price or an offer the KB doesn't give.` The extract task adds: `For the occasion, draw on the brand, its audience's location, today's date and the market signals.`

- [ ] **Step 1: Write the failing tests:**
  - `script-copilot.test.ts`: `clientTermsIn([rules, ...Object.values(tasks)].join("\n"))` equals `[]`; `rules` contains the safety line verbatim; `scriptCopilotPrompt.version === 4`; `tasks.angles` contains `"productMoment"` and not `"mealMoment"`.
  - `formats.test.ts` (Task 2's file): `clientTermsIn(renderFormatMenu("UGC"))` equals `[]`.
  - `messages.test.ts`: `extractPrompt(base, …).user` contains `"## Today\nWed 28 Oct 2026"` and `"## Market signals"`; with `signalDigest: ""` contains `"This client has no market signals yet."`; `draftPrompt(base, …).system` contains `"### Formats"`.
- [ ] **Step 2: Run** `npx vitest run src/prompts/__tests__/script-copilot.test.ts src/lib/scripts/copilot/__tests__/messages.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the rewrite, `client-terms.ts`, and the schema `suggestions` fields.
- [ ] **Step 4: Run** all copilot tests: `npx vitest run src/lib/scripts/copilot src/prompts`. Expected: PASS (update fixtures that build model outputs to include `suggestions: []`).
- [ ] **Step 5: Commit** `feat(scripts): the copilot's shared instructions name no client`.

### Task 6: Brand-aware chips, saved with each message

**Files:**
- Create: `supabase/migrations/00NN_script_message_suggestions.sql` (`alter table client_script_messages add column suggestions jsonb;`)
- Modify: `src/lib/scripts/copilot/schema.ts` (`ScriptMessage.suggestions: string[]`), `rows.ts` (`ScriptMessageRow.suggestions`), `src/lib/db/script-generate.ts` (`listScriptMessages` selects it; `insertScriptMessages` writes it), `turn.ts` (`Reply.suggestions`), `import-turn.ts`/`acceptProposal` callers (pass `[]`), `suggestions.ts`, `fill-to-final.ts:32`
- Test: `src/lib/scripts/copilot/__tests__/suggestions.test.ts`, `rows.test.ts`, `turn.test.ts`, `fill-to-final.test.ts`

**Interfaces:**
- Consumes: `formatFor`, `SCRIPT_FORMATS` (Task 2); `suggestions` on model outputs (Task 5).
- Produces:
  - `export type Reply = { content: string; card: MessageCard | null; suggestions?: string[] }`; `insertScriptMessages` items take `suggestions?: string[]` (stored `null` when absent).
  - `export function cleanSuggestions(raw: string[], taken: readonly string[] = []): string[]`: trims, drops empties and anything over 80 characters, drops case-insensitive duplicates and anything in `taken`, keeps the first 4.
  - `prepareTurn` attaches `cleanSuggestions(out.suggestions)` to the **last** reply of a turn: from the extract call when the next step asks the occasion, the angles call, the card call, the draft call, and the edit call.
  - `suggestionsFor(state)`: code chips stay where they are data, not text: format ask → `SCRIPT_FORMATS` names + "Take it from here"; lead ask → avatars (real-person first when `formatFor(brief.format.value)?.realPersonLead`) + "Cast it for me"; occasion ask → model chips + "You pick"; confirm → "Write it" + model chips; draft → import link chips, the review-paste fill chip, the confirm-item chip, then model chips. "Model chips" = suggestions of the newest assistant message that has any, looking back only until the most recent user message. Every fixed text chip is removed: "Kerala Piravi, Sun 1 Nov", "Make it lunch instead", "Blend A and B", "Give me three different angles", "Make the hook punchier", "Redo the payoff, warmer", "Move the review earlier", "Make the ending warmer".
  - `fill-to-final.ts` review placeholder question: `Paste a real, cleared customer review for ${where}, on the theme its visual names. If none fits, tell me and I'll swap the theme.`

- [ ] **Step 1: Write the failing tests:**
  - `suggestions.test.ts`: occasion ask with newest assistant suggestions `["Diwali: a new home for the festival"]` → labels `["Diwali: a new home for the festival", "You pick"]`; with none → `["You pick"]`; no state ever yields a label containing a `CLIENT_TERMS` hit (loop over the existing fixtures); confirm step → first label `"Write it"`; draft stage after an inline-edit assistant message (no suggestions) that followed an edit reply with `["Shorten the hook"]` → includes `"Shorten the hook"`; a lead ask with format `"Founder-led"` lists the specific avatar first.
  - `cleanSuggestions(["  A ", "a", "", "x".repeat(81), "B", "C", "D", "E"], ["You pick"])` equals `["A", "B", "C", "D"]`.
  - `rows.test.ts`: `rowToMessage` with `suggestions: null` → `[]`; with `["A"]` → `["A"]`; with `[1]` → `[]`.
  - `turn.test.ts`: an edit turn whose model output has `suggestions: ["Shorten the hook"]` → the reply carries `["Shorten the hook"]`; an angles turn attaches its suggestions to the angles message (the last reply), not the research card.
  - `fill-to-final.test.ts`: the review placeholder question contains `"customer review"` and not `"Amazon"`.
- [ ] **Step 2: Run** `npx vitest run src/lib/scripts/copilot`. Expected: FAIL on the new tests.
- [ ] **Step 3: Implement**, including the migration file.
- [ ] **Step 4: Run** `npx vitest run src/lib/scripts/copilot "src/app/api/clients/[id]/scripts"`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(scripts): every copilot chip comes from the client and the brand`.

### Task 7: Angle and confirmation cards show the new parts

**Files:**
- Modify: `src/components/scripts/generate/copilot-angles-card.tsx`, `src/components/scripts/generate/copilot-confirmation-card.tsx`, `src/lib/scripts/copilot/brief.ts` (`cardToNotes`)
- Test: `src/components/scripts/generate/__tests__/copilot-angles-card.test.tsx` (create), `copilot-confirmation-card.test.tsx`, `src/lib/scripts/copilot/__tests__/brief.test.ts`

**Interfaces:**
- Consumes: `Angle`, `ConfirmationCard` (Task 1).
- Angle card rows, in order: `"Product moment"` (`productMoment`), `"Who else"` (`supportingCast`), `"Proof"` (`proof`), `"Review theme"` (`reviewTheme`); empty values hidden, as today.
- Confirmation card: a `Beats` row rendering `card.beats.join(" › ")`, hidden when empty.
- `cardToNotes(card)` adds the line `Beats: ${card.beats.join(" › ")}` after the card's lines when `beats` is non-empty.

- [ ] **Step 1: Write the failing tests:** the angles card renders `"Product moment"` and not `"Meal and use"`, and hides `"Review theme"` when `reviewTheme` is `""`; the confirmation card renders `"HOOK › INTRO › PROOF"` for those beats and no Beats row for `[]`; `cardToNotes` includes `"Beats: HOOK › INTRO › PROOF"`.
- [ ] **Step 2: Run** `npx vitest run src/components/scripts/generate src/lib/scripts/copilot/__tests__/brief.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Reuse the existing `dl` row markup in both cards; no new primitives.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(scripts): angle and brief cards show the product moment, proof and beats`.

### Task 8: A client-agnostic probe

**Files:**
- Modify: `src/lib/scripts/copilot/probe-score.ts`, `scripts/probe-script-writer.itest.ts`, `src/lib/scripts/copilot/constants.ts` (remove `REVIEW_PLACEHOLDER` once unused)
- Test: `src/lib/scripts/copilot/__tests__/probe-score.test.ts`

**Interfaces:**
- Consumes: `SCRIPT_FORMATS`, `clientTermsIn`, `anglesPrompt`/`cardPrompt`/`draftPrompt`/`editPrompt`, `loadCopilotContext`.
- `ProbeOptions` becomes `{ beats: string[]; clientText: string; neverList: string[]; shots: [number, number]; seconds: [number, number] }`. `founderLed` and `lockedLines` go (locked lines now live as text in content rules; spec 2 §8 already says text rules aren't checked).
- Checks: `structure` = the draft's beat sequence equals `beats` (the confirmed card's); `review placeholder` only when `beats` includes `"REVIEW"`: a review shot's VO matches `PLACEHOLDER_RE`; new `no other client`: `clientTermsIn(draftText)` minus terms also found in `clientText` (the client's own KB text and examples) is empty. The others stay.
- Runner: `PROBE_CLIENT=<slug>` (required), no outline file. For each `SCRIPT_FORMATS` entry: angles (quick model) → pick A → card (quick model) → draft and edit (each `PROBE_MODELS` model) → score with `beats: card.beats`. The context comes from `loadCopilotContext(client, { signals: true })`, so the client's saved KB and content rules are what is tested.

- [ ] **Step 1: Write the failing tests** in `probe-score.test.ts`: a doc whose beats are `HOOK, INTRO, PROOF, OUTRO` scores `structure` PASS against those beats and FAIL against the UGC menu beats; with no `REVIEW` beat the review check passes with zero review shots; a draft containing "spoon" fails `no other client` when `clientText` lacks it and passes when `clientText` contains "spoon".
- [ ] **Step 2: Run** `npx vitest run src/lib/scripts/copilot/__tests__/probe-score.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the scorer and the runner.
- [ ] **Step 4: Run** the unit tests (PASS). Then, with the user's go-ahead (real model calls, a few cents): `PROBE_CLIENT=jackfruit-365 PROBE_MODELS=gemini-3.1-pro-preview npx vitest run --config vitest.integration.config.ts scripts/probe-script-writer.itest.ts`, and the same for `PROBE_CLIENT=propalyst`. Expected: a REPORT.md per run; record pass counts in the ADR (Task 10).
- [ ] **Step 5: Commit** `test(scripts): the writer probe runs on any client against its own KB`.

### Task 9: Move Jackfruit's house rules into Content Rules

**Files:**
- Create: `scripts/move-house-rules.ts`
- Test: `src/lib/kb/__tests__/move-house-rules.test.ts` (the pure part)

**Interfaces:**
- `export function withHouseRulesMoved(kb: TraceableBrandKB): { kb: TraceableBrandKB; moved: boolean }` in `src/lib/kb/move-house-rules.ts`: when `image_analysis.brand_consistency_notes.value` is non-empty and `compliance.content_rules?.value` is empty, copies the text into `compliance.content_rules` with `status: "edited"`, `confidence: "high"`, `evidence_type: "explicit"`; never overwrites a filled `content_rules`; leaves `image_analysis` untouched.
- Script: `npx tsx scripts/move-house-rules.ts <client-slug> [--apply]`. Without `--apply` it prints the first 400 characters it would move and changes nothing. With it, it writes through `setKBField(versionId, ["compliance", "content_rules"], field)` on the active version.

- [ ] **Step 1: Write the failing tests:** moves a filled note into an empty `content_rules`; leaves an existing `content_rules` alone (`moved === false`); handles a KB with no `compliance.content_rules` key.
- [ ] **Step 2: Run** `npx vitest run src/lib/kb/__tests__/move-house-rules.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the function and the script.
- [ ] **Step 4: Run** the tests (PASS). Run the script **dry** for `jackfruit-365` and show the user the preview. Read Jackfruit's and Propalyst's saved KBs (spec §7): report any rule the old shared prompt carried that Jackfruit's text lacks (meal timing by region, spoon count, review beat), and whether Propalyst has any KB. Run with `--apply` on staging **only after the user says yes**: it changes client data.
- [ ] **Step 5: Commit** `feat(kb): a script that moves pasted house rules into Content Rules`.

### Task 10: ADR, migration hand-off, full verification

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7

- [ ] **Step 1:** Append the ADR at the next free D-number: Decision (the spec's §6 list), Why (Propalyst's Kerala Piravi chip; the image-analysis field coupling), Rejected (structured KB fields now; a stored context object; client-owned formats), Refines D336, D337 (chips), spec 2 answers 2.1b and 2c.1. Originated → this spec. Include the probe pass counts from Task 8.
- [ ] **Step 2: Run** `npx tsc --noEmit`, `npm run lint`, `npx vitest run`. Expected: all pass (the Kling provider test may time out on a cold cache; re-run that file alone before investigating).
- [ ] **Step 3: Run** `git grep -n -i -E "kerala|piravi|mealMoment|make it lunch|amazon review" -- src`. Expected: no hits outside `__tests__`, fixtures and comments.
- [ ] **Step 4:** Tell the user the migration file name and that it must be applied to the staging database **before** this code runs against it (deploy or local dev): `insertScriptMessages` writes the `suggestions` column, so every copilot turn fails until it exists. Rows written before it read as `[]`.
- [ ] **Step 5: Commit** `docs(adr): D4NN brand-neutral copilot`.
