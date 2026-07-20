# Copilot playbook runner — complex commands as routed, slot-filled, interruptible workflows

> **Status:** design, not yet built. Branch `worktree-minimal-agent`. Extends the copilot as-built
> spec (`2026-07-14-creativeos-copilot-design.md` §8–§9). §10's decisions are recorded in the ADR
> log as **D67–D71** (2026-07-16). Built + merged to main 2026-07-16.

---

## 1. Summary

Today the copilot executes **single actions** ("add a node", "connect @a to @b"). This design makes
it execute **complex commands** — "generate an image reference for shot 2" — by:

1. **Routing** the sentence to a **playbook** (a predefined multi-step recipe),
2. **Slot-filling** — extracting provided inputs (which shot, which refs), asking for missing ones,
3. **Running** the steps one by one, where some steps are the **human's** (write the instruction,
   click Generate) — the run *pauses* there and *resumes* when the store shows the step is done.

**Taxonomy (settled during brainstorm, grounded in Anthropic's Building Effective Agents):** this is
a **workflow, not an agent** — routing and elicitation are model judgments at *predefined decision
points*; the model never authors step N+1 while standing on step N. The test: after the route
resolves, every remaining step can be numbered in advance. Loops (the slot-check loop) don't make it
an agent; unpredictable step-choice would. Genuine agency stays reserved for the §8.3 image-repair
cell, later.

**Research base:** Anthropic workflow patterns (routing); task-oriented-dialogue slot-filling /
"Ask-when-Needed" (don't execute until required args are confirmed; ask only when the missing field
affects correctness); LangGraph interrupt/resume (human actions as *first-class named steps* with
checkpointed state). No framework needed: the copilot's brain is client-side beside the Zustand
store, so "interrupt" = the runner's cursor not advancing, "checkpoint" = a small state object in
the store, "observe the human" = a store subscription — the network boundary LangGraph/AG-UI exist
to bridge doesn't exist here.

---

## 2. The three pieces

```
user sentence
     │
╔════▼═════╗   one model decision (existing actions route, new tool)
║  ROUTER  ║   run_playbook(name, slots-as-extracted)
╚════╤═════╝
     │  frame incomplete → ELICIT (ask the slot's predefined question, fill from reply, repeat)
     │  frame complete ─────────────┐
     ▼                              ▼
╔══════════════════ RUNNER (client, deterministic) ══════════════════╗
║  step 1 (copilot: add prompt node)      → runs recipe, advance     ║
║  step 2 (copilot: connect shot + refs)  → runs recipe, advance     ║
║  step 3 (copilot: open prompt view)     → runs recipe, advance     ║
║  step 4 (HUMAN: write instruction, Generate)                       ║
║           → pause; store subscription waits on done(state)         ║
║  step 5 (copilot: add image-gen, wire, open) → advance             ║
║  step 6 (HUMAN: review & Generate)      → pause … done             ║
╚═════════════════════════════════════════════════════════════════════╝
```

### 2.1 Playbooks (data, not model output)

A playbook is a **hardcoded step list** in client code — the flowchart drawn in advance. New file
`src/lib/copilot/playbooks.ts`:

```ts
export type SlotSpec = {
  key: string;                      // "shot", "refs"
  required: boolean;
  ask: string;                      // elicitation prompt, Dialogflow-style, e.g.
                                    // "Which shot? Mention it like @SHOT-1A2B — or select it and say @selected."
  kind: "node-handle" | "node-handles" | "none-ok";
};

export type PlaybookStep =
  | { actor: "copilot"; label: string; run: (ctx: RunContext) => void }
  | { actor: "human";   label: string; instruction: string;
      done: (state: CanvasState, ctx: RunContext) => boolean };

export type Playbook = {
  name: string;                     // "image-for-shot"
  description: string;              // shown to the router model as the tool-enum description
  slots: SlotSpec[];
  steps: PlaybookStep[];
};
```

`RunContext` carries the filled slots plus ids the run creates as it goes (e.g. the new prompt
node's id, written by step 1, read by steps 2–4). Human steps' `done` predicates are **pure
functions of store state** — the "eyes":

| Waiting on | Predicate reads |
|---|---|
| prompt generated | the created prompt node's `data.parsed` is non-empty |
| image generated | the image-gen node's `data.parsed` (URL) is non-empty |
| refs attached (optional gate) | ≥1 edge into node X from a file/draw node |

**v1 ships ONE playbook** — `image-for-shot`, the §8.4 lane slice:
resolve shot → *(elicit refs, optional)* → add prompt node → connect shot + refs → open prompt
focus view → **human: instruction + Generate** → add image-gen node → connect prompt + image refs →
open image-gen → **human: review + Generate** → done. The machinery is general; more playbooks
(add-reference, video-for-shot) are later data additions, not architecture.

### 2.2 Router + elicitation

- The **actions route** gains one tool: `run_playbook({ name, slots })` — `name` from an enum of
  registered playbook names (with descriptions), `slots` an object of whatever the sentence
  provided (handles as `TYPE-XXXX` strings, arrays for multi). The route guards the enum and passes
  it through, same as every existing tool. Existing single-action tools stay — small commands don't
  become runs.
- **Frame completeness is checked by CODE, not the model** (client, against the playbook's
  `SlotSpec`s): deterministic, testable, and the elicitation prompt is authored per-slot, not
  improvised. Missing required slot → the run starts in `eliciting` status and the copilot posts
  the slot's `ask`.
- **Elicitation replies resolve client-first, model-fallback:** a reply containing `@HANDLE`
  tokens or the word "none"/"skip" (for `none-ok` slots) fills the slot with **zero model calls**
  (reusing `resolveMentions`). Anything else goes to the actions route with history + a system hint
  ("the user is answering: which shot?") so the model extracts the handle. Inferable slots are
  never asked: exactly one shot on canvas → it's the shot (Ask-when-Needed: ask only when the
  missing field affects correctness).

### 2.3 The runner

New hook-level module `src/lib/copilot/runner.ts` + wiring in `use-copilot-chat.ts`. State lives in
the **canvas store** (one new slice), so the chat panel, canvas, and future surfaces all see it,
and the run survives the panel closing:

```ts
type PlaybookRun = {
  playbook: string;
  slots: Record<string, string | string[]>;
  created: Record<string, string>;   // ids of nodes the run created ("promptNodeId", …)
  stepIndex: number;
  status: "eliciting" | "running" | "waiting-human" | "done" | "cancelled";
};
```

Mechanics — deliberately ~30 lines, no framework:

- **Advance loop:** while the current step is `actor: "copilot"`, run its recipe (the existing
  ones: `addNodeAndOpen`-style create, `connectHandles`, open-via-`setFocusedNodeId`) and
  increment. Hitting a human step → `status: "waiting-human"`, post the step's `instruction` to
  chat.
- **Resume ("the eyes"):** ONE `storeApi.subscribe` — active only while `waiting-human` — runs the
  step's `done(state, ctx)` on store changes; true → advance (post "✓ <label> — moving on"), and
  continue the loop.
- **One run at a time.** A new complex command while a run is live → the copilot asks: finish or
  cancel? ("cancel"/✕ → `status: "cancelled"`, subscription dropped; created nodes stay — they're
  real work, and delete is one click).
- **Aborts:** a predicate's target node deleted mid-run → cancel with a message. No timeouts —
  human steps are human-paced (the checklist card keeps the run visible/dismissable instead).

### 2.4 The chat surface — the run card

One new message kind: a **run card** (checklist), the Shape-of-AI "show work" surface:

```
▸ Image for SHOT-557C
  ✓ Added prompt node PRM-93AF
  ✓ Connected SHOT-557C, FILE-08F1 → PRM-93AF
  ✓ Opened the prompt editor
  → YOUR TURN — write the instruction and hit Generate. I'll continue when it's done.
  ○ Create the image node
  ○ Generate the image                                            [✕ cancel]
```

Done copilot steps show what they *did* (with handles); the active human step is highlighted with
its instruction; pending steps are dim. The card updates in place (it renders from the store's
`PlaybookRun`, not from message history). **Interaction split (decided):** answers that are
*choices with no surface* happen in chat (which shot — via @-mention/`@selected`/reply); answers
that are *actions with a surface* happen on the canvas (attach refs via the `+ Add` picker or
drag-wire; generate via the focus view's button) — the runner detects them via predicates, chat
only narrates.

### 2.5 The HITL gate lands where it was owed

Generation steps are **human steps** — the run never auto-fires a generation. This is the "real L6"
gate (blast-radius rule: real cost + irreversibility pause; structural steps run instantly), landing
exactly where the curriculum parked it, as a *pause* rather than an approve-button card.

---

## 3. What the model does / never does

| Moment | Model's job | Code's job |
|---|---|---|
| Sentence arrives | Route: pick playbook, extract provided slots | Guard enum; check frame completeness |
| Slot missing | (fallback only) extract a handle from a free-text reply | Ask the predefined question; resolve @-mentions/"none" first |
| Running | **nothing** | Execute recipes, advance cursor |
| Human step | **nothing** | Watch store predicate, resume |

The model never orders steps, never decides "what's next", never observes mid-run. That's what
keeps this debuggable — and what makes the eventual §8.3 agentic cell a *contained* addition
(swap one copilot step's `run` for a bounded loop) rather than a rewrite.

## 4. Error handling

| Case | Behavior |
|---|---|
| Route matches no playbook | Existing behavior — single-action tools, else prose reply |
| Required slot unanswerable (e.g. no shots on canvas) | Cancel elicitation with a helpful message ("There are no shots yet — parse a script first") |
| Elicitation reply doesn't resolve | Re-ask once with the format hint; second miss → keep waiting, user can cancel |
| Node deleted mid-run / invalid connection at run-time | Cancel run with a message naming the step that failed |
| New complex command mid-run | Ask: cancel the current run first? |
| Panel closed / reopened | Run persists (store state); card re-renders from `PlaybookRun` |

## 5. Testing

Pure and unit-tested (mirroring `actions.test.ts`): frame completeness (`missingSlots(playbook,
slots)`), elicitation reply resolution (mention / "none" / fallback flag), runner advance logic
(`nextState(run, playbook, storeState)` as a pure reducer — given a run and a store snapshot,
return the advanced run + the recipes to fire). The store subscription and recipes stay thin
wrappers, verified in the browser. Playbook `done` predicates are pure → each gets a unit test.

## 6. Out of scope (named, deferred)

- More playbooks beyond `image-for-shot` (machinery is general; playbooks are data).
- Concurrent runs; cross-session/page-reload durability (state is session-scoped; Trigger.dev is
  the durability answer *if ever needed*, not LangGraph).
- The §8.3 agentic repair loop ("is this image good enough") — plugs in later as one step's `run`.
- Free-composition planning (model authoring arbitrary step lists) — rejected (§10).
- Editing a run in flight (reordering/skipping steps).

## 7. Files

| File | Role |
|---|---|
| `src/lib/copilot/playbooks.ts` | Playbook + slot types, the `image-for-shot` playbook, registry |
| `src/lib/copilot/runner.ts` | Pure runner reducer + frame-completeness + reply resolution |
| `src/lib/canvas-store.ts` | `playbookRun` slice (state + set/advance/cancel) |
| `src/app/api/copilot/actions/route.ts` | `run_playbook` tool (enum from registry) |
| `src/components/canvas/use-copilot-chat.ts` | Router dispatch, elicitation turns, subscription wiring |
| `src/components/canvas/copilot-run-card.tsx` | The checklist card |

## 8. Interaction copy discipline

Elicitation questions and human-step instructions are **authored strings in the playbook** (not
model-generated): consistent voice, testable, and they always name the expected input format
(`@SHOT-…`, `@selected`, "none"). The copilot's improvisation is confined to prose Q&A, where it
already lives.

## 9. Spec self-review notes

Checked: no placeholders; §2.2/§2.3 agree that completeness-checking is client code; §2.5 consistent
with the blast-radius ADR; scope = one plan (machinery + one playbook + one card). Ambiguity
resolved explicitly: elicitation is client-first/model-fallback; one run at a time; cancelled runs
keep created nodes.

## 10. Decisions — recorded in the ADR log as **D67–D71** *(2026-07-16)*

- **Complex copilot commands are routed workflows (playbooks), not agent plans.** The model picks a
  playbook and fills slots at predefined decision points; code owns all step sequencing. *Why:*
  every target flow's steps are enumerable in advance (Anthropic: routing is a workflow pattern);
  debuggability and cost. *Rejected:* model-authored step lists; an autonomous planning agent.
- **Slot-filling is frame-based with authored elicitation.** Required/optional slots with
  per-slot questions checked by code; model only extracts values (client-first resolution for
  mentions/"none"). *Why:* the 20-year-old task-oriented-dialogue pattern; deterministic asks;
  Ask-when-Needed. *Rejected:* letting the model decide when/what to ask.
- **Human actions are first-class playbook steps with store-predicate completion.** The run pauses
  on a human step and resumes when a pure predicate over the canvas store goes true. *Why:*
  LangGraph's HITL guidance (human steps as named nodes) with zero framework — the client-side
  brain already shares state with the UI. *Rejected:* LangGraph/AG-UI infrastructure; polling the
  model to "check if the user is done".
- **Generation steps always pause (the L6 HITL gate).** *Why:* blast-radius rule — cost +
  irreversibility gate; structural steps stay instant. *Refines:* the add_node-instant decision.
- **One run at a time, session-scoped, cancel keeps created nodes.** *Why:* v1 simplicity; created
  nodes are real work. *Rejected:* multi-run concurrency; page-reload durability (Trigger.dev
  later if ever justified).
