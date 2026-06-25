# Async Generation Architecture — Design Spec

**Date**: 2026-06-20
**Status**: Approved

---

## 1. Problem

CreativeOS currently generates images synchronously — the HTTP connection stays open while
the provider processes the request. This works for fast models (5–15s) but breaks for
video generation (Veo: 30–90s) and any future long-running job.

Additional gaps:

- No unified job tracking — generation attempts are spread across `node_versions` with no
  operational state (running / failed / succeeded)
- No billing metadata per attempt — no credits, tokens, or user attribution at the job
  level
- No real-time UI updates — the frontend has no way to know when a long job completes
  without polling

---

## 2. Decision

**Unified async pipeline for all generation types** (image, video, prompt).

Every generation — regardless of how fast — goes through the same lifecycle:

```
INSERT generations {status:'running'}
  → job runs (via provider)
  → completeGeneration() on finish
  → Supabase Realtime notifies frontend
```

**Chosen approach**: single `completeGeneration()` utility with two provider paths, both
converging at one webhook endpoint (`/api/webhooks/generation`).

**Realtime**: Supabase Realtime postgres_changes on the `generations` table — no polling.

---

## 3. Schema Addition

New table `generations` (migration `0007_generations.sql`). **No changes to any existing
table.**

```sql
create table generations (
  id               uuid primary key default gen_random_uuid(),
  node_id          uuid not null references nodes(id) on delete cascade,
  type             text not null,        -- 'image' | 'video' | 'prompt'
  status           text not null,        -- 'running' | 'succeeded' | 'failed'
  provider_job_id  text,                 -- opaque job ID from provider
  model_used       text,
  params_snapshot  jsonb,                -- model params at initiation
  inputs_snapshot  jsonb,               -- upstream inputs at initiation
  tokens_used      jsonb,               -- filled on success
  credits_consumed numeric,             -- computed on success
  version_id       uuid references node_versions(id),  -- null if failed
  user_id          uuid,                -- nullable, future auth
  error            text,                -- set on failure
  meta             jsonb,               -- provider raw response
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index generations_node_id_idx    on generations(node_id);
create index generations_status_idx     on generations(status);
create index generations_version_id_idx on generations(version_id);
```

`version_id` is **nullable** — it is only set on success. A failed generation has no
`node_versions` row and no `active_version_id` change on `nodes`.

---

## 4. Two Provider Paths

### Path A — Webhook-capable provider

Provider natively supports a callback URL. Our backend triggers the job and immediately
returns. The provider calls us back when done.

```
Backend → provider.createJob({ webhookUrl: '/api/webhooks/generation?id=...' })
Provider (async) → POST /api/webhooks/generation
```

### Path B — Non-webhook provider (Vercel Function adapter)

Provider has no native webhook. A Vercel Function is fired without waiting (fire and
leave). The function calls the provider, waits inside the function, then calls our own
webhook endpoint — acting as a self-hosted webhook adapter.

```
Backend → fire Vercel Function (no wait) → return 202
Vercel Function → provider.runAndWait() → POST /api/webhooks/generation
```

Both paths converge at the same endpoint and the same `completeGeneration()` utility.

---

## 5. Graduation Order

### On initiation

```
INSERT generations {
  node_id, type, status: 'running',
  provider_job_id, model_used,
  params_snapshot, inputs_snapshot
}
→ trigger provider (Path A or B)
→ return 202 {generationId}
```

### On success (inside completeGeneration)

```
1. Upload output to Supabase Storage (if binary)
2. INSERT node_versions {inputs_used, params_used, model_used, output, generated_output}
   → version.id
3. UPDATE nodes SET active_version_id = version.id
4. UPDATE generations SET
     status = 'succeeded',
     version_id = version.id,
     tokens_used = ...,
     credits_consumed = ...
```

### On failure (inside completeGeneration)

```
UPDATE generations SET status = 'failed', error = message
(no node_versions row, no active_version_id change)
```

---

## 6. node_versions — Unchanged

`node_versions` keeps all existing columns as-is. The `generations` table captures
job-level metadata independently. Redundancy between the two tables is intentional for
this increment — cleanup of any overlap is deferred until real usage patterns are clear.

---

## 7. Frontend Realtime Pattern

Subscribe per node focus view on open, unsubscribe on close:

```typescript
supabase
  .channel(`generation:${nodeId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'generations',
    filter: `node_id=eq.${nodeId}`
  }, (payload) => {
    if (payload.new.status === 'succeeded') { /* show result  */ }
    if (payload.new.status === 'failed')    { /* show error   */ }
  })
  .subscribe();
```

UI states driven by `generations.status`:
- `running` → loading skeleton
- `succeeded` → fetch output URL, display result
- `failed` → display error message

---

## 8. Key Decisions

| Decision | Choice |
|----------|--------|
| Async for all types | Yes — collaborative canvas requires consistent async |
| Provider abstraction | Generic Path A/B — no vendor lock-in |
| node_versions changes | None — additive only |
| Polling | Not used — webhook or inline Vercel Function wait |
| Realtime mechanism | Supabase Realtime — already in stack |
| Completion endpoint | Single unified `/api/webhooks/generation` |
