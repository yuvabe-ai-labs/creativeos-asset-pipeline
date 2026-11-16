# Copilot journey, piece 2 part 2: the review walk, the gate card and who approved

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (Cyril's standing choice: every task inline, tests first, one independent review of the whole part at the end). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Once a brand KB is built, the copilot says what it found, asks about the few fields it could not settle, fills them from the person's answers, shows what is left to review, and offers the approval as a gate card; the thread records who approved.

**Architecture:** Which field is asked, how it is worded and when the walk stops are decided by code; the model only reads the person's answer and calls a tool, and the tools refuse anything on a reviewed field. The "waiting for you" marker and the gate card are worked out on every thread read from the stored KB, never stored, so they follow what is done by hand. The review screen keeps its draft and "Save changes" (Cyril, 2026-11-16): a save writes only the fields that changed and tells the copilot at once, and a draft can be discarded.

**Tech stack:** Next.js route handlers (`withClient`, `apiOk/apiError`), Supabase (two SQL functions), TanStack Query mutations, zod 4, vitest, the part 1 agent loop (`runAgent`).

**Spec:** [2026-11-12-copilot-journey-brand-kb-design.md](../specs/2026-11-12-copilot-journey-brand-kb-design.md) §2.3, §3 (rail), §5, §6. Shared things per the [journey map](../specs/2026-11-15-copilot-journey-map.md) §2: waiting for you, gate card, who approved.

**Builds on:** part 1 as built (`f7639ccb`), see the Outcome section of [the part 1 plan](2026-11-13-copilot-journey-kb-chat-part-1.md).

## Decided by Cyril on 2026-11-16

- **"Save changes" stays** on the Brand KB review screen. Reviews are still a draft until saved.
- **"Discard changes" is added**, shown whenever the draft has unsaved changes.
- **A save tells the copilot at once**, so the panel and the copilot's next reply are built on what was saved.

What follows from that, and is built in Task 9: a save writes only the fields the person changed, so it can never write an old draft over a field the copilot or a teammate filled in the meantime.

## My calls (overrule any)

- **Code words the questions.** "Audience & Casting · Age Range: I inferred "25 to 40" and could not find it stated. Is that right?" with the buttons "Yes, that's right" and "Skip this one". For an empty field the buttons are "There is none" and "Skip this one". The copilot offers no value of its own as a button: it has no source for one (spec §6).
- **Which five come first:** content rules, age range, tone of voice, pain points, desires; then never-use claims, never-use words, disclaimers, location, positioning, human casting, personality; then the rest in screen order. Only fields that are still unreviewed and are inferred or empty are ever asked.
- **An answer is saved as "edited", stated, high confidence. "Yes, that's right" is saved as "approved".** These are the marks the screen already uses for a hand edit and an approval.
- **The approval line keeps the approver's name as it was that day** ("Asha approved the brand KB."), with their user id beside it. Looking the name up on every thread read would add two queries to a read the panel polls.
- **Approving from the gate card stays on the Brand KB page** and the thread says market research is open. The header's "Mark KB Ready" still goes to the client's home page, as today.
- **A chip "Ask me the open questions"** is offered whenever a built KB has unreviewed fields and no question is waiting, so a client built before this ships can start the walk.

## Global Constraints

- The copilot never approves the KB and never marks it ready: no tool reaches `approveKB`.
- The copilot never writes a field whose status is not `needs_review`. The refusal is in tool code.
- The copilot asks nothing while a build runs (`isBuilding(ctx)`): no question is appended and `waiting` is null.
- A failed read is never "empty": if the unreviewed-fields read fails, the thread read fails; it must never show the gate card.
- The polled thread read stays lean: at most one read added, no KB content downloaded, no writes.
- Controls are shadcn primitives from `src/components/ui/*`; links inside buttons use the `render` prop. Icons Lucide, stroke 1.5. Colours through CSS variables only.
- Browser reads and writes go service → query file → component. Routes use `apiOk/apiError`, `withClient`, `withTryCatch`.
- User-facing text: plain sentences, no em dashes, "brand KB", "avatar" where a person on screen is meant.
- Migration 0064 is written, never applied by the agent. Cyril applies migrations.
- Nothing is pushed or merged.

## Review Focus

1. A teammate reviews the pending question's field on the screen before the person answers in the chat: the tool refuses, nothing is overwritten, and the walk moves on. (Task 6 tests; Task 4 test for `waiting`.)
2. The unreviewed-fields read fails: the thread read throws; no gate card. (Task 4 test.)
3. The model sends one string for a list field, or a list for a text field: it is coerced, never stored in the wrong shape. (Task 6 test.)
4. The build webhook is delivered twice: the account and the first question are written once. (Task 7 test.)
5. Approve is pressed twice, or by two teammates: the KB is approved once and the thread says so once. (Task 5 test.)

---

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0064_kb_review_writes.sql` | `patch_kb_fields`, `kb_unreviewed_fields` |
| `src/lib/db/kb.ts` (modify) | `patchKBFields`, `listUnreviewedFields` |
| `src/lib/kb/field-patch.ts` | The shape of a field patch and which paths may be patched (pure) |
| `src/lib/kb/review-sync.ts` | What a save sends, and taking the server's KB into the screen's two copies (pure) |
| `src/lib/kb/approve.ts` | The one approval, used by the route and the action |
| `src/lib/journey/kb-copilot/review.ts` | The reviewable fields, their kind, the priority order, the account (pure) |
| `src/lib/journey/kb-copilot/walk.ts` | What has been asked, what is asked next, the question's words (pure) |
| `src/lib/journey/kb-copilot/waiting.ts` | The brand KB's "waiting for you" and gate card (pure) |
| `src/lib/journey/thread/approval.ts` | The "who approved" message, for any stage (pure) |
| `src/lib/journey/thread/schema.ts`, `rows.ts`, `load.ts` (modify) | Question and approval cards; `waiting` in `ThreadState` |
| `src/app/api/clients/[id]/kb/fields/route.ts` | `PATCH`: save field patches |
| `src/app/api/clients/[id]/kb/ready/route.ts` (modify) | Calls `approveKB` |
| `src/services/kb.service.ts`, `src/hooks/queries/kb.ts` | `patchFields`, `approve`; `usePatchKbFields`, `useApproveKb` |
| `src/components/journey/thread-waiting.tsx`, `thread-gate-card.tsx` | The marker and the gate card, stage-neutral |

---

### Task 1: Field writes that merge, and a cheap read of what is unreviewed

**Files:** Create `supabase/migrations/0064_kb_review_writes.sql`, `src/lib/kb/field-patch.ts` (the type only). Modify `src/lib/db/kb.ts`. Test `src/lib/db/__tests__/kb-review.test.ts`.

**Interfaces. Produces:**
- SQL `patch_kb_fields(p_version_id uuid, p_patches jsonb) returns void` (plpgsql). `p_patches` is `[{ "path": ["target_audience","age_range"], "patch": {"status":"approved"} }]`. Locks the row, and for each entry whose current value at `path` is a JSON object sets it to `current || patch`; an entry whose path holds no object is skipped (it never creates a field). One `update`.
- SQL `kb_unreviewed_fields(p_version_id uuid) returns text[]` (`stable`). Dotted paths (`target_audience.age_range`, `creative_direction.image.feel`) of every field with `status = 'needs_review'` under `brand_profile`, `visual_identity`, `target_audience`, `creative_direction.image`, `creative_direction.video`, `compliance`. Never `image_analysis`, never the root `brand`. Empty array when none; null when the version does not exist.
- `patchKBFields(versionId: string, patches: KBFieldPatch[]): Promise<void>` → `rpc("patch_kb_fields", { p_version_id, p_patches })`, throws on error.
- `listUnreviewedFields(versionId: string): Promise<string[]>` → `rpc("kb_unreviewed_fields", …)`; throws on error **and when the result is null** (a missing version is a failure, not "nothing left").
- `type KBFieldPatch = { path: string[]; patch: Partial<Pick<KBField<unknown>, "value" | "status" | "confidence" | "evidence_type">> }` in `src/lib/kb/field-patch.ts` (Task 5 adds its schema).

- [ ] **Step 1: Write the failing tests** (mock `createServerSupabase` as `src/lib/actions/kb.test.ts` does)

```ts
it("sends the patches to patch_kb_fields in one call", async () => {
  await patchKBFields("v1", [{ path: ["compliance", "disclaimers"], patch: { status: "approved" } }]);
  expect(rpc).toHaveBeenCalledWith("patch_kb_fields", { p_version_id: "v1", p_patches: [{ path: ["compliance", "disclaimers"], patch: { status: "approved" } }] });
});
it("returns the unreviewed paths", async () => {
  rpc.mockResolvedValueOnce({ data: ["target_audience.age_range"], error: null });
  expect(await listUnreviewedFields("v1")).toEqual(["target_audience.age_range"]);
});
it("throws when the read fails or the version is missing, never an empty list", async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
  await expect(listUnreviewedFields("v1")).rejects.toBeTruthy();
  rpc.mockResolvedValueOnce({ data: null, error: null });
  await expect(listUnreviewedFields("v1")).rejects.toThrow("KB version not found");
});
```

- [ ] **Step 2:** Run `npx vitest run src/lib/db/__tests__/kb-review.test.ts`. Expected: FAIL, `patchKBFields` is not exported.
- [ ] **Step 3:** Write the migration and the two db functions.
- [ ] **Step 4:** Run the same command. Expected: PASS (3).
- [ ] **Step 5:** Add to the top of the migration, as a comment, the two statements Cyril can run after applying it to see it work (`select kb_unreviewed_fields('<a version id>')`, and a `patch_kb_fields` call wrapped in `begin; … rollback;`).
- [ ] **Step 6:** Commit `feat(kb): field writes that merge, and a read of what is unreviewed (migration 0064, unapplied)`.

### Task 2: The reviewable fields and the account

**Files:** Create `src/lib/journey/kb-copilot/review.ts`. Test `src/lib/journey/kb-copilot/__tests__/review.test.ts`.

**Interfaces. Produces:**
```ts
export type ReviewField = {
  path: string;                 // "target_audience.age_range"
  module: ModuleKey; label: string;   // FIELD_LABELS[fieldKey] ?? fieldKey
  title: string;                // "Audience & Casting · Age Range"
  kind: "text" | "list";
  value: string | string[] | null;
  inferred: boolean;            // evidence_type === "inferred"
  status: KBFieldStatus;
};
export const QUESTION_PRIORITY: readonly string[];   // the twelve paths under "My calls", in that order
export function reviewFields(kb: TraceableBrandKB): ReviewField[];   // the six document sections, in MODULES then stored order
export function fieldKind(path: string): "text" | "list" | null;      // from TraceableBrandKBSchema's shape; null for image_analysis, the root brand, or an unknown path
export function isEmpty(value: unknown): boolean;                     // null, "", whitespace, []
export function unsettled(fields: ReviewField[]): ReviewField[];      // needs_review and (inferred or empty); QUESTION_PRIORITY first, then as given
export function reviewAccount(fields: ReviewField[]): { total: number; filled: number; inferred: number; empty: number };  // inferred counts filled fields only
export function unreviewedByModule(paths: string[]): { module: ModuleKey; label: string; count: number }[];  // MODULES order, zero counts left out
```
`kind` comes from the zod schema (`value` unwrapped is a `ZodArray` → list), not from the stored value, so an empty list field is still a list.

- [ ] **Step 1: Write the failing tests.** Build a KB with a helper `kbWith(overrides: Record<path, Partial<KBField>>)` whose every other field is `{ value: "x", confidence: "high", evidence_type: "explicit", status: "needs_review" }` (lists `["x"]`).

```ts
it("lists the 43 fields of the six document sections and none of Image Analysis", () => {
  const fields = reviewFields(kbWith({}));
  expect(fields).toHaveLength(43);
  expect(fields.some((f) => f.path.startsWith("image_analysis"))).toBe(false);
  expect(fields.find((f) => f.path === "target_audience.age_range")).toMatchObject({ module: "audience_casting", title: "Audience & Casting · Age Range", kind: "text" });
});
it("knows a list from a text field by the schema, even when empty", () => {
  expect(fieldKind("target_audience.pain_points")).toBe("list");
  expect(fieldKind("compliance.content_rules")).toBe("text");
  expect(fieldKind("image_analysis.aesthetic")).toBeNull();
  expect(fieldKind("brand")).toBeNull();
});
it("asks only about unreviewed fields that are inferred or empty, the ones scripts lean on first", () => {
  const kb = kbWith({
    "brand_profile.tagline": { evidence_type: "inferred" },
    "target_audience.age_range": { evidence_type: "inferred" },
    "compliance.content_rules": { value: null },
    "brand_profile.mission": { evidence_type: "inferred", status: "approved" },
  });
  expect(unsettled(reviewFields(kb)).map((f) => f.path)).toEqual(["compliance.content_rules", "target_audience.age_range", "brand_profile.tagline"]);
});
it("counts what it filled, inferred and could not find", () => {
  const kb = kbWith({ "brand_profile.tagline": { evidence_type: "inferred" }, "compliance.disclaimers": { value: [] }, "compliance.content_rules": { value: null, evidence_type: "inferred" } });
  expect(reviewAccount(reviewFields(kb))).toEqual({ total: 43, filled: 41, inferred: 1, empty: 2 });
});
it("groups unreviewed paths by tab, in tab order", () => {
  expect(unreviewedByModule(["compliance.disclaimers", "brand_profile.tagline", "brand_profile.mission", "creative_direction.video.pacing"]))
    .toEqual([{ module: "brand_voice", label: "Brand Voice", count: 2 }, { module: "video_direction", label: "Video Direction", count: 1 }, { module: "compliance", label: "Compliance Rules", count: 1 }]);
});
```

- [ ] **Step 2:** Run `npx vitest run src/lib/journey/kb-copilot/__tests__/review.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement. Reuse `MODULES`, `FIELD_LABELS` and `getFieldPath` for the tab-to-section mapping; do not restate the section names in a second table.
- [ ] **Step 4:** Run. Expected: PASS (5).
- [ ] **Step 5:** Commit `feat(journey): the brand KB's reviewable fields and what the build could not settle`.

