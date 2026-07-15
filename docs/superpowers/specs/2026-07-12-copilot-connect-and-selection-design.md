# Copilot connect primitive, `@selected`, and viewport placement — design spec

> **Status:** design, not yet built. Branch `worktree-minimal-agent`. Builds on the copilot
> as-built spec (`2026-07-14-creativeos-copilot-design.md` §9) and its blast-radius gating rule.
> Draft decisions (§9) are staged for the ADR log; assign D-numbers on merge.

---

## 1. Summary

Four changes that let the copilot **wire the graph** and let a human **reference the current
selection**, plus a placement fix so agent-created nodes land where the human is looking:

1. **`connect_nodes` tool** — the copilot wires `@from…` (one or more sources) → `@to` (one
   target), validated against `VALID_CONNECTIONS`, executed instantly.
2. **`@selected` primitive** — a composer affordance that expands to the ref handles of the
   currently-selected canvas nodes (so "connect `@selected` → `@PRM-A3F9`" just works).
3. **Focus-view `+` add-connection** — a second, manual entry point for the *same* validated
   connect logic: a `+` on a focus view's **Connected** header opens a combobox of candidate
   source nodes and wires the chosen one. For inputs the auto-flow missed.
4. **Viewport-center placement** — `add_node` / `create_script_node` place the new node at the
   center of the visible canvas, not off to the right of the rightmost node.

Guiding constraints, unchanged: **server thinks, client acts, human stays in control**;
structural/cheap ops execute instantly (blast-radius rule) — connect is one of them.

---

## 2. Shared foundation — one connection rule, four call sites

`VALID_CONNECTIONS` (`src/lib/canvas-nodes.ts`) already maps *source type → allowed target
types*. It is currently read inline at two sites: `canvas.tsx` (`isValidConnection` for manual
drag) and `use-node-connection-state.ts` (drag affordance). This design adds two more consumers,
so per the reuse rules we **extract one pure helper** and route all four through it:

```ts
// src/lib/canvas-nodes.ts, beside VALID_CONNECTIONS
export function canConnect(sourceType: string, targetType: string): boolean {
  return (VALID_CONNECTIONS[sourceType] ?? []).includes(targetType);
}
```

- Refactor `canvas.tsx:259` and `use-node-connection-state.ts:22` to call `canConnect`.
- The `connect_nodes` recipe and the focus-view `+` both call it too.

**Direction is not symmetric.** `canConnect(src, tgt)` is an *ordered* check. The copilot tool
asks `canConnect(fromType, toType)`; the focus-view `+` sits on the target and asks
`canConnect(candidateType, thisType)`. There is deliberately **no** symmetric `areConnectable`.

---

## 3. `connect_nodes` — the copilot tool

### 3.1 Route (`src/app/api/copilot/actions/route.ts`)

A fourth executable tool alongside `create_script_node`, `parse_script`, `open_node`:

```
connect_nodes({ from: string[], to: string })
```

- `from` — one or more node **handles** (e.g. `["FILE-469A", "DRAW-1B2C"]`); the sources.
- `to` — a single node **handle**; the target.
- Description states the direction plainly: *each `from` becomes the source of an edge into `to`*.
- The route returns `{ action: { name: "connect_nodes", args: { from, to } } }` (a proposal-free
  request; the client executes it — same shape as `open_node`).

### 3.2 Client recipe (`src/components/canvas/use-copilot-chat.ts`)

```
connectHandles(fromHandles: string[], toHandle: string):   // recipe name — avoids shadowing store.connectNodes
  resolve toHandle  → target (resolveNodeTarget); if missing → report + stop
  for each fromHandle:
    resolve → source; if missing → collect as "unknown"
    else if !canConnect(source.type, target.type) → collect as "rejected"
    else store.connectNodes(source.id, target.id); collect as "wired"
  post one assistant message summarizing wired / rejected / unknown by handle
```

- **Instant, no gate** — connect is cheap, reversible, structural.
- `store.connectNodes` is `addEdge`, which **de-dupes** identical source→target edges, so
  re-issuing a connection is harmless (idempotent).
- Validation lives in the recipe because `store.connectNodes` does **not** check
  `VALID_CONNECTIONS` (only the manual-drag UI path did). This is the reason for §2's helper.

---

## 4. `@selected` primitive (composer)

**Insert-time expansion** (chosen over a live token). In `copilot-composer.tsx`, the `@` picker
gains a synthetic top entry, shown when the current `@`-query is empty or a prefix of "selected"
**and** ≥1 node is selected:

> **`@ Selected · N nodes`**

Selecting it replaces the `@query` with the **`@HANDLE name` token for every currently-selected
node**, space-joined — exactly the tokens `insertMention` already produces. From that point it is
ordinary @-mention text; `resolveMentions` needs **no change**.

- **Why expansion, not a live token:** it literally "translates the selection into ref IDs,"
  stays visible/editable, and reuses the existing resolver. A live `@selected` that resolves at
  send time would drift if the selection changed between typing and sending, and would need a
  special case in `resolveMentions`.
- **Selection source:** the composer already subscribes to `nodes`; selected = `nodes.filter(n
  => n.selected)`.
