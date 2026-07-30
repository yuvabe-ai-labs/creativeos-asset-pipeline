# KB Build — Trigger.dev pipeline + brand website research

**Date:** 2026-06-30
**Status:** Approved design. Implementation pending.
**Type:** Design spec (adds **D31**; moves KB extraction off the Vercel route into a Trigger.dev background job and adds an optional brand-website research step).
**Decision record:** ADR **D31** (`2026-05-30-creativeos-staging-roadmap.md` §7 — append).
**Builds on:** **D17** (versioned Brand KB built in Stage 1), **D13** (rented async, no own queue infra — preserved), **D12** (Supabase Realtime push, not polling), **D25** (graduation pattern from disposable execution row into the durable versioned row — *the precedent reused here*).
**Origin:** "while onboarding a client we optionally gather a brand website URL — use that to scrape the details that will be useful for the website and store it in the KB like website analysis." Brainstormed into: free-form LLM research (`gpt-5 + web_search`) → research Markdown lands as another `client_kb_documents` row → existing `kb-extract` UNION-merges it with uploaded docs → no new schema in `TraceableBrandKB`.

---

## 1. Problem

The KB extraction pipeline today runs inside one Next.js route handler (`POST /api/clients/:id/kb/extract`):

1. Fetch uploaded documents from storage.
2. Call `gpt-5.4-mini` (`kb-extract`) over docs.
3. Call image-analyze model over uploaded brand images (parallel).
4. Merge, write `client_kb_versions` row, set active, set `kb_status='in_review'`.

This works synchronously inside a single Vercel function, ~30–60s end-to-end.

Two things break it:

1. **Brand website as a source.** Many clients hand over a URL, not (only) PDFs. Today there's no way to consume that signal — and DIY HTML scraping (fetch + Cheerio / Readability) is a rabbit hole because most modern sites are SPAs whose content is hydrated client-side. The clean modern approach is `gpt-5 + web_search`: pass the URL, let the model browse, return a clean Markdown brand brief. **But that call alone runs 60–120s.** Stacked on the existing extract+image-analyze chain, total wall time blows past Vercel's 60s function ceiling on Hobby (and is uncomfortable even on Pro extended).
2. **No durable progress.** A synchronous route gives the user a single spinner with no phase visibility, no resumability across a page refresh, and no observability for debugging. The KB build is multi-step and now multi-minute; the user needs to see what's happening.

D26's submit→cron pattern is the wrong fit — it was designed for **one** async provider call (Veo) with poll-based completion. KB build is three sequential LLM calls with internal phase transitions a cron poller cannot observe cleanly.

## 2. Goal

Move the KB build into a single **Trigger.dev** background job that runs all phases (optional website research, doc extraction, image analysis, finalize), with **Supabase Realtime**-pushed phase status visible to the user, and the same durable `client_kb_versions` artifact at the end. Reuse the **graduation pattern** D25 introduced — a disposable execution-scratchpad row (`client_kb_jobs`) graduates into a `client_kb_versions` row on success.

Add an optional **brand website URL** input on the KB onboarding page. If present at job start, run a research phase (`gpt-5 + web_search`) that produces a Markdown brand brief; save that Markdown as a `client_kb_documents` row; the existing `kb-extract` UNION-merges it with the uploaded docs **with no schema change to `TraceableBrandKB`**.

## 3. Non-goals (deferred)

- **Cancel button** for a running job. 600s Trigger.dev `maxDuration` is the natural ceiling; one job at a time per client is enforced by a partial unique index. Revisit on first real friction.
- **Re-research without re-extract.** The website Markdown is just another document — re-running the full pipeline is correct and not expensive at MVP scale.
- **Crawl beyond what `gpt-5 + web_search` decides to visit.** No custom crawler; the model picks depth/breadth itself.
- **JS-only / SPA sites that defeat `web_search`.** No headless-browser fallback yet; degrade gracefully (job fails, user fixes URL or removes it).
- **Structured `website_analysis` section in `TraceableBrandKB`.** The existing extractor's UNION-merge is the right synthesis seam — adding a parallel section duplicates fields and loses per-field merge.
- **Streaming phase progress** beyond the four named phases. Phase-banner text is enough; sub-phase progress for the user is over-engineering.
- **Retry policy override** for `kb-build`. `trigger.config.ts` already retries twice; KB build retries are usually wasteful (bugs are upstream of the model call).
- **Multi-tenant secret hardening** for the webhook. Single shared `TRIGGER_WEBHOOK_SECRET` bearer token is sufficient until real auth (D14) lands.