### Task 3: Question and approval cards; `waiting` in the thread state

**Files:** Modify `src/lib/journey/thread/schema.ts`, `src/lib/db/copilot-messages.ts`. Create `src/lib/journey/thread/approval.ts`. Tests: extend the thread rows test; create `src/lib/journey/thread/__tests__/approval.test.ts`.

**Interfaces. Produces:**
```ts
// schema.ts: two more members of threadCardSchema
{ kind: "question", field: string, label: string }
{ kind: "approval", what: string, by: string, byId: string /* uuid */ | null }

export type Waiting =
  | { kind: "reply"; label: string }                                                     // rail only
  | { kind: "task"; label: string; text: string; links: { label: string; href: string }[] }
  | { kind: "gate"; label: string; title: string; opens: string; why: string; action: string };
export type ThreadState = { messages: ThreadMessage[]; live: StatusLine[]; suggestions: string[]; waiting: Waiting | null };

// approval.ts
export function approvalMessage(input: { what: string; by: string; byId: string | null; opens?: string }): NewCopilotMessage;
// content: `${by} approved ${what}.` plus ` ${opens}` when given; card as above; suggestions []

// copilot-messages.ts: NewCopilotMessage gains `createdBy?: string | null`; when present it is stored as created_by whatever the role.
```

