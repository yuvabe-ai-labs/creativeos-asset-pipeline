# Auto-attached selection context + zoom-legible ref badges — design spec

> **Status:** design, not yet built. Branch `worktree-minimal-agent`. Refines the `@selected`
> primitive from `2026-07-12-copilot-connect-and-selection-design.md` — this spec **replaces**
> its insert-time expansion with an implicit, dismissible context chip. §6's decisions are
> recorded in the ADR log (2026-07-16): side-channel selection context → **D74**, zoom-threshold
> ref badges → **D76**.

---

## 1. Summary

Two changes, one theme: **you shouldn't have to read or retype tiny ref handles to talk about
nodes.**

1. **Auto-attached selection context** — the copilot composer shows a live chip row for the
   current canvas selection and sends those node ids as grounding automatically (side-channel,
   not injected into the typed text). Replaces the manual `@selected` picker row.
2. **Zoom-legible ref badges** — below a zoom threshold, node ref badges (`SHOT-3BFE`) flip to
   a larger size on the card face so they stay readable at overview zoom (React Flow
   "contextual zoom" pattern, boolean store selector).

Guiding constraint, unchanged: **human-directed grounding** — the selection is something the
human did; attaching it is making an existing signal legible to the copilot, not the copilot
volunteering context.

---

## 2. Part 1 — selection context chip (composer)

### 2.1 Chip row (visible behavior)

- Renders **above the textarea**, same slot pattern as the script-attachment chip in
  `copilot-composer.tsx`.
- Appears whenever ≥1 canvas node is selected: one chip per node, `HANDLE · name` (via the
  existing `nodeLabel`), **capped at 3** chips + a `+N` overflow chip for larger selections.
- **Live mirror:** the row tracks the canvas selection as it changes (the composer already
  subscribes to `nodes` from the canvas store — selection is derived, no new subscription).
- **Dismissible per turn:** one × on the row clears it for the current message. Dismissal is
  keyed to the selection *signature* (sorted selected ids, joined); it resets when the
  signature changes or after a successful send.
- Styling: existing attachment-chip vocabulary — `border-primary/30 bg-primary/5`, eyebrow
  handle, `text-xs` name, Lucide × at 1.5 stroke.

### 2.2 Data flow (invisible behavior)

- `CopilotComposer.submit()` computes `contextIds: string[]` = selected node ids, or `[]` when
  dismissed / nothing selected, and passes them up: `onSend(text, attachment, contextIds)`.
- `use-copilot-chat.ts` `send()` merges:
  `mentionedIds = union(resolveMentions(text, nodes), contextIds)` (deduped, order-stable:
  typed mentions first).
- **No server change.** `mentionedIds` already travels to `/api/copilot/actions` and the
  answer route; both get selection grounding for free.

### 2.3 History rendering

- User messages gain an optional `context?: { handle: string; name: string }[]` (captured at
  send time so history survives later deletion/renaming of nodes).
- `copilot-message.tsx` renders it as one muted line under the user bubble:
  `⌞ SHOT-3BFE, PRM-6613` (handles only; truncate with `+N` beyond 3). Typed text stays clean.

### 2.4 Removal — `@selected` sugar

- The `SELECTED` row in the @-mention picker (`copilot-composer.tsx`) is removed, along with
  `expandSelected` (`src/lib/copilot/actions.ts`) and its tests — redundant once selection
  attaches implicitly.
- Per-node @-mentions **stay**: they are the mechanism for referencing *non-selected* nodes.

---

## 3. Part 2 — zoom-legible ref badges

> **Amended at implementation:** a call-site audit found **all 12 `NodeHandle` references
> are canvas node card components** (none in focus views), so the flip lives **directly in
> `NodeHandle`** — no `ZoomAwareNodeHandle` wrapper, no `NodeTitle` swap, zero call-site
> changes. Mechanics and threshold unchanged.

- `NodeHandle` subscribes to zoom:

  ```tsx
  const zoomedOut = useStore((s) => s.transform[2] < 0.65);
  ```

  Boolean selector ⇒ nodes re-render only when the zoom **crosses** 0.65, not per tick
  (React Flow contextual-zoom pattern, reactflow.dev/examples/interaction/contextual-zoom).
- When `zoomedOut`, the badge renders at ~15px (`text-[15px]`), full-opacity foreground;
  otherwise today's `text-[10px] text-foreground/70`.
- If a future non-canvas surface ever needs the plain tag, extract a pure span variant
  then — `useStore` throws outside the React Flow provider.

---

## 4. Edge cases

| Case | Behavior |
|---|---|
| Nothing selected | No chip row; composer identical to today. |
| Selection deleted between select and send | `mentionedIds` resolution already tolerates unknown ids server-side; history `context` captured handles at send time. |
| Dismissed, selection unchanged | Stays dismissed until send or signature change. |
| Dismissed, then one more node selected | Signature changed → chip row returns. |
| Attachment + selection together | Both render in the same chip area, attachment chip first; attachment short-circuits to the script recipe as today — `contextIds` are ignored on that path. |
| Same node typed as @-mention AND selected | Union dedupes; grounded once. |

---

## 5. Testing

- **Unit (new):** `mergeMentionedIds(typed, context)` — union, dedupe, typed-first order.
- **Unit (new):** selection-signature dismissal logic (pure helper: `signature(nodes)`,
  reset-on-change) — extracted so it's testable without the composer.
- **Deleted:** `expandSelected` tests.
- **Untouched:** `resolveMentions` tests.
- **Manual:** chip mirrors selection; × dismisses for one turn; history tag renders; zoom flip
  at 0.65 on card faces; focus views unaffected.

---

## 6. Decisions — recorded in the ADR log as **D74, D76** *(2026-07-16)*

- **Selection context is side-channel, not text injection.** Selected node ids merge into
  `mentionedIds` at send; the typed message is never rewritten. *Rejected:* prepending
  expanded `@HANDLE` tokens (pollutes history, was the `@selected` mechanism).
- **Implicit context is dismissible per turn, keyed to selection signature.** *Rejected:*
  always-attached (forces deselection to ask unrelated questions).
- **Ref badges flip size at a zoom threshold (boolean store selector), never counter-scale
  continuously.** *Rejected:* `scale(1/zoom)` constant-size labels (overflow/collision at far
  zoom); continuous font interpolation (re-renders every zoom tick).