## 4. Design

### 4.1 Architecture — who does what

```
BROWSER → VERCEL (server action) → TRIGGER.DEV (worker) → OPENAI
                                         ↓
                                   VERCEL (webhook) ──→ SUPABASE (DB + Realtime + GCS)
                                                              ↓
                                                          BROWSER (Realtime listener)
```

| Step | Where |
|---|---|
| Insert `client_kb_jobs` row, call `kbBuildTask.trigger(...)`, stamp `trigger_run_id` | **Vercel** server action |
| OpenAI calls (`gpt-5 + web_search`, `kb-extract`, `kb-image-analyze`) | **Trigger.dev worker** |
| Phase status writes during run | **Vercel webhook** (POSTed by worker) |
| GCS upload of research Markdown, insert `client_kb_documents`, insert `client_kb_versions`, set active, mark job succeeded | **Vercel webhook** (terminal handler) |
| Push status to UI | **Supabase Realtime** (passive replication; no app code) |
| Banner + final refresh | **Browser** (`useKBJobStatus` hook) |

**Three boundaries to preserve:**

1. **The worker never touches Supabase or GCS directly.** Every DB/storage write goes through the webhook running in Vercel — same boundary as `video-generate.ts`. One runtime owns DB writes; ordering and idempotency live in one place.
2. **OpenAI time is on Trigger.dev's clock, not Vercel's.** That's the whole reason to move.
3. **Realtime is plumbing**, not application code. The `client_kb_jobs` table is added to the `supabase_realtime` publication; the browser subscribes; Postgres replication does the rest.

### 4.2 Schema

**Migration `0008_client_kb_jobs.sql`:**

```sql
-- 1. Persist the website URL on clients (light validation in app, not DB)
ALTER TABLE clients ADD COLUMN website_url text;

-- 2. KB job execution table — mirrors `generations` (D25)
CREATE TYPE client_kb_job_status AS ENUM (
  'queued',
  'researching',
  'extracting',     -- docs + images run in parallel under this phase
  'finalizing',
  'succeeded',
  'failed'
);

CREATE TABLE client_kb_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status          client_kb_job_status NOT NULL DEFAULT 'queued',
  phase_message   text,
  website_url     text,                          -- frozen at job start
  doc_ids_used    uuid[] NOT NULL DEFAULT '{}',  -- frozen at job start
  trigger_run_id  text,                          -- Trigger.dev run id
  version_id      uuid REFERENCES client_kb_versions(id) ON DELETE SET NULL,  -- set on graduation
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX client_kb_jobs_client_status_idx
  ON client_kb_jobs(client_id, status);

-- 3. One running job per client (partial unique index)
CREATE UNIQUE INDEX client_kb_jobs_one_running_idx
  ON client_kb_jobs(client_id)
  WHERE status IN ('queued','researching','extracting','finalizing');

-- 4. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE client_kb_jobs;
```

**Why this shape:**