- [ ] **Step 1: Failing tests**

```ts
it("reads a question card and an approval card", () => {
  expect(rowToThreadMessage(row({ card: { kind: "question", field: "target_audience.age_range", label: "Audience & Casting · Age Range" } })).card?.kind).toBe("question");
  expect(rowToThreadMessage(row({ card: { kind: "approval", what: "the brand KB", by: "Asha", byId: null } })).card).toEqual({ kind: "approval", what: "the brand KB", by: "Asha", byId: null });
});
it("says who approved what, and what that opens", () => {
  expect(approvalMessage({ what: "the brand KB", by: "Asha", byId: null, opens: "Market research is now open." }))
    .toMatchObject({ role: "assistant", content: "Asha approved the brand KB. Market research is now open.", suggestions: [], card: { kind: "approval", what: "the brand KB", by: "Asha", byId: null } });
});
it("stores an assistant message under the person it is about when told to", …);   // insert row has created_by "u1" for { role: "assistant", createdBy: "u1" }
```

- [ ] **Step 2:** Run `npx vitest run src/lib/journey/thread src/lib/db`. Expected: FAIL on the new cases.
- [ ] **Step 3:** Implement. Every place that builds a `ThreadState` gets `waiting: null` for now so the type checks.
- [ ] **Step 4:** Run `npx vitest run src/lib/journey src/lib/db src/hooks/queries` and `npx tsc --noEmit`. Expected: PASS; no new type errors.
- [ ] **Step 5:** Commit `feat(journey): question and approval cards, and a place for "waiting for you" in the thread`.

### Task 4: What the person is waited on, worked out on every read

**Files:** Create `src/lib/journey/kb-copilot/waiting.ts`, `src/lib/journey/kb-copilot/walk.ts` (only `walkOf` in this task). Modify `context.ts`, `load.ts`, `src/lib/journey/thread/load.ts`, `src/components/journey/kb-copilot.tsx` (rail label only). Tests: `__tests__/waiting.test.ts`, `__tests__/walk.test.ts`, extend the `load` tests.

**Interfaces. Consumes:** `listUnreviewedFields` (Task 1), `unreviewedByModule` (Task 2), `Waiting` (Task 3).
**Produces:**
```ts
// context.ts: KbContext gains
clientSlug: string;
/** Dotted paths still to review. Null when there is no built KB in review (nothing was read). */
unreviewed: string[] | null;
export const ASK_OPEN_CHOICE = "Ask me the open questions";
// fallbackSuggestions: [START_BUILD_CHOICE] as today; else [ASK_OPEN_CHOICE] when kbStatus is "in_review", hasVersion, not building and unreviewed has at least one path; else [].

// walk.ts
export type Walk = { asked: string[]; pending: string | null };
/** asked: the distinct fields of question cards after the last status card (a build resets the walk).
 *  pending: the field of the LAST message when that is an assistant question card; else null. */
export function walkOf(messages: ThreadMessage[]): Walk;

// waiting.ts
export const APPROVE_KB_ACTION = "approve-kb";
export function kbWaiting(ctx: KbContext, messages: ThreadMessage[]): Waiting | null;
```
`kbWaiting` rules, in order:
1. Building → null.
2. `kbStatus === "ready"` → null.
3. No version → `{ kind: "reply", label: "Your reply" }` when the last message is the assistant's, else null.
4. In review with `unreviewed === null` → null.
5. A pending question whose field is still in `unreviewed` → `{ kind: "reply", label: "Your answer" }`.
6. `unreviewed.length > 0` → `{ kind: "task", label: "Review 12 fields", text: "12 fields are still to review on the right.", links }` (for one: "Review 1 field", "1 field is still to review on the right."), one link per tab: `{ label: "Brand Voice · 3", href: "/clients/<slug>/kb?section=brand_voice" }`.
7. Otherwise → `{ kind: "gate", label: "Approve the brand KB", title: "Approve the brand KB", opens: "Approving it opens market research.", why: "Only a person can approve it. I never do.", action: APPROVE_KB_ACTION }`.

`loadKbContext`: adds `listUnreviewedFields(client.active_kb_version_id)` to the same `Promise.all`, only when `client.kb_status === "in_review"` and the id is set; otherwise `unreviewed: null` with no read. `threadState` returns `waiting: kbWaiting(ctx, messages)`. `KbCopilot` passes `state?.waiting?.label ?? null` to the shell (null while a turn is in flight) and drops its own "Your reply" rule.

- [ ] **Step 1: Failing tests** (`ctx(overrides)` and `msg(overrides)` helpers as in the part 1 context tests)

