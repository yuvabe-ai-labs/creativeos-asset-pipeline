# CreativeOS Copilot — design spec, part 2 (the verb vocabulary + composing complex commands)

> **Status:** part as-built, part designed-not-built, on branch `worktree-minimal-agent`.
> **Continues** [part 1](../superpowers/specs/2026-07-14-creativeos-copilot-design.md) — its §1–§7
> (interaction model, handles, three-call architecture) and §8 (the workflow-with-one-agentic-cell
> direction) still govern; its §9 as-built delta ends 2026-07-12. This part covers what shipped
> **after** §9 and the **playbook runner** design that composes it all.
> Engineering principles + research grounding live in
> [copilot-primitives-and-patterns.md](./copilot-primitives-and-patterns.md) (P1–P8, cited below).
> Draft decisions in §7; assign D-numbers on merge.

---

## 1. Summary

Part 1 ended with a copilot that could see, talk, reference, and execute four single actions. Part 2
completes the **verb vocabulary** (connect, universal open/add, selection grounding) and designs the
step that makes it a product: **complex commands** — "generate an image reference for shot 2" —
decomposed into routed, slot-filled, human-interruptible runs of those same verbs.

The governing idea (P4): the copilot is a **command bar over playbooks**, not an agent. The model
judges at predefined points (which playbook; which slot values); code owns every step sequence; the
human owns every generation. Perceived agency without architectural agency.

---

## 2. As-built delta since part 1 §9 *(2026-07-12 → 07-13)*

### 2.1 The completed verb set (P1)

| Verb | Execution | Notes |
|---|---|---|
| `create_script_node` | instant | unchanged from part 1 |
| `parse_script` | instant | unchanged — auto-fans-out shots (D21) |
| `add_node` | instant | now **places at the viewport center** (was: right of rightmost — off-screen on populated canvases) and **opens the node's detail view** via `setFocusedNodeId` |
| `open_node` | instant | now works for **File and Draw** (they joined the `focusedNodeId` pattern). Known gap: **script + kb still unwired** (§5) |
| `connect_nodes` | instant | **new** — `{from: handle[], to: handle}`; client resolves handles, validates each pair with `canConnect`, wires via the store, reports wired / rejected / unknown in one message |

**`canConnect(sourceType, targetType)`** is now the single connection rule (extracted to
`canvas-nodes.ts`), consumed by manual drag, the drag affordance, `connect_nodes`, and the
focus-view `+ Add` — one definition, four call sites. Ordered on purpose; no symmetric variant.

### 2.2 Composer & grounding upgrades (P2, P3)

- **@-mentions insert handle + name** (`@FILE-469A Product image`) — legible history, inline model
  grounding; `resolveMentions` unchanged (the regex stops at the space).
- **`@selected`** — a picker row that expands the current canvas selection into handle tokens at
  insert time. Keyboard-navigable as index 0 of one unified picker list (synthetic rows must join
  the navigation model, not just the render).
- **↑ history** — ArrowUp on an empty composer recalls the last sent message (shell-style; guarded
  so it never fights caret movement or the picker's own ↑).

### 2.3 The manual twin — `+ Add` on focus views

`<AddConnection targetId targetType connectedIds>` (`src/components/nodes/add-connection.tsx`):
a **dashed-border primary chip** (design-system "Add" affordance) on the "Connected · N" rail
header of the **prompt, image-gen, and video-prompt** focus views. Opens a searchable combobox of
candidate sources — filtered by the *same* `canConnect`, excluding self and already-connected —
with **48px thumbnails** for image-bearing nodes (image Files, Draw sketches, Image Gen stills;
the third identity leg: uuid for machines, handle for referencing, **pixels for recognition**).
Picking wires `candidate → this` through the same store method as the chat verb. One connection
semantics, two entry points (chat + canvas). *(video-gen deferred: its Connected header is itself
a collapse toggle — needs its own pass.)*

### 2.4 Proposal card removed — the gate moved to where it was owed (P7)

`add_node` went **instant** (blast-radius rule: cheap/reversible/structural), and the read-only
"Proposed action" card + dead approve/reject machinery were deleted. The HITL gate now has **no
home in the current UI by design** — it lands in the runner (§4) as *generation steps pause*.

### 2.5 Merged with main

The branch carries main's **D40 left-rail focus views** (image-gen, video-prompt — same rail
pattern as prompt) and the **Google Drive picker**. `AddConnection` was re-landed onto the new rail
headers; all three views share the same header + chip pattern.

### 2.6 File map delta (adds to part 1 §9.4)

| File | Role |
|---|---|
| `src/lib/copilot/actions.ts` | `CopilotAction` union (now 5 verbs), pure helpers: `planConnections`, `expandSelected`, `resolveNodeTarget`, … (unit-tested) |
| `src/components/nodes/add-connection.tsx` | The `+ Add` chip + combobox (shared across focus views) |
| `src/lib/canvas-nodes.ts` | `canConnect` — the single connection rule |

---

## 3. The playbook library — common complex actions & the tool audit

The complex commands a designer actually says, decomposed (scope evidence for §4):

