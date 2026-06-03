# CreativeOS — Walkthrough Notes (living doc)

**What this is:** running notes from the deep-dive through the task list. Append as we go.
Format: one-line definitions first (scan-able glossary), then the deeper sections.

**Sources:** [tasklist](creativeos-tasklist.md) · [architecture](superpowers/specs/2026-05-30-creativeos-architecture.md) · [roadmap+ADRs](superpowers/specs/2026-05-30-creativeos-staging-roadmap.md)

---

## Glossary (one-liners)

- **DDL** — Data Definition Language: the SQL that defines *structure* (`CREATE/ALTER/DROP TABLE`).
- **DML** — Data Manipulation Language: the SQL that reads/changes *rows* (`INSERT/UPDATE/DELETE/SELECT`).
- **Spine** — the build-once substrate (M1–M5) every node reuses: schema · persistence · lifecycle engine · node-card kit · canvas.
- **Rider** — a one-time chunk of shared machinery that a node *forces into existence* the first time a new kind of difficulty appears. Three total (see below).
- **Narrow waist** — hourglass architecture: many node types on top, much machinery on the bottom, all squeezed through **one uniform table shape** (`nodes`) in the middle. Lets top & bottom grow independently. (ADR D10)
- **Append-only version log** — `node_versions`: every AI action appends one immutable row; never UPDATE/DELETE. History *is* the data model. (ADR D4)
- **Active pointer** — `nodes.active_version_id`: a *cache* for "which version is current," derivable from the log. The log is truth; the pointer is a shortcut. (ADR D5)
- **JSONB `data` column** — per-type content/params live here as a flexible blob, so the table shape stays uniform (no table-per-type, no migration per field).
- **`compile`** — pure, side-effect-free function `(inputs + params) → payload`. Type-specific. Renders as the visible "final compiled prompt."
- **`runAction`** — server-side model/LLM call (Next.js Route Handler holding the secret). Type-specific.
- **`resolveInputs / writeVersion / setActive`** — the *shared* lifecycle steps every node reuses unchanged.

---

## The Riders (the 3 expensive moments)

A node is meant to be cheap & repeatable (fill 5 areas → ship). But three nodes are the
**first to hit a new kind of difficulty**, so they force a one-time piece of machinery first.
A rider is paid the first time a new *axis* of difficulty appears — then every later node on
that axis is free.

| Rider | Forced by | New difficulty (the axis) |
|---|---|---|
| **The Spine** (M1–M5) | **Brief** | "we need persistence at all" — it's the first node, the substrate doesn't exist yet |
| **Edges + resolution** (M9) | **Prompt** | "we need inputs from *other nodes*" — first node that consumes the graph |
| **Async gen infra** (M13) | **Image** | "the call doesn't finish in one HTTP request" — first long-running model call |

Key nuance: riders are **not** the most complex nodes — they're the *first* to cross a line.
Video is more complex than Image but isn't a rider, because Image already paid the async tax.

---

## Rider 1 — The Spine (M1–M5)

### M1 — Schema + Storage
**Contract:** the DDL + TS row types (`Node`, `NodeVersion`…) + bucket names. Depends on nothing.
Five tables: `clients · canvases · nodes · node_versions · edges` (edges designed now, built in Stage 2).

Three load-bearing ideas:

1. **Narrow waist (ADR D10).** `nodes` has uniform machinery columns (`type`, `position`,
   `active_version_id`) + one `data` JSONB blob for everything type-specific. Brief and Image
   are the *same row shape*. Add a field → write a different object into `data` = **zero
   migrations**. Cost: Postgres can't validate `data`'s shape → that validation moves up into
   TypeScript (`compile` / row types). Conscious trade: velocity over DB-enforced structure.

2. **Append-only log (ADR D4).** Every AI action (Brief parse, Prompt generate, Image attempt)
   appends one row to `node_versions` with the same envelope:
   `inputs_used · params_used · model_used · output · error · decision · note · operator · created_at`.
   Never UPDATE/DELETE — re-running appends. "Compare/restore/learn from every attempt" comes
   **free** because history *is* the data model. (Rejected: overwrite output on the node.)

3. **Active pointer = cache, not truth (ADR D5).** `nodes.active_version_id` could be recomputed
   from the log; it exists only so you don't replay the log on every read. → log is truth,
   pointer is a repointable shortcut. "Restore" = move the pointer. Staleness (M14) falls out
   of comparing pointers vs. recorded ids.

Gotchas / sub-lessons:
- **Circular FK.** `nodes.active_version_id → node_versions.id` AND `node_versions.node_id →
  nodes.id`. Can't declare inline (target table doesn't exist yet) → added via a *second* DDL
  statement: `ALTER TABLE … ADD CONSTRAINT nodes_active_version_fk …`.
