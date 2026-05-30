# CreativeOS — Architecture & Node Template

**Date:** 2026-05-30
**Status:** Living architecture reference (the reusable spine; cited by every stage spec)
**Companions:** `2026-05-30-creativeos-staging-roadmap.md` (strategy + ADR log)

This document defines the **reusable spine** — the one node lifecycle, the one version
envelope, and the schema — that every node type and every stage builds on. Stage specs
reference this doc instead of re-deriving it. Decisions and their rationale live in the
roadmap's ADR log (§7); this doc is the *technical* shape those decisions produce.

---

## 1. The node template (one lifecycle)

Every node type — Brief, Text, File, Prompt, Image Gen, Video Gen — shares one lifecycle.
**Only `compile` and `runAction` vary per type; everything else is shared machinery.**

```
resolveInputs → compile → runAction → writeVersion → setActive
```

| Step | What it does | Shared? |
|---|---|---|
| `resolveInputs` | Gather inputs: ambient client context + upstream nodes' active output + inline files | ✅ shared |
| `compile` | Pure function: (inputs + params) → exact payload to send. Renders as the visible **final compiled prompt**. | ⚠️ **type-specific** |
| `runAction` | Server-side call to the model/LLM (Next.js Route Handler, holds the secret) | ⚠️ **type-specific** |
| `writeVersion` | Append an immutable record of exactly what happened (the version envelope) | ✅ shared |
| `setActive` | Point the node's `active_version_id` at the new version | ✅ shared |

See ADR **D3**. `compile` being side-effect-free is the key boundary: independently
testable, and it is what the PRD requires be visible *before* generation.

---

## 2. Two kinds of "input"

"Input" means two different things; keep them distinct.

| Kind | What it is | Comes from | Resolution mechanism |
|---|---|---|---|
| **Resolved inputs** | Context pulled in from *outside* the node | client context · upstream nodes · inline files | walk relationships (see §3) |
| **Own content / params** | Stuff entered directly *into* this node | the user, on this node | read `nodes.data` |

The "three levels" (client / canvas / inline) are **only the resolved-input side**. A Brief
node's source file is **own content**, not a resolved input — it's uploaded directly into
the node.

---

## 3. Ambient vs explicit resolution

The resolved inputs split into two resolution mechanisms (ADR **D6**):

- **Ambient — client context.** Always available to every node, reached by walking the
  parent hierarchy `node → canvas → client` (a foreign-key lookup). **Not** modeled as
  edges. Each node opts in via `nodes.data.client_context` (`"all" | "none"`, upgradeable
  to a selection list — ADR **D7**).
- **Explicit — canvas edges + inline files.** Reached by walking the edge graph (edges) or
  reading the node's attached inline files. Varies per node.

```
ambient   : node ──FK──> canvas ──FK──> client.context_notes
explicit  : node <──edge── upstream node(s).active_version_id
            node.data.inline_files[]
```

---

## 4. Node × input-kinds matrix

Which input kinds each node type subscribes to. **Client context is ambient → always
available (first column always ✅).** Each type opts into only the explicit inputs it needs.

| Node | Client ctx | Canvas edges | Inline files | Own content / params |
|---|:---:|:---:|:---:|---|
| **Brief** | ✅ *(always)* | ➖ | ➖ | source brief + extraction schema |
| **Text** | ✅ | ➖ | ➖ | typed text |
| **File** | ✅ | ➖ | ➖ | uploaded file + (optional) schema |
| **Prompt** | ✅ | ✅ | ✅ | operator instruction |
| **Image Gen** | ✅ | ✅ (prompt + img refs) | ➖ | selected control values |
| **Video Gen** | ✅ | ✅ (prompt + img) | ➖ | selected control values |

Notes:
- **Brief** has no edges/inline inputs — its only source is its own uploaded brief +
  schema. It still pulls client context (e.g. brand voice) to parse more intelligently.
- **Prompt** is the only node using all three resolved-input levels — which is why
  "connections & context engineering" is its own stage (Stage 2).
- `resolveInputs` fetches only what the node type subscribes to (Brief → ~nothing external;
  Prompt → all three).

---

## 5. The version envelope (append-only event log)

All AI actions append to one table `node_versions` with a uniform envelope (ADR **D4**).
A Brief "parse", a Prompt "generate", an Image "attempt" are the **same row shape**.

```
version = {
  inputs_used,   // snapshot of resolved inputs (INCLUDING upstream version ids consumed)
  params_used,   // schema / controls / instruction used
  model_used,    // provider + model id
  output,        // text inline, or a storage reference for image/video
  error,         // if it failed
  decision,      // 'approved' | 'rejected' | null  (Generate nodes)
  note,          // optional
  operator,      // who ran it
  created_at,
}
```

**Append-only.** Never UPDATE/DELETE a version — append a new one and move the active
pointer. History only grows; "restore" = repoint (ADR **D5**). This is what makes the
PRD's "learn from every attempt" free: history *is* the data model.

### The active pointer = a cache, not truth
`nodes.active_version_id` answers "which version is current right now?". It's a convenience
cache over the log; you could recompute "current" from the log instead. Event-sourcing
shape: **the log is truth, the pointer is derived.**

---

## 6. Schema