| # | Command | Decomposes into | Verbs ready? |
|---|---|---|---|
| 1 | "Turn this script into shots" | create → parse → fan-out | ✅ fully built |
| 2 | **"Create an image reference for shot X"** *(v1 playbook)* | elicit shot/refs → add prompt → wire → open → **human: Generate** → add image-gen → wire → open → **human: Generate** | ✅ verbs ready; needs the runner |
| 3 | "Make a video from this image" | add video-prompt → wire → open → **human** → add video-gen → wire → **human** | ✅ verbs ready |
| 4 | "Add a reference file/note for X" | add file/text → wire → open → **human: upload/type** | ⚠️ `file`/`draw` missing from `ADDABLE_NODE_TYPES` |
| 5 | "Compose variations for shot X" (D28) | open Composer → **human: role + compose + pick** | ✅ (open + human steps) |
| 6 | "Set up shot 3 like shot 2" | read shot 2's wiring → wire same refs into 3 | recipe-code, defer |

**Gaps found by the audit (fold into the runner plan as prep tasks):**
1. Wire **script + kb** to `focusedNodeId` (same one-line fix as File/Draw) — `open_node` must be
   universal before playbooks lean on it.
2. Add **`file` + `draw`** to `ADDABLE_NODE_TYPES` — unblocks playbook 4.

Verdict: the verb set is ~90% complete — the payoff of P1. Playbooks 1/3/4 are fast-follow *data*
once the runner exists.

---

## 4. Composing the verbs — the playbook runner *(designed, not built)*

Full build spec: [2026-07-13-copilot-playbook-runner-design.md](../superpowers/specs/2026-07-13-copilot-playbook-runner-design.md).
The shape, grounded in P4–P7:

```
sentence → ROUTE (run_playbook tool: pick playbook, extract slots)
         → FRAME (code checks completeness; authored questions elicit missing slots;
                   replies resolve client-first via @-mentions / "none")
         → RUN   (cursor over predefined steps; copilot steps fire existing recipes;
                   HUMAN steps pause the run and resume via store predicates)
```

- **Human actions are first-class steps** (P5, LangGraph guidance) with pure `done(state)`
  predicates — **level-triggered, Kubernetes-style** (P6): the store subscription only wakes the
  runner; the predicate reads *current state*, so pre-completed steps auto-pass, duplicate events
  no-op, and the focus views need zero new code.
- **Generation steps always pause** (P7) — the L6 HITL gate, landed as a pause in the run.
- **The run card** in chat: a live checklist (✓ done · → YOUR TURN with instruction · ○ pending ·
  ✕ cancel), rendered from store state. **Chat for choices with no surface** (which shot); **canvas
  for actions with one** (attach refs via `+ Add`, generate via the focus view).
- **One run at a time, session-scoped; cancel keeps created nodes.**
- v1 ships **one playbook** (`image-for-shot` — the §8.4 lane slice); the machinery is general.

## 5. Known limitations & gaps

- `open_node` no-ops on **script/kb** (unwired `focusedNodeId`) — prep task, §3.
- `add_node` can't create **file/draw** — prep task, §3.
- Programmatic connects (`connect_nodes`, `+ Add`) validate `canConnect` but **bypass the
  cardinality guards** that live only in manual-drag `isValidConnection` (e.g. script→one prompt) —
  pre-existing pattern, recorded for whoever owns generation-step invariants.
- Level-triggered predicates can't tell *who* satisfied them — fine under the single-writer canvas
  assumption (v1).
- Part 1's chip non-determinism (LLM-enumerated) still open; unchanged.

## 6. Deferred

- Playbooks 3–6 (data adds once the runner ships); whole-reel parallel runs (part 1 §8.5).
- The §8.3 **agentic repair cell** — plugs into one step's `run` later (P8 seam).
- video-gen focus view `+ Add`; run durability across reloads (Trigger.dev if ever needed).
- Editing a run in flight; concurrent runs.

## 7. Draft decisions (stage into the ADR log on merge; extends part 1 §7/§8.7/§9.5)

- **`connect_nodes` + `+ Add` share one validated connect semantics** — same `canConnect`, same
  store call, chat and canvas as two entry points. *Rejected:* per-surface ad-hoc wiring.
- **One `canConnect(src,tgt)` helper, four call sites.** *Rejected:* re-inlined map checks; a
  symmetric variant (direction is load-bearing).
- **`@selected` is insert-time expansion to visible handle tokens.** *Rejected:* a live token
  resolved at send (selection drift; resolver special-case).
- **Agent-created nodes place at the viewport center.** *Rejected:* cursor position (undefined for
  chat-driven actions); rightmost-plus-offset (off-screen).
- **`add_node` executes instantly; the HITL gate lives at generation, inside runs.** *Refines* the
  part 1 §9.5 blast-radius decision; *removes* the proposal card.
- **Complex commands are routed playbooks with code-checked slot frames and level-triggered human
  steps** (P4–P6). *Rejected:* model-authored step lists; LangGraph/AG-UI infrastructure;
  edge-triggered "user did X" events; polling the model to check progress.