```ts
const q = (field: string) => msg({ role: "assistant", card: { kind: "question", field, label: field } });
it("is the gate card when a built KB has nothing left to review", () => {
  expect(kbWaiting(ctx({ kbStatus: "in_review", hasVersion: true, unreviewed: [] }), [])).toMatchObject({ kind: "gate", action: "approve-kb", opens: "Approving it opens market research." });
});
it("names what is left, by tab, with a link to each", () => {
  const w = kbWaiting(ctx({ kbStatus: "in_review", hasVersion: true, clientSlug: "acme", unreviewed: ["brand_profile.tagline", "compliance.disclaimers", "compliance.content_rules"] }), []);
  expect(w).toEqual({ kind: "task", label: "Review 3 fields", text: "3 fields are still to review on the right.",
    links: [{ label: "Brand Voice · 1", href: "/clients/acme/kb?section=brand_voice" }, { label: "Compliance Rules · 2", href: "/clients/acme/kb?section=compliance" }] });
});
it("waits for an answer while its question's field is still unreviewed, and stops once it was reviewed by hand", () => {
  const c = (unreviewed: string[]) => ctx({ kbStatus: "in_review", hasVersion: true, unreviewed });
  expect(kbWaiting(c(["target_audience.age_range"]), [q("target_audience.age_range")])).toEqual({ kind: "reply", label: "Your answer" });
  expect(kbWaiting(c(["brand_profile.tagline"]), [q("target_audience.age_range")])?.kind).toBe("task");
});
it("waits for nothing during a build, on an approved KB, or when the count was not read", () => {
  expect(kbWaiting(ctx({ job: { status: "extracting", phaseMessage: null } }), [])).toBeNull();
  expect(kbWaiting(ctx({ kbStatus: "ready", hasVersion: true, unreviewed: null }), [msg({ role: "assistant" })])).toBeNull();
  expect(kbWaiting(ctx({ kbStatus: "in_review", hasVersion: true, unreviewed: null }), [])).toBeNull();
});
it("a build resets what was asked; only the last message can be a pending question", () => {
  const built = msg({ role: "assistant", card: { kind: "status", lines: [] } });
  expect(walkOf([q("a"), built, q("b"), msg({ role: "user" }), q("c")])).toEqual({ asked: ["b", "c"], pending: "c" });
  expect(walkOf([q("b"), msg({ role: "assistant" })]).pending).toBeNull();
});
// load tests
it("reads what is unreviewed only for a built KB in review", …);   // one call with the active version id; none for kb_status "pending" or "ready"
it("fails the whole read when the unreviewed read fails", …);      // loadKbContext rejects (Review Focus 2)
it("offers 'Ask me the open questions' on a built KB with fields left and nothing asked", …);
```

- [ ] **Step 2:** Run `npx vitest run src/lib/journey`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx vitest run src/lib/journey src/app/api/clients` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(journey): the panel says what it is waiting on, from the stored brand KB`.

### Task 5: Saving fields and approving, on the server

**Files:** Complete `src/lib/kb/field-patch.ts`. Create `src/lib/kb/approve.ts`, `src/app/api/clients/[id]/kb/fields/route.ts`. Modify `src/app/api/clients/[id]/kb/ready/route.ts`, `src/lib/actions/kb.ts` (`markKBReadyAction`). Tests: `src/lib/kb/__tests__/field-patch.test.ts`, `src/lib/kb/__tests__/approve.test.ts`, `src/app/api/clients/[id]/kb/fields/route.test.ts`.