- **Empty selection:** the synthetic entry is not offered (nothing to expand).
- **Known limitation:** a *hand-typed* literal `@selected` (bypassing the picker) does not
  resolve — it is picker sugar, not a resolver keyword.

---

## 5. Focus-view `+` add-connection

### 5.1 Where

The **Connected · N** header in a focus view's left rail (`prompt-focus-view.tsx:515`). A small
`+` button sits at the end of that header row.

### 5.2 Component — `src/components/nodes/add-connection.tsx`

A shared, reusable control so every focus view can adopt it:

```
<AddConnection targetId={id} targetType="prompt" connectedIds={upstream.map(u => u.id)} />
```

- Renders the `+` as a shadcn `Button` triggering a **Popover** containing a **Command**
  (searchable) list — mirrors the `@`-mention picker's feel.
- **Candidates** = canvas nodes `n` where
  `canConnect(n.type, targetType)` **and** `n.id !== targetId` **and** `!connectedIds.includes(n.id)`.
  Each row shows the node's `nodeLabel` (handle + name), consistent with chips and the picker.
- Picking a candidate calls `store.connectNodes(candidate.id, targetId)` and closes the popover.
- Empty candidate list → a muted "No nodes available to connect" row.

### 5.3 Scope

Wire it into the **prompt focus view** now (the surface in the request). The component is
node-type-agnostic, so image-gen / video-prompt / video-gen focus views can adopt it later by
dropping the same element into their Connected headers — **out of scope for this spec.**

---

## 6. Viewport-center placement

`placeNewNode(nodes)` (pure, in `actions.ts`) places new nodes to the right of the rightmost
existing node — off-screen on a populated canvas. Replace its use in the two copilot create
recipes with the **viewport center**, computed in the hook (not pure — needs React Flow):

```
const c = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
position = { x: c.x - HALF_W, y: c.y - HALF_H };   // offset so the node's CENTER lands at c
```

- `screenToFlowPosition` comes from `useReactFlow` (already imported in the hook for `setCenter`).
- Applied to **`add_node`** and **`create_script_node`**. `placeNewNode` stays as-is for any
  non-viewport caller and its unit test is untouched.
- The existing `setCenter(position + halfOffset, …)` pan is kept; with center placement it is a
  no-op nudge that keeps the node framed.

---

## 7. Error handling

| Case | Behavior |
|---|---|
| `connect_nodes` target handle unknown | assistant message "I couldn't find a node called X"; nothing wired |
| a `from` handle unknown | that one reported as unknown; the resolvable ones still wire |
| a pair violates `VALID_CONNECTIONS` | that pair reported as rejected (with a reason); valid ones still wire |
| duplicate edge | silently de-duped by `addEdge`; counted as wired |
| `@selected` with no selection | picker entry not shown |
| focus-view `+` with no candidates | "No nodes available to connect" |

---

## 8. Testing

- **`canConnect`** — pure unit tests (valid pair true, invalid false, unknown type false); assert
  the two refactored call sites still behave (existing `canvas-nodes.test.ts` covers the map).
- **connect recipe** — extract the pure resolve+validate+partition logic
  (`planConnections(fromHandles, toHandle, nodes)` → `{ wired, rejected, unknown }`) into
  `src/lib/copilot/actions.ts` and unit-test it (mirrors `resolveScriptTarget`/`buildHistory`).
  The recipe then just maps `wired` through `store.connectNodes` and formats the message.
- **`@selected` expansion** — pure helper `expandSelected(nodes)` → token string; unit-test with
  0 / 1 / N selected.
- **Manual/browser** — the two connect surfaces and viewport placement are driven in the app
  (their store/React-Flow effects are integration behavior, verified by the human).

---

## 9. Draft decisions (stage into the ADR log on acceptance)

- **`connect_nodes` is a validated, instant copilot tool.** The model requests `from[] → to`;
  the client resolves handles, checks `canConnect`, and wires via the store — no gate. *Why:*
  connect is cheap/reversible/structural (blast-radius rule). *Rejected:* a proposal/approve gate
  for connect (reserved for generation).
- **One `canConnect(src, tgt)` helper, four call sites.** *Why:* the rule was inlined twice and
  two more consumers arrive; one ordered helper prevents divergence. *Rejected:* a symmetric
  `areConnectable` (hides the source/target direction the graph depends on).
- **`@selected` is insert-time expansion to ref handles, not a live token.** *Why:* transparent,
  editable, reuses `resolveMentions`, and can't drift between typing and send. *Rejected:* a
  send-time-resolved `@selected` keyword.
- **The focus-view `+` reuses the same validated connect logic as the copilot.** *Why:* one
  connection semantics, two entry points (chat + manual). *Rejected:* a focus-view-only ad-hoc
  wiring path.
- **Agent-created nodes place at the viewport center.** *Why:* "appears where I'm looking" beats
  off-screen-right on a populated canvas. *Rejected:* cursor position (undefined for a chat-driven
  action); keeping `placeNewNode` for copilot creates.

---

## 10. Out of scope / deferred

- The focus-view `+` on node types other than **prompt** (component is ready; adoption is a later
  drop-in).
- A `disconnect` / edge-removal tool.
- Live-token `@selected`.
- The generation-step HITL gate (owed separately, per the copilot as-built spec).
