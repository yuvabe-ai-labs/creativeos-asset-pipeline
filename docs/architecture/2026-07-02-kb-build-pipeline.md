# KB Build Pipeline — architecture diagram

**Date:** 2026-07-02
**Type:** Architecture diagram
**Companion:** [2026-07-02-client-kb-setup-flow.md](../superpowers/specs/2026-07-02-client-kb-setup-flow.md)

---

## Pipeline overview

```
  BROWSER                   NEXT.JS SERVER                TRIGGER.DEV             AI PROVIDER          SUPABASE / STORAGE
  ─────────                 ──────────────                ───────────             ───────────          ──────────────────
  User clicks
  "Extract & Build KB"
        │
        ▼
  startKBBuildJob()  ──────▶  server action
  [lib/actions/kb.ts]              │
                                   ├─ INSERT client_kb_jobs  ──────────────────────────────────────▶  client_kb_jobs
                                   │   status: "queued"                                                  (status: queued)
                                   │
                                   ├─ tasks.trigger("kb-build", payload)  ──────▶  kb-build task
                                   │                                               [trigger/kb-build.ts]
                                   │                                                      │
                                   ├─ UPDATE client_kb_jobs  ──────────────────────────── │ ──────▶  client_kb_jobs
                                   │   trigger_run_id = run.id                            │            (run id linked)
                                   │                                                      │
  ◀─ { jobId }  ─────────────────  ┘                                                     │
        │                                                                                 │
        │  Supabase Realtime                                                              │
        │  (postgres_changes on                                                           │
        │   client_kb_jobs)         ◀──────────────────────── phase webhooks ────────────┤
        │                                                                                 │
        ▼                                                                         ════════╪══════════════════════════
  UI: loading state                                                               PHASE 1 │ RESEARCHING
  shows phase_message                                                             ════════╪══════════════════════════
                                                                                         │
                                                                                         ├─ POST /api/webhooks/kb-build
                                                                                         │   { kind:"phase", status:"researching" }
                                                                                         │         │
                                                                                         │         ▼
                                                                                         │   UPDATE client_kb_jobs ──────────────▶  client_kb_jobs
                                                                                         │   status: "researching"                   (Realtime fires →
                                                                                         │   phase_message: "Researching…"            UI updates)
                                                                                         │
                                                                                         ├─ researchBrandWebsite(url)  ──────────▶  AI (web search)
                                                                                         │   [lib/kb/website-research.ts]                │
                                                                                         │                                     researchMarkdown ◀─┘
                                                                                         │
                                                                                 ════════╪══════════════════════════
                                                                                 PHASE 2 │ EXTRACTING (parallel)
                                                                                 ════════╪══════════════════════════
                                                                                         │
                                                                                         ├─ POST /api/webhooks/kb-build
                                                                                         │   { kind:"phase", status:"extracting" }
                                                                                         │         │
                                                                                         │         ▼
                                                                                         │   UPDATE client_kb_jobs ──────────────▶  client_kb_jobs
                                                                                         │   status: "extracting"                    (Realtime fires)
                                                                                         │
                                                                                         ├─ runKBExtraction()
                                                                                         │   [lib/kb/extraction.ts]
                                                                                         │         │
                                                                                         │         │   Promise.all([...])
                                                                                         │         │
                                                                                         │    ┌────┴─────────────────────────────┐
                                                                                         │    │                                 │
                                                                                         │    ▼                                 ▼
                                                                                         │  extractKB()                  analyzeImages()
                                                                                         │  reads: all docs              reads: brand images
                                                                                         │        + researchMarkdown     (skipped if none)
                                                                                         │        │                             │
                                                                                         │        ▼                             ▼
                                                                                         │    AI model  ──────────────▶  AI model (vision)
                                                                                         │    fills ~33 fields           fills 7 Image Analysis
                                                                                         │    (brand, voice,             fields
                                                                                         │     identity, audience,       (dominant colours,
                                                                                         │     direction, compliance)     mood, composition…)
                                                                                         │        │                             │
                                                                                         │        └──────────┬──────────────────┘
                                                                                         │                   │
                                                                                         │             merged kbOutput
                                                                                         │
                                                                                 ════════╪══════════════════════════
                                                                                 PHASE 3 │ FINALIZING
                                                                                 ════════╪══════════════════════════
                                                                                         │
                                                                                         ├─ POST /api/webhooks/kb-build
                                                                                         │   { kind:"phase", status:"finalizing" }
                                                                                         │         │
                                                                                         │         ▼
                                                                                         │   UPDATE client_kb_jobs ──────────────▶  client_kb_jobs
                                                                                         │   status: "finalizing"                    (Realtime fires)
                                                                                         │
                                                                                         ├─ POST /api/webhooks/kb-build
                                                                                         │   { kind:"succeeded", kbOutput, researchMarkdown, … }
                                                                                         │         │
                                                                                         │         ▼
                                                                                         │   webhook handler  ──────────────────────────────────────▶  Storage
                                                                                         │   [api/webhooks/kb-build/route.ts]                           upload researchMarkdown
                                                                                         │         │                                                     → website-research.md
                                                                                         │         │
                                                                                         │         ├─ INSERT client_kb_documents  ─────────────────────▶  client_kb_documents
                                                                                         │         │   (website-research.md)                               (research doc linked)
                                                                                         │         │
                                                                                         │         ├─ INSERT client_kb_versions  ──────────────────────▶  client_kb_versions
                                                                                         │         │   output: kbOutput                                    (versioned snapshot)
                                                                                         │         │   doc_ids_used: [all doc ids]
                                                                                         │         │   model_used, fill_rate
                                                                                         │         │
                                                                                         │         ├─ UPDATE clients  ─────────────────────────────────▶  clients
                                                                                         │         │   kb_status: "in_review"                              (kb_status flips)
                                                                                         │         │
                                                                                         │         └─ UPDATE client_kb_jobs  ─────────────────────────▶  client_kb_jobs
                                                                                         │             status: "succeeded"                                 (Realtime fires →
                                                                                         │             version_id: <new id>                                 UI: toast + refresh)
                                                                                         │
                                                                                 ════════╪══════════════════════════
                                                                                 ERROR   │ ANY PHASE
                                                                                 ════════╪══════════════════════════
                                                                                         │
                                                                                         └─ POST /api/webhooks/kb-build
                                                                                             { kind:"failed", error }
                                                                                                   │
                                                                                                   ▼
                                                                                             UPDATE client_kb_jobs ─────────────────────────────────▶  client_kb_jobs
                                                                                             status: "failed"                                           (Realtime fires →
                                                                                             error: "…"                                                  UI: error toast)
```

---

## DB tables touched

| Table | Written by | When |
|---|---|---|
| `client_kb_jobs` | server action | on trigger (insert); each phase webhook (status update); succeeded/failed (terminal) |
| `client_kb_documents` | webhook handler | on success — research Markdown persisted as a doc |
| `client_kb_versions` | webhook handler | on success — full KB snapshot saved and set active |
| `clients` | webhook handler | on success — `kb_status` flipped to `in_review` |

## Real-time UI updates

The browser subscribes to `postgres_changes` on `client_kb_jobs` filtered by `client_id` (via Supabase Realtime). Every webhook phase write to that table fires a change event, which the `useKBJobStatus` hook picks up and reflects in the UI — no polling, no page refresh needed during the build.

## Error handling

Errors at any point in the Trigger.dev task post `{ kind:"failed" }` to the webhook, which marks the job `failed` in the DB. The webhook handler itself wraps the success path in a try/catch and best-effort calls `markKBJobFailed` if any DB write throws. A job stuck in a non-terminal status for >10 minutes can be manually cleared via the UI ("Clear stuck build").