**Interfaces. Produces:**
```ts
// field-patch.ts (pure)
export const kbFieldPatchSchema;                    // { path: string[] (2 or 3 segments), patch: { value?: string | string[] | null, status?, confidence?, evidence_type? } } with at least one key in patch
export function isPatchablePath(path: string[]): boolean;   // a field of the six document sections or of image_analysis, by TraceableBrandKBSchema's shape
export const KB_FIELD_PATCHES_MAX = 60;

// approve.ts (server-only)
export const KB_APPROVED_OPENS = "Market research is now open.";
export async function approveKB(input: { client: ClientRow; userId: string; versionId?: string }):
  Promise<{ ok: true } | { error: string }>;
```
`approveKB`, in order:
1. No active version → `{ error: "There is no brand KB to approve yet." }`.
2. `versionId` given and not the active one → `{ error: "The brand KB was rebuilt. Reload to see the new one." }`.
3. Already `ready` → `{ ok: true }` and nothing else happens.
4. Not fully reviewed (`computeReadyStatus`) → `{ error: "All fields must be reviewed before marking KB ready." }` (today's words).
5. `setKBStatus(ready)`, `revalidatePath` for the client's home and KB pages.
6. Best effort, inside try/catch with a `console.error`: `insertCopilotMessages(client.id, ONBOARDING, userId, [{ ...approvalMessage({ what: "the brand KB", by, byId: userId, opens: KB_APPROVED_OPENS }), createdBy: userId }])`, where `by` is the name from `resolveDisplayNames(client.org_id, [userId])` or `"A teammate"`.

`PATCH /api/clients/:id/kb/fields` body `{ versionId: uuid, patches: KBFieldPatch[] }` (1 to `KB_FIELD_PATCHES_MAX`): 400 `"Nothing to save."` on a bad body, 400 `"That is not a field of the brand KB."` when any path fails `isPatchablePath`, 409 `"The brand KB was rebuilt. Reload to see the new one."` when `versionId !== client.active_kb_version_id`, else `patchKBFields` and `apiOk({ ok: true })`.

`/kb/ready` (body `versionId` now optional) and `markKBReadyAction` both call `approveKB`. The action first resolves the client and returns `{ error: "Client not found." }` when it is missing or outside `resolveOrgId()`: it takes a client id from the browser and has never checked it.

- [ ] **Step 1: Failing tests**

```ts
// field-patch
it("allows document and Image Analysis fields, nothing else", () => {
  expect(isPatchablePath(["target_audience", "age_range"])).toBe(true);
  expect(isPatchablePath(["creative_direction", "video", "pacing"])).toBe(true);
  expect(isPatchablePath(["image_analysis", "aesthetic"])).toBe(true);
  expect(isPatchablePath(["brand"])).toBe(false);
  expect(isPatchablePath(["target_audience", "nope"])).toBe(false);
  expect(isPatchablePath(["target_audience"])).toBe(false);
});
it("refuses a patch that changes nothing", () => expect(kbFieldPatchSchema.safeParse({ path: ["compliance", "disclaimers"], patch: {} }).success).toBe(false));
// approve (db and thread mocked)
it("approves a fully reviewed KB and says who did", …);        // setKBStatus("c1","ready"); one message, content "Asha approved the brand KB. Market research is now open.", createdBy "u1"
it("does nothing the second time", …);                         // client.kb_status "ready" → { ok: true }; setKBStatus and insert not called (Review Focus 5)
it("refuses while a field is unreviewed", …);                  // { error: "All fields must be reviewed before marking KB ready." }, nothing written
it("refuses a version that is no longer the active one", …);
it("still approves when the thread cannot be written", …);     // insert rejects → { ok: true }
it("falls back to 'A teammate' when the name is not found", …);
// fields route
it("saves the patches to the active version", …);              // patchKBFields("v1", patches) → 200
it("refuses a path that is not a KB field", …);                // 400, patchKBFields not called
it("refuses a version that is not the active one", …);         // 409
```

- [ ] **Step 2:** Run `npx vitest run src/lib/kb "src/app/api/clients/[id]/kb"`. Expected: FAIL (missing modules).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same plus `npx vitest run src/lib/actions`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(kb): one approval that records who approved, and a route that saves field reviews one field at a time`.

### Task 6: The copilot reads an answer and the walk goes on

**Files:** Complete `src/lib/journey/kb-copilot/walk.ts`. Modify `turn.ts`, `constants.ts`, `src/prompts/kb-copilot.ts`, `src/app/api/clients/[id]/copilot/kb/turn/route.ts`. Tests: extend `__tests__/walk.test.ts`, `__tests__/turn.test.ts` and the turn route test.

**Interfaces. Consumes:** `ReviewField`, `unsettled`, `reviewFields` (Task 2); `walkOf` (Task 4); `patchKBFields` (Task 1).
**Produces:**
```ts
// constants.ts
export const REVIEW_QUESTIONS_FIRST = 5;
export const QUESTION_VALUE_MAX_CHARS = 280;

// walk.ts
export const CONFIRM_CHOICE = "Yes, that's right"; export const NONE_CHOICE = "There is none"; export const SKIP_CHOICE = "Skip this one";
export const KEEP_ASKING_CHOICE = "Keep asking";   export const REVIEW_REST_CHOICE = "I'll review the rest";
export type TurnWalk = { settled: string[]; skipped: boolean; more: boolean; stopped: boolean };
export function questionMessage(field: ReviewField): NewCopilotMessage;
/** What code adds after a turn (or after a build, `turn: null`): the next question, the "those were
 *  the five" message, the "that is everything" message, or nothing. `fields` is the KB after the turn. */
export function walkMessages(input: { fields: ReviewField[]; walk: Walk; turn: TurnWalk | null }): NewCopilotMessage[];

// turn.ts
// KbActions gains:      setField: (path: string, patch: KBFieldPatch["patch"]) => Promise<void>;
// runKbTurn input gains: review: { fields: ReviewField[]; pending: string | null } | null;   // null unless a built KB is in review
// runKbTurn result gains: walk: TurnWalk;
// prompts
kbCopilotSystem(ctx: KbContext, review: { fields: ReviewField[]; pending: string | null } | null): string;
```
**Question words** (exact):
- Filled text field → `${title}: I inferred "${value}" and could not find it stated. Is that right?`
- Filled list → `${title}: I inferred ${"a, b and c"} and could not find it stated. Is that right?`
- Both carry the choices `[CONFIRM_CHOICE, SKIP_CHOICE]`.
- Empty → `${title}: I could not find this in the sources. What should it be?` with `[NONE_CHOICE, SKIP_CHOICE]`.
- A value over `QUESTION_VALUE_MAX_CHARS` is cut there and ends with `…`.
- Card `{ kind: "question", field: path, label: title }`.

**`walkMessages` rules.** `candidates` = `unsettled(fields)` not in `walk.asked`.
1. `turn === null`: `[questionMessage(candidates[0])]`, or `[]` when none.
2. `turn.stopped`: `[]`.
3. A question was pending, its field is still `needs_review`, it was neither settled nor skipped this turn, and `!turn.more`: ask it again, `[questionMessage(thatField)]`. The person said something else; the question still stands.
4. The walk is active when `turn.more`, or a question was pending. Not active: `[]`.
5. Active and (`turn.more` or `walk.asked.length !== REVIEW_QUESTIONS_FIRST`) and a candidate exists: `[questionMessage(candidates[0])]`.
6. Active, candidates remain, not asked for more, exactly five asked: one message, content `Those were the five I most needed. ${n} more ${n === 1 ? "was" : "were"} inferred or empty. Shall I keep asking, or will you review the rest on the right?`, suggestions `[KEEP_ASKING_CHOICE, REVIEW_REST_CHOICE]`.
7. Active and no candidates: one message, content `That is everything I was unsure about. The rest is a straight review on the right.`

**Tools added to `runKbTurn`** (always defined, so the model can be told no):
- `answer_field({ field: z.enum(all 43 paths), value: z.union([z.string(), z.array(z.string())]) })`
- `confirm_field({ field })`, `skip_question({})`, `keep_asking({})`, `stop_asking({})`

Refusals (exact, given to the model through `tell`):
- No `review` → `"There is no brand KB in review to answer about."`
- The field's status in the turn's own copy is not `needs_review` → `"That field is already reviewed. It can be edited on the right. Proposing changes from the chat comes in a later step."`
- Empty value → `"No value was given."`
- `skip_question` with nothing pending → `"No question is waiting."`

`answer_field` coerces by the field's `kind` (list given a string: split on commas and new lines, trim, drop empties; text given a list: join with `", "`), then `setField(path, { value, status: "edited", evidence_type: "explicit", confidence: "high" })` and says `Saved ${label}.`. `confirm_field` → `setField(path, { status: "approved" })` and says `Marked ${label} as right.`. Both mark the turn's own copy reviewed, push the path to `walk.settled` and set `changed`. `skip_question` sets `skipped`; `keep_asking` sets `more`; `stop_asking` sets `stopped`.

**Prompt.** When `review` is given, `kbCopilotSystem` replaces the "Once the brand KB is built" paragraph. It lists every field as `path | title | stated or inferred | reviewed or not | value`, names the pending question, and says:
- Read the person's answer to the pending question and call `answer_field` (their own words, never a value of your own), `confirm_field` (they agree, or say there is none for an empty field) or `skip_question`.
- `keep_asking` when they want more questions; `stop_asking` when they want to stop.
- The next question is added after your reply by the system, so never ask about another field yourself. Acknowledge in one short sentence.
- Asked why a field says what it says: say whether it was stated in the sources or inferred, and that you cannot point to the page.
- You never approve the KB.

**Route.** When `client.kb_status === "in_review"` and there is an active version, read it in the existing `Promise.all`; `review = { fields: reviewFields(output), pending }`, where `pending` is `walkOf(history).pending` if that field is still `needs_review`, else null. `actions.setField` = `done((path, patch) => patchKBFields(versionId, [{ path: path.split("."), patch }]))`. After a turn that did not throw, and while `!isBuilding(ctx)`: `extra = walkMessages({ fields: fields with the turn's settled paths marked reviewed, walk: walkOf(history), turn: result.walk })`. One insert: the reply (its suggestions emptied when `extra` is not empty), then `extra`.

- [ ] **Step 1: Failing tests**

```ts
// walk.test.ts — f(path, over) builds a ReviewField
it("words a question from the field", () => {
  expect(questionMessage(f("target_audience.age_range", { value: "25 to 40", inferred: true })))
    .toEqual({ role: "assistant", content: 'Audience & Casting · Age Range: I inferred "25 to 40" and could not find it stated. Is that right?',
      suggestions: ["Yes, that's right", "Skip this one"], card: { kind: "question", field: "target_audience.age_range", label: "Audience & Casting · Age Range" } });
  expect(questionMessage(f("compliance.disclaimers", { kind: "list", value: [] })).suggestions).toEqual(["There is none", "Skip this one"]);
  expect(questionMessage(f("target_audience.pain_points", { kind: "list", value: ["a", "b", "c"], inferred: true })).content).toContain("I inferred a, b and c and");
});
it("cuts a long value", …);                                                     // content contains the first 280 characters then "…"
it("asks the first question when a build lands, and nothing when all was stated", …);
it("asks the next field after an answer", …);                                   // pending settled → next candidate
it("asks the same question again when the person said something else", …);      // settled [], not skipped → same field
it("moves on when the pending field was reviewed by hand", …);                  // field reviewed in `fields`, not in settled → next candidate (Review Focus 1)
it("moves on after a skip without asking that field again", …);
it("stops after five and offers to keep asking", …);                            // asked.length 5, pending settled, 3 candidates → "Those were the five I most needed. 3 more were inferred or empty. …", [Keep asking, I'll review the rest]
it("keeps asking past five once asked to, and on every answer after that", …);  // more → 6th; then asked.length 6, pending settled → 7th
it("says so when nothing is left to ask", …);
it("adds nothing after stop_asking, or when no walk is going", …);
// turn.test.ts — scripted model, as in part 1
it("saves the person's answer as an edit they stated", …);       // setField("target_audience.age_range", { value: "30 to 45", status: "edited", evidence_type: "explicit", confidence: "high" }); walk.settled has it; changed
it("approves the value when the person agrees", …);              // setField(path, { status: "approved" })
it("turns one string into a list for a list field, and a list into text for a text field", …);   // Review Focus 3
it("refuses a field that is already reviewed, and writes nothing", …);                           // Review Focus 1
it("refuses to answer a field when no KB is in review", …);
it("has no tool that approves the KB", …);                       // no tool name matches /approve|ready/
// route test
it("stores the reply and then the next question in one insert", …);             // one insert: [reply (suggestions []), question]
it("adds no question when the turn failed, or while a build runs", …);
```

- [ ] **Step 2:** Run `npx vitest run src/lib/journey "src/app/api/clients/[id]/copilot"`. Expected: FAIL on the new cases.
- [ ] **Step 3:** Implement `walk.ts`, then the tools, then the prompt, then the route.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(journey): the brand KB copilot fills a field from the person's answer; code picks and words each question`.

### Task 7: The build says what it found and asks the first question

**Files:** Modify `src/lib/journey/kb-copilot/build-messages.ts`, `src/app/api/webhooks/kb-build/route.ts`. Tests: extend the build-messages test and the webhook route test.

**Interfaces:** `buildSucceededMessage` input gains `account: { total: number; filled: number; inferred: number; empty: number }`. `tellThread(clientId, messages: NewCopilotMessage[])` takes a list. The webhook computes `fields = reviewFields(body.kbOutput)` and writes `[buildSucceededMessage({ …, account: reviewAccount(fields) }), ...walkMessages({ fields, walk: { asked: [], pending: null }, turn: null })]` in one insert, inside the existing "said once" guard.

The account is one paragraph after the first: `I filled ${filled} of ${total} fields.` then, as they apply, ` ${inferred} of them I inferred and could not find stated.` and ` ${empty} I could not find at all.`; when both are zero, ` All of them were stated in the sources.`

- [ ] **Step 1: Failing tests**

```ts
it("says how much it filled, inferred and could not find", () => {
  expect(buildSucceededMessage({ hadWebsite: true, documentCount: 0, skipped: [], account: { total: 43, filled: 36, inferred: 8, empty: 7 } }).content)
    .toContain("I filled 36 of 43 fields. 8 of them I inferred and could not find stated. 7 I could not find at all.");
});
it("says so when everything was stated", …);     // "I filled 43 of 43 fields. All of them were stated in the sources."
// webhook
it("writes the account and the first question together when the build lands", …);   // one insertCopilotMessages call, 2 messages, the second with card.kind "question"
it("writes them once when the delivery is repeated", …);                            // job already terminal → no insert (Review Focus 4)
```

- [ ] **Step 2:** Run `npx vitest run src/lib/journey src/app/api/webhooks/kb-build`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(journey): a finished build says what it found and asks its first question`.

### Task 8: The browser's side of saving fields and approving

**Files:** Create `src/services/kb.service.ts`, `src/hooks/queries/kb.ts`. Test `src/hooks/queries/__tests__/kb.test.ts` (the service with `fetch` stubbed, as `upload-source.test.ts` does).

**Interfaces. Produces:**
```ts
// kb.service.ts — each calls one route and returns through readJson
kbService.patchFields(clientId: string, body: { versionId: string; patches: KBFieldPatch[] }): Promise<{ ok: true }>
kbService.approve(clientId: string, versionId?: string): Promise<{ ok: true }>
// hooks/queries/kb.ts
export function usePatchKbFields(clientId: string);   // useMutation over patchFields; onSuccess refreshes the copilot thread (useRefreshCopilotThread)
export function useApproveKb(clientId: string);       // useMutation over approve; onSuccess refreshes the thread and calls router.refresh()
```
Neither keeps a cache: the KB still reaches the page from the server component.

- [ ] **Step 1: Failing tests:** `patchFields` sends `PATCH /api/clients/c1/kb/fields` with the JSON body; `approve` sends `POST /api/clients/c1/kb/ready` with `{}` or `{ versionId }`; a non-ok response rejects with the route's error text.
- [ ] **Step 2:** Run `npx vitest run src/hooks/queries/__tests__/kb.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(kb): service and mutations for saving field reviews and approving`.

### Task 9: Save writes only what changed, changes can be discarded, and a save tells the copilot

Decided by Cyril on 2026-11-16: the review screen keeps its draft and its "Save changes" button. It gains "Discard changes". A save tells the copilot at once.

**Files:** Create `src/lib/kb/review-sync.ts`. Modify `src/components/kb/kb-onboarding-review-step.tsx`, `src/app/clients/[id]/kb/page.tsx`, `src/lib/actions/kb.ts` (remove `saveKBOutputAction`) and its cases in `src/lib/actions/kb.test.ts`. Keep its label in `src/lib/auth/impersonation-audit-view.ts`: old audit rows still name it. Test `src/lib/kb/__tests__/review-sync.test.ts`.

**Interfaces. Consumes:** `usePatchKbFields` (Task 8), `KBFieldPatch` (Task 1).
**Produces:**
```ts
// review-sync.ts (pure)
/** A short string that changes whenever any field of the six document sections changes. */
export function kbRevision(kb: TraceableBrandKB): string;
/** One patch per field the person changed in the draft: every field, Image Analysis included, whose
 *  value or status differs from the saved copy. The patch carries the draft's value, status,
 *  confidence and evidence_type. Empty when nothing changed. */
export function changedFields(draft: TraceableBrandKB, saved: TraceableBrandKB): KBFieldPatch[];
/** After the server's copy changed (the copilot filled a field, a teammate saved). `saved` takes the
 *  server's document sections. `draft` takes them too, except the fields the person has changed and
 *  not yet saved, which stay as the person has them. Image Analysis is left alone in both. */
export function adoptServerKb(draft: TraceableBrandKB, saved: TraceableBrandKB, server: TraceableBrandKB): { draft: TraceableBrandKB; saved: TraceableBrandKB };
```

**The screen:**
- `page.tsx` passes `kbRevision={kbRevision(output)}`.
- `kb`, `savedKB` and `dirty` stay as they are.
- **Save changes** sends only what changed: `patches = changedFields(kb, savedKB)`, then `usePatchKbFields(clientId).mutateAsync({ versionId, patches })`, then `setSavedKB(kb)` and the "Changes saved" toast. A failure shows the route's own message (a rebuilt KB says to reload) and keeps the draft. `saveKBOutputAction` is removed: a save no longer writes the whole KB, so it can never write an old draft over a field the copilot or a teammate has filled since.
- **A save tells the copilot.** `usePatchKbFields` already re-reads the copilot thread when it succeeds (Task 8), so the panel's count, its pending question and the gate card are right the moment the save lands. The copilot's own picture of the KB is read fresh from the stored KB on every turn, so its next reply is built on what was just saved.
- **Discard changes:** while `dirty`, an outline `Button size="sm"` labelled "Discard changes" sits beside "Save changes". It sets the draft back to `savedKB`. Disabled while a save is in flight. No confirmation dialog *(my call: one click, like closing an editor without saving)*.
- When `kbRevision` differs from the last one taken (adjusting state during render, the way `useServerState` does): `const next = adoptServerKb(kb, savedKB, initialKB)`, then `setKB(next.draft)` and `setSavedKB(next.saved)`.
- Image Analysis keeps today's logic (the stored section is merged into the draft as it arrives).
- `selectedModule` starts from, and follows, the `section` search param when it names a module (`useSearchParams`).
- `handleMarkReady`, the header and the per-field handlers are unchanged.

**Known consequence of keeping the button** (accepted with the decision): the copilot and the panel only know a review once it is saved. Until then the panel may still wait on a field already approved in the draft, and the gate card appears after the save that settles the last field. If the copilot fills a field the person has also changed in the draft, the person's value wins at the next save.

- [ ] **Step 1: Failing tests**

```ts
it("changes when any document field changes, and not for Image Analysis", () => {
  expect(kbRevision(kbWith({}))).toBe(kbRevision(kbWith({})));
  expect(kbRevision(kbWith({ "brand_profile.tagline": { status: "approved" } }))).not.toBe(kbRevision(kbWith({})));
  expect(kbRevision(withImageAnalysis(kbWith({}), { aesthetic: "new" }))).toBe(kbRevision(kbWith({})));
});
it("finds only the fields the person changed, Image Analysis included", () => {
  const saved = kbWith({});
  const draft = withImageAnalysis(kbWith({ "brand_profile.tagline": { status: "approved" }, "target_audience.age_range": { value: "30 to 45", status: "edited" } }), { aesthetic: { status: "rejected" } });
  expect(changedFields(draft, saved).map((p) => p.path.join("."))).toEqual(["brand_profile.tagline", "target_audience.age_range", "image_analysis.aesthetic"]);
  expect(changedFields(draft, saved)[1].patch).toMatchObject({ value: "30 to 45", status: "edited" });
  expect(changedFields(saved, saved)).toEqual([]);
});
it("takes the server's fields into both copies and keeps what the person has not saved yet", () => {
  const saved = kbWith({});
  const draft = kbWith({ "brand_profile.tagline": { status: "approved" } });                           // unsaved review
  const server = kbWith({ "target_audience.age_range": { value: "30 to 45", status: "edited" },        // the copilot filled it
                          "brand_profile.tagline": { value: "new line", status: "edited" } });         // and a teammate changed the same field
  const next = adoptServerKb(draft, saved, server);
  expect(next.draft.target_audience.age_range).toMatchObject({ value: "30 to 45", status: "edited" });
  expect(next.draft.brand_profile.tagline.status).toBe("approved");                                    // the person's unsaved review stays
  expect(next.saved.brand_profile.tagline.value).toBe("new line");
  expect(changedFields(next.draft, next.saved).map((p) => p.path.join("."))).toEqual(["brand_profile.tagline"]);   // still unsaved, still theirs to save or discard
  expect(next.draft.image_analysis).toBe(draft.image_analysis);
});
```

- [ ] **Step 2:** Run `npx vitest run src/lib/kb/__tests__/review-sync.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement `review-sync.ts`. Run. Expected: PASS (3).
- [ ] **Step 4:** Change the screen and the page. Remove `saveKBOutputAction` and its tests.
- [ ] **Step 5:** Run `npx vitest run src/lib/kb src/lib/actions`, `npx tsc --noEmit`, `npx eslint src/components/kb src/lib/kb src/lib/actions`. Expected: PASS; no new type or lint errors. The component has no automated test; it is covered by the browser check.
- [ ] **Step 6:** Commit `feat(kb): Save writes only the fields that changed and tells the copilot; changes can be discarded`.

### Task 10: The panel shows the question's field, what is left, the gate card and who approved

**Files:** Create `src/components/journey/thread-waiting.tsx`, `src/components/journey/thread-gate-card.tsx`. Modify `thread-message.tsx`, `kb-copilot.tsx`.

**Interfaces. Produces (stage-neutral; nothing here names the brand KB):**
```tsx
ThreadWaiting({ waiting, onGate, gateBusy }: { waiting: Waiting | null; onGate: (action: string) => void; gateBusy: boolean })
ThreadGateCard({ title, opens, why, busy, onApprove }: { title: string; opens: string; why: string; busy: boolean; onApprove: () => void })
```
- `reply` and null render nothing in the thread (the rail carries the label).
- `task`: an eyebrow "Waiting for you" (`.text-eyebrow`), the text, and one outlined `Button size="xs"` per link rendered as a `next/link` (`render` prop, `scroll={false}`).
- `gate`: a card (`rounded-xl border border-border bg-card shadow-card p-4`): the title in `font-display`, `opens`, then `why` in `text-muted-foreground`, and one primary `Button` with the title as its label, disabled with a spinner while `busy`.
- `thread-message.tsx`: a `question` card shows its `label` as an eyebrow above the words; an `approval` card shows the words as a done line (`Check` icon, `text-success-text`), not a bubble.
- `kb-copilot.tsx`: under the messages and the reply choices, when no turn is in flight, `<ThreadWaiting waiting={state.waiting} onGate={…} gateBusy={approve.isPending} />`, where `approve = useApproveKb(clientId)` and `onGate` calls `approve.mutate(undefined, { onError: (e) => toast.error(e.message) })` for `APPROVE_KB_ACTION` only. The scroll-to-end effect also runs when `state.waiting?.kind` changes.

- [ ] **Step 1:** Implement the two components and the two edits. (The journey panel's components have no tests in this codebase; the rules they show are tested in Tasks 4 and 6.)
- [ ] **Step 2:** Run `npx tsc --noEmit` and `npx eslint src/components/journey`. Expected: clean.
- [ ] **Step 3:** Run the whole suite, `npx vitest run`, output to a file; read the tail. Expected: everything passes except the two known failures in `src/app/api/nodes/[id]/{composite,image}-generate/route.test.ts`.
- [ ] **Step 4:** Commit `feat(journey): the panel shows what it is waiting on, the approval as a gate card, and who approved`.

### Task 11: Record the decisions

**Files:** Modify `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7, `docs/superpowers/specs/2026-11-12-copilot-journey-brand-kb-design.md` (§2.3 and §7: the 2026-11-16 decision on Save and Discard, and the calls above that Cyril kept).

- [ ] **Step 1:** Append, in the log's format (Decision / Why / Rejected / Refines / Originated):
  - **D498** The brand KB review screen keeps its draft and "Save changes", and gains "Discard changes"; a save writes only the fields that changed, and tells the copilot. Rejected: saving each review the moment it is made (Cyril, 2026-11-16); saving the whole KB from the draft, which writes old values over the copilot's answers. Refines D318.
  - **D499** In a review walk, code chooses and words each question and decides when the walk stops; the model reads the answer and calls a tool; a tool never writes a reviewed field. Refines D497.
  - **D500** "Waiting for you" and the gate card are worked out on each thread read and never stored; an approval is one function for every caller and writes a "who approved" message that keeps the approver's name as it was.
- [ ] **Step 2:** Commit `docs(adr): D498 to D500, the brand KB review walk`.

---

## Browser check (Cyril, after migration 0064 on the test database)

1. Build a new client's KB. When it lands, the panel says how many fields it filled, inferred and could not find, and asks one question with its field named above it.
2. Press "Yes, that's right": the field on the right turns approved without a reload, and the next question appears.
3. Type a different value as the answer: the field shows it, marked edited.
4. Type something unrelated ("what is a brand KB?"): the copilot answers, and the same question is asked again.
5. Approve the pending question's field on the right instead of answering, and press "Save changes": the rail stops saying "Your answer" at once.
6. After five questions the copilot offers "Keep asking" and "I'll review the rest".
7. "I'll review the rest": the panel shows "Waiting for you" with one button per tab and its count. A button opens that tab. The counts fall each time you save.
8. Approve the last field and save: the gate card appears. Fold the panel: the rail says "Approve the brand KB".
9. Press the gate card's button: the thread says "<your name> approved the brand KB. Market research is now open." and the Market research tab unlocks.
10. Ask the copilot to approve the KB for you, on another client in review: it says only you can.
11. On an approved KB, tell the copilot to change a field: it says to edit it on the right.
12. Two browser windows on the same KB in review: approve one field in each and save both. Reload: both fields are approved. Neither save undid the other.
13. Approve a few fields without saving: "Discard changes" appears. Press it: the fields go back and both buttons give way to "Mark KB Ready".
14. With an unsaved approval on the right, answer a copilot question about another field: the answer appears on the right and your unsaved approval is still there.

---

## Outcome (2026-11-16): built, reviewed once, fixed

All eleven tasks are built on `feat/copilot-journey`. One independent review found no critical issue and three important ones; one fix pass followed. Whole suite after the fixes: 5,610 passed, 2 failed (the two that were failing before this work), 3 skipped. Nothing here has been run in a browser, and migration 0064 has not been run against a database.

### Where the build departed from this plan

- After a save the thread gets a line, "Manual edits saved: N fields." (Cyril, after the plan). It is a new card kind, `note`; the walk and the reply choices look past it.
- `approveKB` checks readiness from the list of unreviewed paths, not by downloading the KB.
- `patch_kb_fields` creates a field an older stored KB lacks (Content Rules), when its section exists.
- A question still waiting is asked again even when the person also says "keep asking".
- The unused whole-KB save (`saveKBOutputAction` and its two database helpers) is removed.

### What the review changed

- **A question keeps its reply buttons while images are collected or studied.** Only a running build hides them.
- **The copilot cannot overwrite a review saved while it was thinking.** The database checks that the field is still unreviewed at the moment of the write (`p_only_unreviewed`), and the tool says the field is already reviewed.
- **A save or an approval is never a thread's first line.** The opening is stored first (`ensureOpening`).
- **"Save changes" no longer appears with nothing to save** after a KB that gained a field was refreshed.

### Left for later, on purpose

- A save that lands while an Image Analysis poll or a server refresh arrives can leave untouched fields marked unsaved.
- An approval of an Image Analysis field carries the value the screen had; a rewrite by a background run in the same few seconds is overwritten.
- Two teammates approving at the same instant write two "approved" lines.
- A "what is left" link opens its tab once; after switching tabs by hand the same link does nothing.
- A question's "Yes, that's right" stays on offer after its field was saved by hand; pressing it gets "already reviewed" and the next question.
- "Ask me the open questions" is offered whenever any field is unreviewed, even when none is left to ask; a question lost to a failed turn is not asked again.
- The turn route reads the client row twice; the fields and ready routes resolve the caller twice.
- No route test for "no question while a build runs".

### For Cyril to decide

- The copilot may fill or approve any unreviewed field the person speaks about, not only the one it asked about. "All good, approve everything" could approve every field. Approving the KB itself is still only a person's click.
- If a field has an unsaved change on the page and the person also answers it in the chat, the page's value wins at the next save.
- Every save writes a line in the thread, on approved KBs too.
- The field's name appears twice on a question: above it and at the start of the sentence.