Five tables. Four are Stage 1; `edges` is **designed now, built in Stage 2** (ADR **D8**).

```sql
-- 1. CLIENTS  (top of hierarchy; holds ambient client context)
create table clients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  context_notes text default '',                         -- thin client context (Stage 1)
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 2. CANVASES  (one creative project)
create table canvases (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients(id) on delete cascade,
  name       text not null,
  viewport   jsonb default '{"x":0,"y":0,"zoom":1}',     -- React Flow pan/zoom
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. NODES  (uniform machinery columns; type-specific stuff in `data`)
create table nodes (
  id                uuid primary key default gen_random_uuid(),
  canvas_id         uuid not null references canvases(id) on delete cascade,
  type              text not null,            -- 'brief'|'text'|'file'|'prompt'|'image_gen'|'video_gen'
  position          jsonb not null default '{"x":0,"y":0}',   -- React Flow position
  data              jsonb not null default '{}',               -- own content + params (per type)
  active_version_id uuid,                     -- -> node_versions.id  (active-output pointer)
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- 4. NODE_VERSIONS  (append-only log = version envelope = the "learning" backbone)
create table node_versions (
  id          uuid primary key default gen_random_uuid(),
  node_id     uuid not null references nodes(id) on delete cascade,
  inputs_used jsonb not null default '{}',    -- resolved inputs snapshot (incl. upstream version ids)
  params_used jsonb not null default '{}',    -- schema / controls / instruction used
  model_used  text,
  output      jsonb,                          -- text inline, or storage ref for image/video
  error       text,
  decision    text,                           -- 'approved' | 'rejected' | null
  note        text,
  operator    text,
  created_at  timestamptz default now()
);

-- active pointer references the log (added after both tables exist; nullable back-pointer)
alter table nodes
  add constraint nodes_active_version_fk
  foreign key (active_version_id) references node_versions(id) on delete set null;

-- 5. EDGES  (designed now, BUILT in Stage 2) — point to NODES, not versions
create table edges (
  id             uuid primary key default gen_random_uuid(),
  canvas_id      uuid not null references canvases(id) on delete cascade,
  source_node_id uuid not null references nodes(id) on delete cascade,
  target_node_id uuid not null references nodes(id) on delete cascade,
  source_handle  text,                        -- which output port
  target_handle  text,                        -- which input port
  created_at     timestamptz default now()
  -- future option (ADR D8): pinned_version_id uuid  -- freeze a connection to a version
);
```

Plus **Storage** (Supabase): bucket `sources` (briefs, reference files) and bucket
`outputs` (generated images/videos). Files referenced by path in `nodes.data` or
`node_versions.output`.

### Why this scales
- **JSONB `data` + payload = "narrow waist"** (ADR **D10**): uniform machinery columns,
  flexible per-type blob. No table-per-node-type; no migration per PRD field change.
- **Active pointer + append-only log** answers PRD §20 "active output vs version?" — edges
  point to nodes, resolution follows the active pointer; restore moves the pointer.
- **`on delete cascade`** down `client→canvas→node→version` cleanly removes subtrees;
  `on delete set null` on the active pointer means deleting a version just un-sets active.

---

## 7. Resolution mechanisms (shared machinery)

### resolveInputs (per node type's subscription — §4)
```ts
function resolveInputs(node, ctx) {
  const inputs = {};
  // ambient: always available, walk parent FKs
  if (node.data.client_context !== 'none') {
    inputs.client = selectClientContext(ctx.client, node.data.client_context); // 'all' | [ids]
  }
  // explicit: edges (Stage 2+) — direct upstream nodes' ACTIVE outputs
  inputs.upstream = ctx.edges
    .filter(e => e.target_node_id === node.id)
    .map(e => activeOutputOf(e.source_node_id));     // follows active_version_id
  // explicit: inline files (Prompt node)
  inputs.inline = node.data.inline_files ?? [];
  return inputs;
}
```

### Staleness — derived on read, never stored (ADR **D9**)
A downstream version records the upstream version ids it consumed in `inputs_used`. On read,
compare upstream's *current* `active_version_id` to the recorded id; mismatch → stale badge.
No `is_stale` column, no triggers.

### Cycle prevention (Stage 2) — the only graph algorithm needed
Before adding `source → target`, walk upstream from `source`; if `target` is reached, the
edge would create a cycle → reject. (See ADR **D11** — the human is the scheduler, so no
topological sort is needed.)

---

## 8. Per-type instantiation (what differs per node)

Forward-looking summary of how each node type fills the two type-specific steps. Built
incrementally across stages; the rest of the spine is identical for all of them.

| Node | `compile` produces | `runAction` calls | Stage |
|---|---|---|---|
| **Brief** | brief text + extraction schema → parse payload | LLM (parse → structured JSON) | 1 |
| **Text** | — (no AI action; just stores text) | none | 2 |
| **File** | file + extraction prompt → process payload | LLM (optional, if "Use LLM") | 2 |
| **Prompt** | client ctx + upstream + inline + instruction → prompt payload | LLM (generate text) | 2 |
| **Image Gen** | base prompt + control values + refs → final compiled prompt | image model | 3 |
| **Video Gen** | base prompt + control values + image → final compiled prompt | video model (async submit→poll) | 4 |