- `client_kb_jobs` is the **disposable execution scratchpad** (D25's `generations`-table role, at the client-KB level instead of the node level). On success, it graduates into a `client_kb_versions` row — `client_kb_versions` only ever gains **finished** KB builds; the job table absorbs `queued/running/failed` churn.
- `website_url` and `doc_ids_used` are **frozen on the job row at start**. The user can keep adding/removing docs mid-build; what the build actually consumed is what's on the job row. This is also what gets re-stamped into `client_kb_versions.doc_ids_used` on success.
- `phase_message` is what the UI banner reads — set by each phase, pushed via Realtime.
- `trigger_run_id` makes Trigger.dev's dashboard one-click reachable from a job row (debugging).
- **No new column on `client_kb_versions`** — research provenance is captured because the research Markdown becomes a `client_kb_documents` row and its id lands in the version's `doc_ids_used` array. Existing review UI already shows which docs fed an extraction.
- **Idempotency.** The partial unique index makes a double-click on "Extract & Build KB" raise a unique-violation on the second insert. The server action surfaces this as "A KB build is already running for this client."

### 4.3 Trigger.dev task

**`trigger/kb-build.ts`** — single task, three phases. Mirrors `video-generate.ts`:

```ts
import { task, logger } from "@trigger.dev/sdk/v3";

export const kbBuildTask = task({
  id: "kb-build",
  maxDuration: 600,
  run: async (payload: {
    jobId: string;
    clientId: string;
    websiteUrl: string | null;
    docIds: string[];
    imageIds: string[];
  }) => {
    const appUrl = process.env.APP_URL;
    if (!appUrl) throw new Error("APP_URL env var not set");
    const webhook = `${appUrl}/api/webhooks/kb-build`;
    const secret = process.env.TRIGGER_WEBHOOK_SECRET;

    const postWebhook = (body: object) =>
      fetch(webhook, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${secret}`,
        },
        body: JSON.stringify(body),
      });

    const phase = (status: string, message: string) =>
      postWebhook({ jobId: payload.jobId, kind: "phase", status, message });

    try {
      const docCount = payload.docIds.length;
      const imgCount = payload.imageIds.length;
      const host = payload.websiteUrl
        ? (() => { try { return new URL(payload.websiteUrl).hostname.replace(/^www\./, ""); } catch { return payload.websiteUrl; } })()
        : null;

      // Phase 1: research (optional)
      let researchMarkdown: string | null = null;
      if (payload.websiteUrl) {
        await phase("researching", `Researching ${host}…`);
        const { researchBrandWebsite } = await import("@/lib/kb/website-research");
        researchMarkdown = await researchBrandWebsite(payload.websiteUrl);
      }

      // Phase 2: extract docs + analyze images (parallel)
      await phase("extracting", buildExtractingMessage({
        hasResearch: researchMarkdown !== null,
        docCount,
        imgCount,
      }));
      const { runKBExtraction } = await import("@/lib/kb/extraction");
      const result = await runKBExtraction({
        clientId: payload.clientId,
        docIds: payload.docIds,
        imageIds: payload.imageIds,
        researchMarkdown,
      });

      // Phase 3: finalize (webhook writes DB in one shot)
      await phase("finalizing", "Building knowledge base…");
      await postWebhook({
        jobId: payload.jobId,
        kind: "succeeded",
        researchMarkdown,
        kbOutput: result.kbOutput,
        modelUsed: result.modelUsed,
        fillRate: result.fillRate,
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : "KB build failed";
      logger.error("kb-build failed", { jobId: payload.jobId, error });
      await postWebhook({ jobId: payload.jobId, kind: "failed", error });
    }
  },
});
```

**Smart phase messages — `buildExtractingMessage`** (helper colocated in `trigger/kb-build.ts`):

```ts
function buildExtractingMessage(p: {
  hasResearch: boolean;
  docCount: number;
  imgCount: number;
}): string {
  const docNoun = (n: number) => (n === 1 ? "document" : "documents");
  const imgNoun = (n: number) => (n === 1 ? "image" : "images");
  const docPart = p.docCount > 0 ? `${p.docCount} ${docNoun(p.docCount)}` : null;
  const imgPart = p.imgCount > 0 ? `${p.imgCount} ${imgNoun(p.imgCount)}` : null;

  if (p.hasResearch && !docPart && !imgPart) return "Reading website research…";
  if (docPart && imgPart) return `Reading ${docPart} and analyzing ${imgPart}…`;
  if (docPart) return `Reading ${docPart}…`;
  if (imgPart) return `Analyzing ${imgPart}…`;
  return "Building knowledge base…"; // unreachable — server action rejects empty input
}
```

**Resulting phase banners** the user sees for every realistic input combination — no work is announced that isn't happening:

| Website URL | Docs | Images | `researching` message | `extracting` message |
|---|---|---|---|---|
| ✓ yuvabe.com | 0 | 0 | `Researching yuvabe.com…` | `Reading website research…` |
| ✓ yuvabe.com | 3 | 0 | `Researching yuvabe.com…` | `Reading 3 documents…` |
| ✓ yuvabe.com | 1 | 5 | `Researching yuvabe.com…` | `Reading 1 document and analyzing 5 images…` |
| ✓ yuvabe.com | 3 | 5 | `Researching yuvabe.com…` | `Reading 3 documents and analyzing 5 images…` |
| — | 3 | 0 | *(skipped)* | `Reading 3 documents…` |
| — | 3 | 5 | *(skipped)* | `Reading 3 documents and analyzing 5 images…` |
| — | 0 | ≥1 | *(impossible — button disabled)* | — |
| — | 0 | 0 | *(impossible — button disabled)* | — |

Two principles encoded:
- **Don't lie about work.** If no images, don't say "analyzing images". If no URL, don't say "Researching…".
- **Be specific.** Show actual counts ("3 documents") rather than generic plurals — the user knows what they uploaded; the banner should reflect it.

**Skip work that has nothing to do.** `runKBExtraction` already guards: if `imageIds.length === 0`, the `kb-image-analyze` call is not made (today's route handler already does this — `images.length > 0 ? openai.responses.parse(...) : Promise.resolve(null)`). Carry that branch over unchanged. If `docIds.length === 0` AND `researchMarkdown` is non-null, the `kb-extract` call runs with **only** the research Markdown as input — same prompt, same UNION-merge logic, just a single-document input.

The `finalizing` message stays static (`Building knowledge base…`) — it's one short step.

### 4.4 Lib functions (the actual brain)

**`src/lib/kb/website-research.ts`**

```ts
export async function researchBrandWebsite(url: string): Promise<string> {
  const openai = createOpenAI();
  const res = await openai.responses.create({
    model: websiteResearchPrompt.model,    // "gpt-5"
    input: [
      { role: "system", content: websiteResearchPrompt.system },
      { role: "user", content: `Brand website: ${url}` },
    ],
    tools: [{ type: "web_search" }],
    // No structured output — free-form Markdown (see §4.5).
  });
  const md = res.output_text?.trim();
  if (!md) throw new Error("Website research returned no content.");
  return md;
}
```

**`src/lib/kb/extraction.ts`** — refactor of today's `kb/extract/route.ts` body. Pure: no DB writes, no storage writes. Returns `{ kbOutput, modelUsed, fillRate }`. The only change vs. today's route logic: takes a `docIds` array (frozen by the job) instead of `listKBDocuments(clientId)`, and appends one extra `input_text` item with the research Markdown if provided:

```ts
if (researchMarkdown) {
  docUserContent.push({
    type: "input_text",
    text: `--- Brand website research ---\n${researchMarkdown}`,
  });
}
```

The `kb-extract` system prompt's existing multi-document UNION rules apply unchanged — the research becomes one more brand document.

**`src/prompts/website-research.ts`** — see §4.5.

### 4.5 Research prompt — free-form Markdown, not structured

The research output is **plain Markdown**, not structured `KBField`s. Reason: we feed the output into the existing `kb-extract` LLM as another document, and that extractor already knows how to convert unstructured brand text into `TraceableBrandKB` with confidence/evidence flags and UNION-merge. Shaping the research into `KBField`s here would do the extractor's job twice and lose UNION behavior.

System prompt outline:

```
You are a brand researcher for CreativeOS. Given a brand website URL,
visit it (use the web_search tool) and produce a clean Markdown brief
that a downstream brand-extraction LLM will consume alongside uploaded
brand documents.

