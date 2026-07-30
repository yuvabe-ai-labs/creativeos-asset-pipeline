# Copilot primitives & patterns — the engineering principles, their sources, and our implementations

> **Status:** reference doc, not a build spec. Captures the principles discovered while building the
> copilot (branch `worktree-minimal-agent`) and the research that grounds them — so future decisions
> cite a pattern, not a vibe. Companion docs: the as-built PRDs
> (part 1: `../superpowers/specs/2026-07-14-creativeos-copilot-design.md`; part 2:
> `./copilot-design-part-2.md`) and the runner build spec
> (`../superpowers/specs/2026-07-13-copilot-playbook-runner-design.md`).

Each primitive below follows the same shape: **the principle → the industry pattern & source → how
we implement it → why it matters here.**

---

## P1. Small verbs first — complex actions are compositions

**Principle.** Build a small vocabulary of single-purpose actions before any orchestration. A
complex command is never a new capability — it is a *sequence* of existing verbs.

**Pattern & source.** Anthropic's *Writing Tools for Agents*: a few consolidated, well-described
tools beat one-per-store-action sprawl; tools should take semantic ids, not UUIDs.

**Ours.** The verb set, each with a server tool + a client recipe:
`create_script_node`, `parse_script` (auto-fans-out), `add_node` (+ opens the detail view),
`open_node` (drives the shared `focusedNodeId` signal), `connect_nodes` (validated by
`canConnect`). Handles (`SHOT-1A2B`) are the semantic ids.

**Why it matters.** When "generate an image for shot 2" arrived, the audit found the verb set
~90% complete — the complex feature needs almost no new verbs, only sequencing. Small verbs are
also individually testable, individually gateable (see P7), and individually usable from chat.

---

## P2. Stable references — the handle is the shared vocabulary

**Principle.** Chat, model, and canvas must name nodes identically, with names that never re-point.

**Pattern & source.** *Writing Tools for Agents* ("semantic identifiers"); classic UI stable-id
practice. Positional names ("image 2") rot on add/delete; uuid-derived names cannot.

**Ours.** `nodeHandle(node)` = `TYPE-XXXX` from the immutable uuid — zero storage, pure function,
shown on every card header, used by @-mentions, chips, tools, and elicitation answers. Encode and
decode share one function, so they cannot disagree.

**Why it matters.** Every later primitive (routing slots, elicitation replies, run narration)
speaks handles. Agent-created nodes are never titled — the handle is what makes them referable.

---

## P3. Human-directed grounding — the human names what matters

**Principle.** The human points; the copilot never guesses relevance or volunteers pickers.

**Pattern & source.** Our own D-decision (part 1 §7), reinforced by the "Ask-when-Needed" research
below: model enumeration is unreliable; human selection is exact.

**Ours.** `@`-mention picker (handle + name inserted as visible text), `@selected` (expands the
canvas selection into handle tokens at insert time — transparent, editable, resolver-unchanged),
`resolveMentions` (client-side, zero model calls).

**Why it matters.** Slot-filling (P4) inherits this for free: "which shot?" is answered by
`@SHOT-1A2B` or `@selected`, resolved deterministically before any model fallback.

---

## P4. The decomposition principle — routing + slot-filling, not planning

