# Scripting in the panel, part 1 (piece 4.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Scripts tab's copilot offers "Start a script", and a script's copilot panel is on its page at every stage, sharing the client panel's shell, with a link back to the client and a "Waiting for…" line.

**Architecture:** `JourneyPanelShell` becomes the one copilot shell: its fold key, fold default, rail line, sticky offset, narrow-screen behaviour and an optional back link become props. `CopilotChat` (the script's panel) moves onto that shell and gains a read-only mode (no composer, no suggestions, cards without buttons). At Generate it stays live through `useGenerateState`; at Visualise, In review and Approved the server page hands it the saved thread as props, so no new client request exists. What is waiting is one pure function, `scriptWaiting`, tested against the spec's table.

**Tech Stack:** Next.js (app router, server components), React 19, TanStack Query v5, Base UI shadcn primitives, Tailwind v4, Vitest (`environment: "node"`, `renderToStaticMarkup`).

**Spec:** [docs/superpowers/specs/2026-11-20-copilot-scripting-panel-design.md](../specs/2026-11-20-copilot-scripting-panel-design.md)

## Global Constraints

- Nothing about the script copilot's behaviour at Generate changes: its steps, wording, cards, drafting, saved messages, suggestions (spec §4 anti-goals). Only the panel's chrome (header, rail, foot line) changes.
- A script's saved thread is never moved, copied or rewritten. No migration in this piece.
- No message box where nothing answers: the composer appears only at Generate.
- No second request for the thread on load and no new polling on any script page (spec §5).
- Copy, exactly: "Start a script", "Paste a script", the back link "‹ {client name}" (rendered as a `ChevronLeft` icon + the client name), and the waiting lines of spec §3.4 word for word.
- Fold memory: Generate keeps today's key (`creativeos.scriptCopilot.collapsed.{scriptId}`, starts open) so existing folds survive; the later stages use `creativeos.scriptCopilot.collapsed.{scriptId}.after-generate`, starting folded.
- AGENTS.md: shadcn primitives only (links as `Button` with `render={<Link …/>}` and `nativeButton={false}`), Lucide icons at 1.5 stroke, colors through the CSS variables, motion easing `cubic-bezier(0.22,1,0.36,1)`.
- The ADR log file is CRLF: append in place and keep CRLF.

## Review Focus

1. **A reopened script** (Visualise → Generate): the Generate memory, not the later one, decides the fold, and the cards' buttons come back for a still-pending proposal. Pinned by Task 1 (`scriptFoldKey`) and Task 4 (`actions` present → buttons).
2. **A pending proposal or import left when the script was marked final**: shown without buttons and without a "status" badge it never had. Pinned by Task 4.
3. **A locked client with an empty script that has already said something** (a pasted script mid-import is not empty): "paste your script" only while there is no draft. Pinned by Task 2.
4. **The copilot answering** at Generate: the rail reads "Copilot", never a stale line, and folding stays refused. Pinned by Task 2 (busy → null) and Task 3 (busy disables Hide).
5. **The narrow screen at the later stages**: the panel is not drawn below `lg`, while at Generate it still stacks. Pinned by Task 3 (`narrow` classes).

---

### Task 1: Two fold memories per script

**Files:**
- Modify: `src/hooks/use-copilot-collapsed.ts`
- Modify: `src/lib/journey/frame.ts` (add beside `journeyFoldKey`)
- Test: `src/hooks/use-copilot-collapsed.test.ts`, `src/lib/journey/__tests__/frame.test.ts`

**Interfaces:**
- Produces:
  - `readCopilotCollapsed(key: string, fallback?: boolean): boolean` (fallback defaults to `false`)
  - `useCopilotCollapsed(key: string, fallback?: boolean): readonly [boolean, (next: boolean) => void]`
  - `scriptFoldKey(scriptId: string, stage: ScriptStage): string`: `scriptId` at `"generate"`, `` `${scriptId}.after-generate` `` at every other stage.

- [ ] **Step 1: Write the failing tests**

In `use-copilot-collapsed.test.ts`, add:
```ts
it("starts folded where the caller says so, until the person chooses", () => {
  vi.stubGlobal("localStorage", fakeStorage());
  expect(readCopilotCollapsed("s4.after-generate", true)).toBe(true);
  writeCopilotCollapsed("s4.after-generate", false);
  expect(readCopilotCollapsed("s4.after-generate", true)).toBe(false);
});
```
In `frame.test.ts`, add:
```ts
describe("scriptFoldKey", () => {
  it("keeps Generate's memory as it was, and one for every later stage", () => {
    expect(scriptFoldKey("s1", "generate")).toBe("s1");
    expect(scriptFoldKey("s1", "visualise")).toBe("s1.after-generate");
    expect(scriptFoldKey("s1", "in_review")).toBe("s1.after-generate");
    expect(scriptFoldKey("s1", "approved")).toBe("s1.after-generate");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/hooks/use-copilot-collapsed.test.ts src/lib/journey/__tests__/frame.test.ts`
Expected: FAIL (`scriptFoldKey` is not exported; the fallback is ignored).

- [ ] **Step 3: Implement**

Thread `fallback` through `readCopilotCollapsed` and `useCopilotCollapsed` to `readStoredFlag` / `useStoredFlag`. Rename the parameter from `scriptId` to `key` and fix the file's comment (it now holds every copilot fold). Add `scriptFoldKey` to `frame.ts`, importing `ScriptStage` from `@/lib/scripts/constants`.

- [ ] **Step 4: Run them to see them pass**

Same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-copilot-collapsed.ts src/hooks/use-copilot-collapsed.test.ts src/lib/journey/frame.ts src/lib/journey/__tests__/frame.test.ts
git commit -m "feat(copilot): a script's panel has two fold memories, Generate's and the later stages'"
```

---

### Task 2: What a script is waiting on

**Files:**
- Create: `src/lib/scripts/copilot/waiting.ts`
- Modify: `src/lib/scripts/copilot/suggestions.ts` (extract the "who plays whom" lookup)
- Test: `src/lib/scripts/copilot/__tests__/waiting.test.ts`

**Interfaces:**
- Produces, from `suggestions.ts`: `castStillAsked(state: GenerateState): CastMember | undefined`, the body of today's `asking`/`member` lookup (lines 102–106), which `suggestionsFor` then calls. `CastMember` is the existing type in `@/lib/scripts/schema`.
- Produces, from `waiting.ts`:
  ```ts
  export type ScriptWaiting = { kind: "reply" | "change" | "task" | "client"; line: string };
  export type ScriptWaitingInput =
    | { stage: "generate"; state: GenerateState; locked: boolean; busy: boolean }
    | { stage: "visualise" | "in_review" }
    | { stage: "approved"; hasCanvas: boolean };
  export function scriptWaiting(input: ScriptWaitingInput): ScriptWaiting | null;
  ```
  `line` is the whole sentence the panel and rail show. `reply` and `change` are only on the rail (the question or card is already the last thing in the thread, as on the brand KB's `ThreadWaiting`); `task` and `client` are also drawn at the foot of the thread (Task 5).

Decision order at Generate (first match wins): busy → `null`; any message whose card is a `proposal` or `import` with `status: "pending"` → change; no draft and `locked` → task "paste your script"; no draft → reply; `castStillAsked(state)` → reply; `state.openItems.length > 0` → task "settle the open items"; otherwise task "mark the script final".

- [ ] **Step 1: Write the failing tests**

One `it` per row of spec §3.4, each asserting the exact object, for example:
```ts
expect(scriptWaiting({ stage: "generate", state: unwritten, locked: false, busy: false }))
  .toEqual({ kind: "reply", line: "Waiting for you: answer the copilot" });
expect(scriptWaiting({ stage: "generate", state: unwritten, locked: true, busy: false }))
  .toEqual({ kind: "task", line: "Waiting for you: paste your script" });
expect(scriptWaiting({ stage: "generate", state: importAsking, locked: true, busy: false }))
  .toEqual({ kind: "reply", line: "Waiting for you: answer the copilot" });
expect(scriptWaiting({ stage: "generate", state: withPendingProposal, locked: false, busy: false }))
  .toEqual({ kind: "change", line: "Waiting for you: review the change" });
expect(scriptWaiting({ stage: "generate", state: writtenWithOpen, locked: false, busy: false }))
  .toEqual({ kind: "task", line: "Waiting for you: settle the open items" });
expect(scriptWaiting({ stage: "generate", state: writtenClear, locked: false, busy: false }))
  .toEqual({ kind: "task", line: "Waiting for you: mark the script final" });
expect(scriptWaiting({ stage: "generate", state: writtenClear, locked: false, busy: true })).toBeNull();
expect(scriptWaiting({ stage: "visualise" }))
  .toEqual({ kind: "task", line: "Waiting for you: finish the storyboard and send it for review" });
expect(scriptWaiting({ stage: "in_review" })).toEqual({ kind: "client", line: "Waiting for the client's review" });
expect(scriptWaiting({ stage: "approved", hasCanvas: false }))
  .toEqual({ kind: "task", line: "Waiting for you: create the canvas" });
expect(scriptWaiting({ stage: "approved", hasCanvas: true })).toBeNull();
```
Build the states from `reel-01.json` (`scriptDocSchema.parse`) and `EMPTY_BRIEF` / `EMPTY_NOTES`. `importAsking`: `brief.imported: true`, a doc whose lead has no `avatarId`, last message an assistant message starting with `IMPORT_REPLY_PREFIX`. Add one more test: a resolved (`accepted`) proposal does not count as waiting.

Also run the existing `suggestions` tests unchanged after the extraction: they pin that `suggestionsFor` still behaves the same.

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/lib/scripts/copilot/__tests__/waiting.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `castStillAsked` and `scriptWaiting`**

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run src/lib/scripts/copilot/__tests__/waiting.test.ts src/lib/scripts/copilot/__tests__/suggestions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scripts/copilot/waiting.ts src/lib/scripts/copilot/suggestions.ts src/lib/scripts/copilot/__tests__/waiting.test.ts
git commit -m "feat(scripts): what a script is waiting on at each stage, worked out from the script as stored"
```

---

### Task 3: One shell for every copilot panel

**Files:**
- Modify: `src/components/journey/journey-panel-shell.tsx`
- Modify: `src/components/journey/journey-rail.tsx`
- Modify callers: `src/components/journey/journey-panel.tsx`, `src/components/journey/kb-copilot.tsx`
- Test: `src/components/journey/__tests__/journey-panel-shell.test.tsx` (create)

**Interfaces:**
- Consumes: `useCopilotCollapsed(key, fallback)` (Task 1).
- Produces:
  ```ts
  JourneyPanelShell(props: {
    foldKey: string;                 // replaces `slug`
    foldedByDefault?: boolean;       // default false
    waitingLine: string | null;      // replaces `waiting`: the whole sentence; null shows "Copilot"
    busy?: boolean;
    back?: { label: string; href: string };
    placement?: "frame" | "page";    // default "frame"
    narrow?: "hidden" | "stacked";   // default "hidden"
    actions?: ReactNode;
    children: ReactNode;
  })
  JourneyRail(props: { line: string | null; onExpand: () => void })
  ```
- `placement: "frame"` keeps today's `lg:top-20 lg:h-[calc(100vh-6.5rem)]`; `"page"` takes the script chat's current `lg:top-6 lg:h-[calc(100vh-12rem)]`.
- `narrow: "hidden"` keeps today's `hidden … lg:flex`; `"stacked"` takes the script chat's current `flex min-h-[32rem]` and hides the fold button below `lg` (as `copilot-chat.tsx` does today, `hidden lg:inline-flex`).
- `back` renders first in the header: `Button variant="ghost" size="xs"` with `render={<Link href={back.href} />}`, `nativeButton={false}`, `ChevronLeft` at 1.5 stroke, then `back.label`. The Sparkles + "Copilot" heading follows it.
- Callers: `JourneyPanel` passes `foldKey={journeyFoldKey(slug)}` and `waitingLine={guide.waiting && \`Waiting for you: ${guide.waiting}\`}`; `KbCopilot` the same with its `waiting`. `ClientFrame` is unchanged (it reads `journeyFoldKey` with the default fallback).

- [ ] **Step 1: Write the failing tests**

With `renderToStaticMarkup` (the server snapshot is the fallback, so `foldedByDefault` renders the rail):
- `foldedByDefault` shows the rail with the whole line: markup contains `"Waiting for the client&#x27;s review"` and not `"Waiting for you: Waiting"`.
- `waitingLine: null` folded shows `"Copilot"` on the rail.
- `back` renders a link with `href="/clients/chupps/scripts"` and the text `"Chupps"`.
- `narrow: "stacked"` renders no `hidden` class on the section and `min-h-[32rem]`; the default renders `hidden` and `lg:flex`.
- `placement: "page"` renders `lg:top-6`; the default renders `lg:top-20`.
- `busy` renders the "Hide copilot" button disabled.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/components/journey/__tests__/journey-panel-shell.test.tsx`
Expected: FAIL (unknown props / missing markup).

- [ ] **Step 3: Implement the props and update both callers**

- [ ] **Step 4: Run the shell tests and the type check**

Run: `npx vitest run src/components/journey/__tests__/journey-panel-shell.test.tsx` then `npx tsc --noEmit`
Expected: PASS; tsc reports only the known error in `src/app/api/nodes/[id]/image-generate/route.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/components/journey/journey-panel-shell.tsx src/components/journey/journey-rail.tsx src/components/journey/journey-panel.tsx src/components/journey/kb-copilot.tsx src/components/journey/__tests__/journey-panel-shell.test.tsx
git commit -m "refactor(copilot): one panel shell; its fold, rail line, offsets, narrow screen and back link are the caller's"
```

---

### Task 4: The script's cards can be read-only

**Files:**
- Modify: `src/components/scripts/generate/copilot-chat-message.tsx`, `copilot-angles-card.tsx`, `copilot-confirmation-card.tsx`, `copilot-proposal-card.tsx`, `copilot-import-card.tsx`
- Test: `src/components/scripts/generate/__tests__/copilot-chat-message.test.tsx`

**Interfaces:**
- Produces: `CopilotChatMessage({ message, actions, avatars }: { message: ScriptMessage; actions: ChatActions | null; avatars: CopilotAvatar[] })`. `actions: null` is read-only.
- Each card's handler becomes optional (`onPick?`, `onWrite?`, `onResolve?`); without it the card draws no buttons. A resolved proposal or import keeps its badge either way; a pending one read-only shows neither buttons nor badge. `disabled` stays as it is.

- [ ] **Step 1: Write the failing tests**

In `copilot-chat-message.test.tsx`, for each card kind render one message twice, with `actions` and with `null`:
- angles: `"Go with A"` present / absent;
- confirmation: `"Write it"` present / absent;
- pending proposal: `"Accept"` and `"Reject"` present / absent, and read-only contains no `"Applied"`;
- accepted proposal read-only still contains `"Applied"`;
- pending import: `"Replace the draft"` present / absent.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/components/scripts/generate/__tests__/copilot-chat-message.test.tsx`
Expected: FAIL (`null` actions throws on `actions.busy`).

- [ ] **Step 3: Implement**

In `CopilotChatMessage`, pass each handler only when `actions` is present and use `actions?.busy ?? false` for `disabled`.

- [ ] **Step 4: Run the card tests**

Run: `npx vitest run src/components/scripts/generate/__tests__`
Expected: PASS (the existing card tests are unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/components/scripts/generate
git commit -m "feat(scripts): the script copilot's cards draw no buttons where their actions cannot apply"
```

---

### Task 5: The script's panel moves onto the shell

**Files:**
- Modify: `src/components/scripts/generate/copilot-chat.tsx`
- Modify: `src/components/scripts/generate/generate-workspace.tsx`
- Modify: `src/app/clients/[id]/scripts/[scriptId]/page.tsx` (only the `GenerateWorkspace` call: pass `client`)
- Delete: `src/components/scripts/generate/copilot-rail.tsx`
- Test: `src/components/scripts/generate/__tests__/copilot-chat.test.tsx` (create)

**Interfaces:**
- Consumes: `JourneyPanelShell` (Task 3), `scriptFoldKey` (Task 1), `ScriptWaiting` / `scriptWaiting` (Task 2), `CopilotChatMessage` with `actions: ChatActions | null` (Task 4), `SCRIPT_STAGE_LABEL` from `@/lib/scripts/constants`.
- Produces:
  ```ts
  CopilotChat(props: {
    client: { name: string; slug: string };
    scriptId: string;
    stage: ScriptStage;
    messages: ScriptMessage[];
    avatars: CopilotAvatar[];
    waiting: ScriptWaiting | null;
    /** Generate only: the composer, the suggestions and the cards' buttons. null is read-only. */
    live: { actions: ChatActions; suggestions: Suggestion[] } | null;
  })
  GenerateWorkspace({ client: { id: string; name: string; slug: string }, initialState, initialReview, locked })
  ```
  (`GenerateWorkspace`'s `clientId` prop becomes `client.id`.)
- Shell settings: `foldKey={scriptFoldKey(scriptId, stage)}`, `foldedByDefault={stage !== "generate"}`, `waitingLine={waiting?.line ?? null}`, `busy={live?.actions.busy ?? false}`, `back={{ label: client.name, href: \`/clients/${client.slug}/scripts\` }}`, `placement="page"`, `narrow={stage === "generate" ? "stacked" : "hidden"}`.
- The foot, between the scroll area and the composer: when `waiting` is `task` or `client`, an eyebrow (`.text-eyebrow text-muted-foreground`) with the stage's label, shown at the later stages only, and the line in `text-sm`. Nothing for `reply` / `change`.
- `GenerateWorkspace` computes `waiting = scriptWaiting({ stage: "generate", state, locked, busy: actions.busy })`.

- [ ] **Step 1: Write the failing tests**

With `renderToStaticMarkup`:
- read-only (`live: null`, stage `"visualise"`): no `<textarea`; contains `"Visualise"` and `"Waiting for you: finish the storyboard and send it for review"`; the back link `href="/clients/chupps/scripts"`; the saved messages' text.
- read-only folds by default: the markup has the rail (`aria-label="Show copilot"`).
- live (stage `"generate"`, `waiting` of kind `reply`): has a `<textarea`, no foot line, no `"Generate"` eyebrow, and is not folded.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/components/scripts/generate/__tests__/copilot-chat.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement, delete `copilot-rail.tsx`, update `GenerateWorkspace` and the page's one call**

Keep the scroll-to-newest effect. For its `collapsed` dependency, `CopilotChat` reads `useCopilotCollapsed(scriptFoldKey(scriptId, stage), stage !== "generate")` itself: the stored-flag store is shared, so it reads the same value as the shell, and the shell needs no new prop.

- [ ] **Step 4: Run the tests, the type check and the suite for the Generate folder**

Run: `npx vitest run src/components/scripts src/lib/scripts` then `npx tsc --noEmit`
Expected: PASS; only the known tsc error.

- [ ] **Step 5: Commit**

```bash
git add -A src/components/scripts/generate "src/app/clients/[id]/scripts/[scriptId]/page.tsx"
git commit -m "feat(scripts): the script's copilot shares the client panel's shell, with a way back and what is waiting"
```

---

### Task 6: The panel on every page a script has after Generate

**Files:**
- Modify: `src/app/clients/[id]/scripts/[scriptId]/page.tsx`

**Interfaces:**
- Consumes: `CopilotChat` with `live: null` (Task 5), `scriptWaiting` (Task 2), `listScriptMessages(clientId, scriptId)` and `listCopilotAvatars(clientId)` from `@/lib/db/script-generate`.

What the page does after Generate:
- Load `listScriptMessages` and `listCopilotAvatars` in one `Promise.all` together with the page's first independent read (`loadVisualiseBoard` / `loadApprovedVersion` / `getScriptCanvas`, whichever the stage needs): no extra sequential round trip. No TanStack Query here: the thread is read-only at these stages and is server data handed down as props, so nothing is fetched or polled in the browser. A reopen already refreshes the route, which renders Generate's live panel.
- `waiting`: `scriptWaiting({ stage: "visualise" | "in_review" })`, or `{ stage: "approved", hasCanvas: Boolean(scriptCanvas) }`.
- Layout: `main` is `max-w-[96rem]` at every stage after Generate. Under the breadcrumb, one grid `grid items-start gap-6 lg:grid-cols-[auto_minmax(0,1fr)]`: the panel, then the existing content (`TeamReviewBoard`, `ApprovedReviewBoard`, or the canvas action + `ScriptView`, the last wrapped in `mx-auto w-full max-w-6xl` so the plain view keeps its width).

- [ ] **Step 1: Implement**

- [ ] **Step 2: Type check and the full suite**

Run: `npx tsc --noEmit` then `npx vitest run`
Expected: only the known failures (`composite-generate` and `image-generate` "refuses a deprecated model", the known tsc error). Re-run the Kling test alone if it times out.

- [ ] **Step 3: Count the calls**

Read the page top to bottom and confirm: at Visualise, the new reads add two queries run in parallel with an existing read, and the browser makes no new request on load (no `useQuery` for the thread on these pages). Write the count in the commit body.

- [ ] **Step 4: Commit**

```bash
git add "src/app/clients/[id]/scripts/[scriptId]/page.tsx"
git commit -m "feat(scripts): the script's copilot is on its page at Visualise, In review and Approved, folded, read-only"
```

---

### Task 7: The Scripts tab's copilot offers to start a script

**Files:**
- Modify: `src/lib/journey/guide.ts`, `src/components/journey/journey-panel.tsx`, `src/components/journey/journey-guide.tsx`
- Test: `src/lib/journey/__tests__/guide.test.ts`, `src/components/journey/__tests__/journey-panel.test.tsx` (create)

**Interfaces:**
- Produces: `Guide` gains `newScript: { label: "Start a script" | "Paste a script" } | null`. Scripts open → `{ label: "Start a script" }`; scripts locked → `{ label: "Paste a script" }` with `next` still "Go to market research"; market research guides → `null`.
- `JourneyPanel({ clientId, slug, guide })` renders `NewScriptButton({ clientId, clientSlug: slug, label: guide.newScript.label })` when `newScript` is set, before `next`; `JourneyGuide` passes `client.id`. Because the guide for "current" uses the same `guideFor`, Avatars and Brand assets get the button too while scripts are the client's stage.

- [ ] **Step 1: Write the failing tests**

- `guide.test.ts`: the two scripts cases expect `newScript: { label: "Start a script" }` and `{ label: "Paste a script" }`; the three market cases expect `newScript: null`.
- `journey-panel.test.tsx`: mock `@/components/scripts/new-script-button` (`vi.mock`) to a `<span data-new-script>{label}</span>`, then assert the open guide renders `"Start a script"`, the locked guide renders `"Paste a script"` and `"Go to market research"`, and a market guide renders no `data-new-script`.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/lib/journey/__tests__/guide.test.ts src/components/journey/__tests__/journey-panel.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run to see them pass, then the type check**

Same command, then `npx tsc --noEmit`. Expected: PASS; only the known tsc error.

- [ ] **Step 5: Commit**

```bash
git add src/lib/journey/guide.ts src/lib/journey/__tests__/guide.test.ts src/components/journey/journey-panel.tsx src/components/journey/journey-guide.tsx src/components/journey/__tests__/journey-panel.test.tsx
git commit -m "feat(copilot): the Scripts guide offers Start a script (Paste a script while locked)"
```

---

### Task 8: Records

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (§7, CRLF)
- Modify: `docs/qa/2026-11-18-copilot-journey-manual-qa.md`
- Modify: `docs/superpowers/specs/2026-11-19-copilot-journey-RESUME-HERE.md`
- Modify: `docs/superpowers/specs/2026-11-20-copilot-scripting-panel-design.md` (status line)

- [ ] **Step 1: ADR D511** "A script's copilot panel is on its page at every stage, read-only after Generate", with Decision / Why / Rejected (a message box nothing answers; one fold memory per script; a client-side query for the thread at later stages) / Refines (D494, D500) / Originated → the 4.1 spec. Next free becomes D512.
- [ ] **Step 2: QA section 9** with checks for: Start a script (open and locked, and on Avatars/Brand assets); the panel folded at Visualise, In review, Approved and the plain approved view, each with its line; the back link; cards without buttons; reopen brings the message box and Generate's fold back; narrow screen at each stage; no new request on a later-stage load (Network tab).
- [ ] **Step 3: Update RESUME-HERE** (4.1 built, next is 4.2's spec, D512 free) and the spec's status line; add an Outcome to this plan with any review findings left for later.
- [ ] **Step 4: Commit**

```bash
git add docs
git commit -m "docs(copilot): 4.1 built: D511, QA section 9, resume-here"
```
- [ ] **Step 5: Journal entry 30** on the team design journal (https://claude.ai/artifact/7yU5A2TiWyxDLTwgaXpjHC) and republish.