INSTRUCTIONS
- Visit the homepage. Follow nav links to about, products/services,
  contact, and 1-2 most prominent content pages. Do NOT crawl the whole
  site — depth is wasted; breadth across page types is what matters.
- Quote distinctive phrases verbatim from the site for tone/voice cues.
- Note hex codes only if visible in stated brand color callouts; do not
  guess from screenshots.
- Spot compliance signals: words the brand uses repeatedly (preferred
  verbs); words conspicuously avoided (e.g. medical claim words for a
  wellness brand); regulatory disclaimers in footer.
- For social: list handle URLs only if linked from the site itself.

OUTPUT
A single Markdown document with these H2 sections (omit a section if
genuinely no signal on it — do NOT invent):

## About
## Voice & tone cues
## Visual cues
## Target audience signals
## Products / services
## Social presence
## Compliance signals spotted
## Sources
   - bullet list of URLs you actually opened
```

### 4.6 Webhook — single owner of DB/storage writes

**`src/app/api/webhooks/kb-build/route.ts`** — bearer-auth'd (`TRIGGER_WEBHOOK_SECRET`). Handles three payload shapes:

| `kind` | Action |
|---|---|
| `"phase"` | `UPDATE client_kb_jobs SET status, phase_message, updated_at` → Realtime push |
| `"succeeded"` | (1) if `researchMarkdown`: `uploadKBDocument(...)` → GCS, then `insertKBDocument(...)`. (2) `insertKBVersion(...)` with `doc_ids_used = job.doc_ids_used ∪ researchDocId`. (3) `setActiveKBVersion(...)`. (4) `setKBStatus(clientId, 'in_review')`. (5) `UPDATE client_kb_jobs SET status='succeeded', version_id` |
| `"failed"` | `UPDATE client_kb_jobs SET status='failed', error` |

All five terminal writes happen in one webhook invocation, in the order above. They are not wrapped in a single Postgres transaction (the GCS upload is non-transactional), but the ordering is chosen so the user-visible truth is consistent: a job is only marked `succeeded` after the KB version exists and is active.

### 4.7 Server action — kicks off the job

**`src/lib/actions/kb.ts`** — `startKBBuildJob(clientId)`:

1. Read `clients.website_url`, `listKBDocuments(clientId)`, `listBrandImages(clientId)`.
2. Reject if no website URL and no documents (button is disabled on the client too, this is the server guard).
3. `INSERT INTO client_kb_jobs` with `status='queued'`, `website_url`, `doc_ids_used` (frozen snapshot). The partial unique index makes this fail if a job is already running — surface as `"A KB build is already running for this client."`
4. `const run = await tasks.trigger("kb-build", { jobId, clientId, websiteUrl, docIds, imageIds })`.
5. `UPDATE client_kb_jobs SET trigger_run_id = run.id WHERE id = jobId`.
6. Return `{ jobId }`.

### 4.8 UI changes

**`src/components/kb/kb-onboarding-upload-step.tsx`** — single field above the two panels:

```
┌────────────────────────────────────────────────────────────┐
│  Brand website (optional)                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ https://yuvabe.com                                    │  │
│  └──────────────────────────────────────────────────────┘  │
│  We'll research the site and add it as a knowledge source. │
└────────────────────────────────────────────────────────────┘