**Principle.** A complex natural-language command decomposes as: **route** to a predefined playbook
→ **fill** its slot frame (ask for what's missing) → **run** the steps. The model judges at two
predefined points (which playbook; what slot values) and never authors the step sequence.

**Patterns & sources.**
- **Routing** is one of Anthropic's five *workflow* patterns (*Building Effective Agents*):
  "classifying inputs and directing them to specialized downstream tasks." Choosing which flowchart
  to run ≠ improvising the flowchart.
- **Workflow vs agent, the crisp test.** Anthropic: workflows = "predefined code paths"; agents =
  "LLMs dynamically direct their own processes." Loops don't make an agent — evaluator-optimizer is
  a loop and is classified a workflow. The test we settled on: *in a workflow you can number the
  steps before running; in an agent you can only number the iterations.* A workflow may contain
  many model decisions, but each sits at a diamond you drew in advance; an agent's decisions draw
  the diagram as it goes.
- **Slot-filling** is the 20-year-old task-oriented-dialogue pattern (Dialogflow/RASA lineage; ACL
  survey): an intent maps to a frame of required/optional slots; the system *elicits* missing slots
  with authored prompts and fulfills only when the frame is complete.
- **Ask-when-Needed** (*Learning to Ask*, arXiv 2409.00557): don't call the tool until required
  args are confirmed; ask when the missing field affects correctness or cost; infer what's
  inferable (one shot on canvas → no "which shot?" question).

**Ours.** One new tool `run_playbook(name, slots)` on the existing actions route (routing); frame
completeness checked by **code** against the playbook's `SlotSpec`s, with authored per-slot
questions (slot-filling); elicitation replies resolve client-first (@-mentions / "none"),
model-fallback. Full design: the runner spec §2.2.

**Why it matters.** Perceived agency (say anything, it understands and asks smart questions) is a
UX property; architectural agency (the model steering step-to-step) is a cost — debuggability,
latency, money. Decomposition delivers the first without paying the second.

---

## P5. The runner — interrupt/resume with human steps as first-class steps

**Principle.** Multi-step execution that alternates copilot actions and human actions is a state
machine that *pauses* on human steps and *resumes* when they complete. Human actions are named
steps in the plan, not implicit waits.

**Patterns & sources.**
- **LangGraph interrupts** (docs.langchain.com): every HITL flow reduces to `interrupt()` → full
  state checkpointed → human acts → `Command(resume=value)` continues exactly where paused. Their
  strongest guidance for agent+human flows: *model the human's actions as their own named nodes*
  connected by conditional edges — not while-loops buried inside agent steps.
- **Temporal** (`wait_condition` + signals): a durably-suspended workflow resumes on a signal or
  when a predicate over workflow state goes true; best practice is **idempotent handlers** ("if we
  already have a decision, return") so replays/duplicates can't double-fire.
- **Do we need the framework? No.** Both exist to bridge a network/process boundary: a server-side
  graph must be suspended, persisted, and re-entered. Our copilot's brain runs **in the client,
  beside the Zustand store** — "pause" is a cursor not advancing; "checkpoint" is a small object in
  the store; "resume" is a subscription firing. The boundary the frameworks bridge doesn't exist
  here. (If runs ever must survive page reloads / run unattended, this repo's durability answer is
  Trigger.dev — already installed — not LangGraph.)

**Ours.** `PlaybookRun { playbook, slots, created, stepIndex, status }` in the canvas store; an
advance loop that runs copilot steps via existing recipes and parks on human steps
(`status: "waiting-human"`); a run card in chat renders the checklist live. Runner spec §2.3–2.4.

**Why it matters.** The pause points are also where the HITL gate lands (P7) — the pattern and the
safety rule are the same mechanism.

---

## P6. The eyes — level-triggered predicates, not events (the Kubernetes pattern)

**Principle.** The copilot "sees" that the human finished a step by evaluating a **pure predicate
over current store state** — never by listening for the moment it happened.

**Patterns & sources.**
- Three candidate architectures for observation:
  1. **Polling** (computer-use agents re-screenshot the world) — laggy, wasteful; in LLM form you'd
     pay model calls to ask "is the user done yet?".
  2. **Edge-triggered events** ("the user clicked Generate!") — brittle: the **lost-signal
     problem**. Miss the event (panel closed, run not started yet, re-render race) and the run
     wedges forever waiting for a moment that already passed.
  3. **Level-triggered reconciliation** — the **Kubernetes controller pattern** (HackerNoon
     *Level Triggering and Reconciliation in Kubernetes*; the Kubebuilder book): "a level-triggered
     controller does not care about any of the events — it just looks at the cluster *right now*
     and asks if the desired state is met." **Events only wake you up; decisions read current
     state.** The watch stream triggers the reconciler, but the reconciler ignores the event
     payload and re-reads the latest state. Missed, duplicate, and late events are all harmless.
- **Temporal's `wait_condition(predicate)`** is the same idea in durable-workflow form.
- **AG-UI protocol** (CopilotKit; adopted by LangChain/Microsoft/AWS) is the industry's answer for
  *server-side* agents: a bidirectional event stream around a **shared state layer** both agent and
  UI read/write. It validates the shape — and shows why we need none of it: our Zustand store *is*
  the shared state layer, already on the same side of the wire as the copilot.

**Ours.** One `storeApi.subscribe(...)`, active only while `waiting-human`, evaluates the active
step's `done(state, ctx)` — e.g. "the created prompt node's `parsed` is non-empty", "an edge exists
into node X". The subscription is the wake-up (edge); the predicate is the decision (level).

**Why it matters — three robustness properties this buys:**
1. **The pre-completed step.** The user generates the prompt *before* the run reaches that step →
   the predicate is already true on arrival → the step completes instantly. Edge-triggered designs
   wedge here; this *will* happen in real use.
2. **Idempotent advance** (Temporal's rule): the subscription may fire many times while the
   predicate is true; advancing checks `status === "waiting-human"` first, so double-fires no-op.
3. **Zero code in the focus views.** They already write the state; the runner reads it. The views
   don't know the runner exists — every future surface composes for free.

Constraints the pattern demands: predicates are **pure and cheap** (they run on every store
change) and read **state, not history** ("an edge exists", never "an edge was added"). Known
limitation: level-triggering can't tell *who* satisfied the predicate — acceptable v1 under the
single-writer canvas assumption.

---

## P7. Blast-radius gating — friction only where it earns its keep

**Principle.** Gate actions by cost × reversibility, not uniformly. Cheap, reversible, structural
ops execute instantly; real-cost, irreversible ops (generation) pause for the human.

**Pattern & source.** Anthropic (*Building Effective Agents*): "agents can pause for human feedback
at checkpoints"; our own D-decision lineage (part 1 §9.5).

**Ours.** All five verbs execute instantly. In the runner, **generation steps are human steps** —
the run never auto-fires a generation. The long-owed "L6 HITL gate" lands as a *pause in the run*,
not an approve-button card (the card was removed when `add_node` went instant).

**Why it matters.** The gate is not extra machinery — it is the same pause mechanic as P5, applied
at the steps where money is spent.

---

## P8. A workflow with one agentic cell — where agency is actually reserved

**Principle.** The product is a deterministic scaffold; genuine agency (model-owned step choice) is
reserved for the single step that resists the flowchart: *"is this generated image good enough, and
if not, what's the fix?"* — evaluator-optimizer, budget-capped, inside one shot's lane.

**Pattern & source.** Anthropic: agents are warranted for "open-ended problems where you can't
hardcode a fixed path"; everything else should be a workflow (cheaper, faster, debuggable).

**Ours.** Part 1 §8.3 reserved the cell; the playbook runner keeps a clean seam for it — the repair
loop plugs in later as one copilot step's `run` implementation, without touching the router,
frame, or runner.

**Why it matters.** This is the discipline that keeps every earlier primitive simple: nothing in
P1–P7 needs to anticipate agency, because agency is contained to a cell with its own budget/gate.

---

## Pattern → implementation map (one glance)

| Primitive | Industry pattern | Source | Our implementation |
|---|---|---|---|
| P1 small verbs | consolidated tools | Anthropic *Writing Tools for Agents* | 5 tools + client recipes |
| P2 handles | semantic ids | same | `nodeHandle` (uuid-derived, pure) |
| P3 human grounding | human-directed selection | our D-decision + Ask-when-Needed | @-mention, `@selected`, `resolveMentions` |
| P4 decomposition | routing + frame/slot-filling | Anthropic patterns; TOD/Dialogflow; arXiv 2409.00557 | `run_playbook` tool + code-checked frames + authored asks |
| P5 runner | interrupt/resume; human steps as nodes | LangGraph interrupts; Temporal | cursor + `PlaybookRun` in store; run card |
| P6 eyes | level-triggered reconciliation | Kubernetes controllers; Temporal `wait_condition`; AG-UI | store subscription (wake) + pure `done(state)` (decide) |
| P7 gate | HITL checkpoints by blast radius | Anthropic; our ADR lineage | generation steps are human steps |
| P8 agentic cell | evaluator-optimizer, bounded | Anthropic | reserved seam in one step's `run` |

## Sources

- Anthropic — [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents)
- LangGraph — [Interrupts (HITL)](https://docs.langchain.com/oss/python/langgraph/interrupts) · [interrupt blog](https://www.langchain.com/blog/making-it-easier-to-build-human-in-the-loop-agents-with-interrupt)
- Temporal — [Human-in-the-loop approvals](https://temporal.io/blog/human-in-the-loop-approvals) · [HITL agent docs](https://docs.temporal.io/ai-cookbook/human-in-the-loop-python) · [wait_condition deep-dive](https://danielfridljand.de/post/temporal-human-in-the-loop)
- Kubernetes — [Level Triggering and Reconciliation](https://hackernoon.com/level-triggering-and-reconciliation-in-kubernetes-1f17fe30333d) · [Kubebuilder: What is a Controller](https://book-v1.book.kubebuilder.io/basics/what_is_a_controller.html) · [The Principle of Reconciliation](https://www.chainguard.dev/unchained/the-principle-of-reconciliation)
- Slot-filling — [ACL survey: Slot Filling & Intent Classification](https://aclanthology.org/2020.coling-main.42/) · [Learning to Ask (arXiv 2409.00557)](https://arxiv.org/pdf/2409.00557)
- Agent-UI shared state — [AG-UI protocol](https://docs.copilotkit.ai/agentic-protocols/ag-ui)