- **Delete rules encode the hierarchy.** `on delete cascade` flows down
  `client→canvas→node→version`; the active pointer uses `on delete set null` (deleting a
  version just un-sets active, doesn't nuke the node).
- **Storage ≠ DB (ADR D13).** Images/videos live in Supabase Storage buckets (`sources`,
  `outputs`); the DB stores only the *path* string in `output`. "Large media in object storage,
  DB holds the path."

### M2 — Persistence (data-access layer)
**Contract:** `loadCanvas · saveNode · insertVersion · setActive · listVersions` — plus the rule
**nothing else writes raw SQL.** Depends on M1.

The one idea: a single chokepoint for all DB access (the **repository pattern**). The contract
isn't the function names, it's the *prohibition*.

- **Enforces append-only by API shape.** There's `insertVersion` but **no `updateVersion`/
  `deleteVersion`** — a component literally cannot mutate history because the verb doesn't exist.
  The data-model rule (D4) becomes physically true via the interface surface.
- **`setActive` = the only sanctioned pointer mutation.** Every "restore" in the UI is one call,
  one code path.
- **Narrow waist, bottom half.** M1 made the *table* uniform; M2 makes the *access* uniform.

Replaces the in-memory mutations in `canvas-store.ts`, redirected at Supabase:
`addNode/updateNodeData → saveNode` · re-run parse → `insertVersion` (new) · pick output →
`setActive` (new) · mount → `loadCanvas`. Zustand stays as the **client cache**; M2 hydrates it
(`loadCanvas`) and flushes to it (debounced `saveNode`) — that load/flush split is what M3 drives.

Sub-lessons:
- **"Make the wrong thing impossible" > "remember not to do it"** — invariants encoded in the
  interface, not in discipline.
- **Trust boundary lives here.** M2 runs server-side with Supabase's service-role key (D14: no
  auth/RLS yet → key never reaches the browser). Chokepoint for SQL *and* secrets.
- **Typed end-to-end.** Functions return M1 row types (`Node`, `NodeVersion`) — the "DDL + TS
  types" pairing paying off; compiler catches shapes the JSONB column can't.

### M4 — Lifecycle engine
**In one line:** one function that runs *every* node the same way. Same machine, different "pod."

**Coffee-machine picture:** the machine does the same routine every time; only the pod changes.
The engine does the same 5 steps every time; only 2 of them change per node type.

1. **Gather** the node's inputs       ← same for every node
2. **Build** the request for the AI   ← the POD (per type) = `compile`
3. **Send** it to the AI, get result  ← the POD (per type) = `runAction`
4. **Save** the result to history      ← same for every node = `writeVersion`
5. **Mark** it as the current answer   ← same for every node = `setActive`

**Word map:** machine = `runNode()` · build = `compile` · send = `runAction` · save = `writeVersion`.

**Why bother:** without it you'd rewrite "gather → save → mark" for Brief, then again for Prompt,
then again for Image. With it, you write that routine **once**; each new node just brings its 2
small pieces (build + send). That's the whole reason new nodes are cheap.

**Two things worth knowing (still simple):**
- **"Build" never touches the network or DB** — it just turns inputs into the exact text to send.
  Because it's that simple, you can show the user *what will be sent* before hitting send (a cheap
  preview).
- **"Send" is the only step holding the secret key** — the server call to the AI. All the risky
  stuff is boxed into one step.

**Contract (reference):** `registerNodeType(type, {compile, runAction})` + `runNode(id)`. Depends
on M2 (uses save + mark).
### M5 — Node-card kit
**In one line:** the *reusable card* every node sits in. Same frame, different middle.

M4 was the coffee *machine* (runs a node). M5 is the matching thing on screen: the *card* that
shows a node. M4 = how it runs · M5 = how it looks.

Problem it solves: today `BriefNode` hand-builds its own box. Add Text/Prompt/Image and you'd
copy that layout every time. M5 = one card template with empty slots, so each node just fills the
middle.

The card's fixed parts (same on every node):
```
┌──────────────────────────┐
│ [icon] TITLE      ▶ Run   │  header  (same for all)
├──────────────────────────┤
│   the node's own stuff    │  body    (changes per type)
├──────────────────────────┤
│ past attempts ▾  ✓ / ✗    │  history (same for all)
└──────────────────────────┘
```
- **Header** — name + **Run button**
- **Body** — the one slot that changes per type
- **History panel** — past attempts, ✓ approve / ✗ reject, "make this the current answer"

Two buttons wire M5 to the rest:
- **Run** → tells M4 "run this node."
- **Approve / set-current** → tells M2 "mark this version active."

**Why it matters:** the append-only history (M1) is invisible rows until now. **M5 is where history
becomes something a designer can see and click** — the "learn from every attempt" promise becomes
real here.

Twins: **M4 = one runner for all nodes · M5 = one card for all nodes.** Add a node by filling a
small middle, not rebuilding the frame. `BriefNode` is the "before" — M5 pulls its header/body/
history into a shared `<NodeCard>` so the node shrinks to just its middle.

**Contract (reference):** `<NodeCard>` + `useNodeRun()`. Depends on M2.
### M3 — Canvas shell — _(next)_

---

## Status vs. current code
- Built today: canvas frontend on **local Zustand state** (`src/lib/canvas-store.ts`,
  `src/components/canvas/*`, `brief-node.tsx`) — a sketch of M3's *UI* only.
- Not built: M1 (schema), M2 (persistence), M4 (lifecycle), M5 (node-card kit). No Supabase,
  no server Route Handlers yet. First refresh-surviving parse hits the spine wall.