┌─────────────────────────┐   ┌─────────────────────────┐
│  📄 Brand Documents     │   │  🖼  Brand Images       │
│  …existing panel…       │   │  …existing panel…       │
└─────────────────────────┘   └─────────────────────────┘

[✨ Extract & Build KB]   "Add a website or documents to continue"
```

**URL field behavior:**
- Debounced auto-save: on blur or 800ms after typing stops, `PATCH /api/clients/:id/website-url` persists to `clients.website_url`. URL persists whether or not the user runs extraction — so re-running later still has it.
- Light client-side normalization: trim; if no scheme, prepend `https://`. No deeper validation (the LLM will fail loudly if the URL is unreachable, which becomes the error message).

**"Extract & Build KB" button:**
- Enables when **website URL OR at least one document is present** (image-only is still blocked because the extractor needs textual content).
- On click: calls `startKBBuildJob`, gets `jobId`, swaps the page into the running-job view.

**Running-job view** (replaces the right half of the page while job is non-terminal):

```
┌────────────────────────────────────────────────────────────┐
│  ◐  Researching yuvabe.com…                                │
│  This usually takes 60–120 seconds. You can close this tab │
│  and come back — we'll keep building.                      │
└────────────────────────────────────────────────────────────┘
[ KBSkeleton below ]
```

Phase label is driven by `client_kb_jobs.phase_message` over Realtime.

**Terminal states:**
- `status === 'succeeded'` → `toast.success("KB built — review below")`, `router.refresh()`. The KB review step renders as today.
- `status === 'failed'` → `toast.error(job.error)`, upload step reappears with sources intact, button re-enabled. Job row stays for audit; a new click starts a new job.

**`src/components/kb/use-kb-job-status.ts`** — Realtime hook:

```ts
export function useKBJobStatus(clientId: string, initialJob: ClientKBJobRow | null) {
  const [job, setJob] = useState(initialJob);
  useEffect(() => {
    const supabase = createBrowserSupabase();
    const channel = supabase
      .channel(`kb-job:${clientId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "client_kb_jobs",
          filter: `client_id=eq.${clientId}` },
        (payload) => setJob(payload.new as ClientKBJobRow))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientId]);
  return job;
}
```

**Page-load handoff** — `src/app/clients/[slug]/kb/page.tsx` does one extra query: latest job for this client. If non-terminal, boot straight into the running-job view subscribed to that row. So a user who refreshes mid-build, or comes back later, picks up exactly where they left off.

### 4.9 Re-research flow

No special UI. The user edits the URL field, deletes the stale `website-research.md` from the Documents panel, clicks "Extract & Build KB" again. New job → new research → new MD doc → new KB version. Versioning falls out of the existing spine.

### 4.10 Failure modes

| Failure | What happens |
|---|---|
| URL 404s / site blocks `web_search` | `researchBrandWebsite` throws → worker catches → POSTs `failed` with `"Couldn't reach <url>"` → job row marked failed → toast on the page → URL field still populated so user can fix and retry |
| `web_search` succeeds but content is thin | Returns thin Markdown; extraction still runs; fill rate will be low; user sees that in review (existing behavior) |
| OpenAI fails mid-extraction | Worker catches → `failed` webhook → standard error path |
| Trigger.dev worker hits 600s `maxDuration` | Worker dies; phase row stuck at last-set status. **Mitigation:** on page load, if the latest job's `updated_at` is >10 minutes old and status is non-terminal, the running-job view shows a "This build appears stuck — start a new one?" banner with a single button that calls a `markStuckJobFailed(jobId)` server action (one-shot: `UPDATE client_kb_jobs SET status='failed', error='Stuck — manually cleared' WHERE id=? AND status NOT IN ('succeeded','failed')`). That clears the partial unique index, the page returns to the upload step, and a new click on "Extract & Build KB" starts a fresh job. (No cron sweeper for the MVP.) |
| Double-click on "Extract & Build KB" | Partial unique index on `client_kb_jobs` rejects the second insert; server action surfaces the friendly error |

## 5. Trade-offs

**Worker → webhook → DB indirection** vs. direct DB writes from the worker. Indirection wins for the same reason it won in `video-generate.ts`: one runtime owns DB writes, ordering is easy to reason about, the Supabase client config lives in one place. The cost (one round-trip per phase change) is negligible against the 60–120s LLM call dominating each phase.

**Free-form Markdown research** vs. structured `KBField` output from the research step. Markdown wins because the extractor already does the structuring + UNION-merge job; doing it twice would either contradict the merge or lose it.

**One Trigger.dev task with sequential phases** vs. multiple smaller tasks chained by Trigger.dev. One task is simpler — phase transitions are just function calls inside `run()`, no inter-task plumbing. We lose granular retry (a transient failure in phase 2 re-runs phase 1), but the retry policy is already set to 2 attempts at the task level and KB-build phase failures are usually not transient (bad URL, malformed doc) so retry granularity wouldn't help.

**Trigger.dev** vs. **Vercel functions with extended duration + polling**. Trigger.dev wins because: (a) extended duration is a plan-level Pro toggle, not a guaranteed runtime; (b) we already use Trigger.dev for video gen, so this is reuse; (c) the worker has a dashboard for observability that polling does not.

## 6. Out of scope — see §3.

## 7. Files touched

**New:**
- `supabase/migrations/0008_client_kb_jobs.sql`
- `trigger/kb-build.ts`
- `src/lib/kb/website-research.ts`
- `src/lib/kb/extraction.ts`
- `src/prompts/website-research.ts`
- `src/app/api/webhooks/kb-build/route.ts`
- `src/lib/db/kb-jobs.ts` (repo for the new table)
- `src/components/kb/use-kb-job-status.ts`
- `src/app/api/clients/[id]/website-url/route.ts` (PATCH for the debounced URL save)

**Modified:**
- `src/lib/actions/kb.ts` (add `startKBBuildJob`)
- `src/lib/db/types.ts` (add `ClientKBJobRow`; add `website_url` to `ClientRow`)
- `src/components/kb/kb-onboarding-upload-step.tsx` (URL field + Realtime banner + running-job view)
- `src/app/clients/[slug]/kb/page.tsx` (load latest job; pass to upload step)
- `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (append D31)

**Untouched but worth noting:**
- `src/app/api/clients/[id]/kb/extract/route.ts` is **deleted** at the end of this slice — its logic moved into `src/lib/kb/extraction.ts` and is called only from the Trigger.dev worker now.

## 8. ADR to append (D31)

Append to `2026-05-30-creativeos-staging-roadmap.md` §7:

> ### D31 — KB build runs on Trigger.dev with a `client_kb_jobs` graduation table; Supabase Realtime pushes phases *(recorded 2026-06-30; refines D13; reuses D25 pattern)*
>
> **Decision.** The KB build pipeline (optional website research → docs extract → image analyze → graduate to `client_kb_versions`) moves off the Next.js route into a single **Trigger.dev** task `kb-build`. A new **`client_kb_jobs`** table tracks the run (`queued → researching → extracting → finalizing → succeeded/failed`, with `phase_message`, `website_url`, `doc_ids_used`, `trigger_run_id`, `version_id`). On success the job **graduates** into a `client_kb_versions` row + `setActiveKBVersion` + `kb_status='in_review'` — identical pattern to D25's `generations → node_versions` graduation, just at the client-KB level instead of the node-generation level. The Trigger.dev worker holds the OpenAI calls; **a single Vercel webhook owns every DB/Storage write** (same boundary as `video-generate.ts`). The KB onboarding page subscribes to `client_kb_jobs` via **Supabase Realtime** (D12) for phase updates and the terminal refresh; one running job per client is enforced by a partial unique index on non-terminal statuses. Website URL persists on `clients.website_url` so re-research is a button click. Brand website research is a free-form Markdown call (`gpt-5` + `web_search` tool); the output is saved as a `client_kb_documents` row and merged into `TraceableBrandKB` by the existing `kb-extract` UNION rules — **no schema change** to the KB itself.
>
> **Why.** The synchronous KB extract route hit a wall the moment `gpt-5 + web_search` joined the chain — total wall time (research + extract + image-analyze) now exceeds Vercel's 60s function limit, and split-route + cron-reconcile (D26's pattern for Veo) is the wrong shape for a 3-step always-multi-step pipeline that needs phase-by-phase progress visibility. Trigger.dev is **already in the stack** for video gen, so this is reuse, not new infra. Pushing the OpenAI calls onto the worker keeps Vercel time tiny; routing all DB/storage writes through one webhook preserves the "DB writes in one place, in one runtime" boundary that made `video-generate.ts` reasonable to reason about. Treating the research Markdown as just another `client_kb_documents` row means **the extractor's UNION-merge stays the single synthesis seam** — no parallel `website_analysis` section to drift against doc-derived fields.
>
> **Rejected.** (a) **Stay synchronous with extended Vercel function duration.** Brittle (extended duration is a Pro plan toggle, not a guarantee), no durable progress, no observability, no retries. (b) **D26's submit→cron pattern.** Designed for one async provider call with poll-based completion; KB build is three calls with internal phase transitions a cron poller cannot observe cleanly. (c) **Webhook per phase + direct DB writes from worker.** Duplicates the DB-write boundary; the `video-generate.ts` precedent already proved the "worker → webhook → DB" split works. (d) **Structured `website_analysis` section in `TraceableBrandKB`.** Duplicates the extractor's job and loses UNION-merge.
>
> **Refines.** D13 (Trigger.dev is rented async infra, not self-hosted queue — the spirit of D13 is preserved; the parked item "Real queue infra (Redis/SQS/BullMQ + workers)" is unchanged). **Reuses.** D25 (graduation pattern from execution-scratchpad table into the durable versioned table). **Builds on.** D12 (Realtime push, not polling). **D11 unchanged** (the human still clicks Extract & Build — nothing auto-runs).
>
> **Originated.** `2026-06-30-kb-build-trigger-website-research-design.md`.
