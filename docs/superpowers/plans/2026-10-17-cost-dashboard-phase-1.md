# Cost Dashboard — Phase 1 (Recorded) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A super-admin page at `/admin/costs` on production showing what CreativeOS *recorded* spending in staging and production, per month, in rupees: four numbers, accounts → clients → canvases / avatars / scripts, credit coverage, six-month trend, CSV, refreshed nightly and on demand.

**Architecture:** A migration adds summary tables and two SQL functions to both databases: `cost_recorded_rollup` aggregates `generations`, and `cost_replace_recorded` writes summaries atomically. A Trigger.dev task (`cost-sync-nightly` scheduled, plus `cost-sync-refresh` on demand) runs only in the production Trigger.dev project. It calls the rollup on production and on staging (via a staging-only service client), maps rows in TypeScript (feature + provider), and replaces the month's rows. The page reads only the production summary tables, through one API route, with TanStack Query.

**Tech Stack:** Next.js (App Router; see `node_modules/next/dist/docs/` — this version differs from training data), Supabase Postgres + supabase-js, Trigger.dev v4 SDK (`@trigger.dev/sdk/v3` import path, as the repo uses), TanStack Query v5, shadcn/ui (Base UI registry), recharts, vitest.

**Spec:** `docs/superpowers/specs/2026-10-16-cost-dashboard-design.md` (§1–§6, §8–§10 phase 1 parts). ADRs D380–D382.

## Global Constraints

- Tracking starts **2026-11-01**. Nothing earlier is synced or shown (`TRACKING_START = "2026-11-01"`).
- Days are **IST** (`Asia/Kolkata`) calendar days; months are IST calendar months.
- Recorded = `sum(generations.cost_usd)` of `status = 'succeeded'` rows. Credits (`credits_charged`) only feed the "Credit limit used" column.
- Rupees = USD × `cost_fx_rates.usd_to_inr` for the month, falling back to `USD_TO_INR` from `src/lib/pricing.ts` (95.77) when no row exists. Phase 1 has no rate editor.
- Nightly cron `30 20 * * *` (UTC) = 02:00 IST. On days 1–3 of a month the nightly run also recomputes the previous month. Refresh now recomputes the current month only.
- Refresh concurrency: one `running` run at a time; a `running` run older than **10 minutes** is marked failed.
- The sync runs only where `COST_SYNC_PRIMARY=true` (the production Trigger.dev project). The staging project registers the tasks but they exit immediately.
- Staging DB access only via `STAGING_SUPABASE_URL` + `STAGING_SUPABASE_SERVICE_ROLE_KEY`, set **only** in the production Trigger.dev project. The web app never reads them.
- `/admin/costs` and `/api/admin/costs/*` are super-admin only via `requireSuperAdmin()`, which returns **404** to everyone else (repo rule: don't reveal admin surfaces).
- API routes: `apiOk` / `apiError` / `withTryCatch` from `src/lib/api/route-helpers.ts`. Never `NextResponse.json`. The CSV route returns a plain `Response` with `text/csv`.
- Data fetching: three layers — `src/services/admin-costs.service.ts` → `src/hooks/queries/admin-costs.ts` (key factory `adminCostKeys`) → components. Polling via `refetchInterval` returning `false` when done.
- UI: shadcn primitives from `src/components/ui/*` only (no raw `<button>`, `<select>`, `<input>`). `<table>` markup is fine (non-interactive). Clash Display headings (`font-display`), Gilroy body; purple only for primary CTA/focus; `shadow-card` cards; Lucide icons stroke 1.5; motion easing `cubic-bezier(0.22,1,0.36,1)`.
- User-facing copy is plain: no vendor jargon, raw errors or em-dash phrasing. Labels exactly as the approved mockup: "Spent this month" is phase 2; phase 1 KPIs are **"Recorded this month"**, **"Same days last month"**, **"Expected for <Month>"**, **"Generations"**.
- Performance: the page makes one dashboard request (+ one run-status poll while refreshing). Server: independent queries in `Promise.all`. Select only needed columns.
- Migrations are applied by hand in the Supabase SQL editor (no `supabase db push`). Record each in `docs/superpowers/plans/MIGRATIONS-PENDING.md` and `docs/auth-production-migration.md` in the same task.
- Tests: `npx vitest run <path>` per file (the full suite has ~11 known timeout flakes in API route tests; verify per directory).

### Deferred (not in phase 1)
Provider bills, Not recorded, the Providers table, manual entries, the FX editor, gap reasons (phase 2–3). Coverage rows with status `logged` show "Usage saved, not charged" with no amount; their token-based estimate arrives in phase 3.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0057_cost_dashboard.sql` | Tables `cost_daily_recorded`, `cost_sync_runs`, `cost_fx_rates`; functions `cost_recorded_rollup`, `cost_replace_recorded`; `generations(created_at)` index |
| `src/lib/costs/constants.ts` | `TRACKING_START`, `REFRESH_STALE_MS`, `COST_TIMEZONE`, `Env` type |
| `src/lib/costs/coverage.ts` | Coverage registry + `featureFor(scopeType, genType)` |
| `src/lib/costs/providers.ts` | `providerForModel(model)` |
| `src/lib/costs/dates.ts` | IST date helpers, `syncRanges`, `sameDaysWindow`, `expectedForMonth`, `lastSixMonths` |
| `src/lib/costs/rollup.ts` | `RawRollupRow` → `RecordedRow` mapping and re-aggregation |
| `src/lib/costs/dashboard.ts` | Pure `buildDashboard(...)` → `CostDashboard` (KPIs, accounts tree, coverage, trend) + `dashboardToCsv` |
| `src/lib/supabase/staging.ts` | `createStagingSupabase()` (Trigger.dev only) |
| `src/lib/db/cost-dashboard.ts` | DB I/O: rollup RPC, replace RPC, rows for dashboard, runs, FX |
| `src/lib/costs/sync.ts` | `runCostSync(deps)` orchestration (testable with injected deps) |
| `trigger/cost-sync.ts` | `cost-sync-nightly` (schedule) + `cost-sync-refresh` (task) |
| `src/app/api/admin/costs/route.ts` | GET dashboard |
| `src/app/api/admin/costs/refresh/route.ts` | POST start-or-return run |
| `src/app/api/admin/costs/runs/latest/route.ts` | GET latest run |
| `src/app/api/admin/costs/export/route.ts` | GET CSV |
| `src/services/admin-costs.service.ts` | Browser API calls |
| `src/hooks/queries/admin-costs.ts` | Keys + `useCostDashboard`, `useLatestCostRun`, `useRefreshCosts` |
| `src/app/admin/costs/page.tsx` | Server page shell (auth gate) |
| `src/components/admin/costs/*.tsx` | `cost-dashboard.tsx`, `cost-header.tsx`, `cost-kpis.tsx`, `cost-accounts-table.tsx`, `cost-coverage-table.tsx`, `cost-trend-chart.tsx` |
| `src/app/admin/(agencies)/page.tsx` | Add a "Costs" link |

---

### Task 1: Migration — summary tables and SQL functions

**Files:**
- Create: `supabase/migrations/0057_cost_dashboard.sql`
- Modify: `docs/superpowers/plans/MIGRATIONS-PENDING.md` (add pending entry)
- Modify: `docs/auth-production-migration.md` (add "Migration 0057" section with verify queries)

**Interfaces:**
- Produces: table `cost_daily_recorded(day date, env text, org_id uuid, org_name text, org_credit_limit numeric, client_id uuid, client_name text, scope_type text, scope_id uuid, scope_name text, feature text, provider text, model text, cost_usd numeric, credits numeric, generations int)`; table `cost_sync_runs(id uuid, trigger text, requested_by uuid, requested_by_email text, month date, status text, started_at timestamptz, finished_at timestamptz, error text, steps jsonb)`; table `cost_fx_rates(month date pk, usd_to_inr numeric, set_by uuid, set_at timestamptz)`; RPC `cost_recorded_rollup(p_from date, p_to date)` returning `RawRollupRow` columns (see Task 4); RPC `cost_replace_recorded(p_env text, p_from date, p_to date, p_rows jsonb) returns void`.

- [ ] **Step 1: Write the migration**

```sql
-- 0057_cost_dashboard.sql — internal cost dashboard, phase 1 (D380–D382).
-- Apply to BOTH databases: production uses the tables and both functions; staging only needs
-- cost_recorded_rollup (the tables are harmless there). Tracking starts 2026-11-01.

create index if not exists generations_created_at_idx on generations (created_at);

create table if not exists cost_daily_recorded (
  day               date not null,
  env               text not null check (env in ('prod', 'staging')),
  org_id            uuid not null,          -- no FK: staging org ids don't exist in prod
  org_name          text not null,
  org_credit_limit  numeric,
  client_id         uuid,
  client_name       text,
  scope_type        text not null check (scope_type in ('canvas', 'avatar', 'script', 'other')),
  scope_id          uuid,
  scope_name        text,
  feature           text not null,
  provider          text not null,
  model             text not null,
  cost_usd          numeric not null default 0,
  credits           numeric not null default 0,
  generations       int not null default 0
);
create index if not exists cost_daily_recorded_env_day_idx on cost_daily_recorded (env, day);
create index if not exists cost_daily_recorded_day_idx on cost_daily_recorded (day);
alter table cost_daily_recorded enable row level security;   -- no policies: service role only

create table if not exists cost_sync_runs (
  id                  uuid primary key default gen_random_uuid(),
  trigger             text not null check (trigger in ('schedule', 'manual')),
  requested_by        uuid,
  requested_by_email  text,
  month               date not null,
  status              text not null check (status in ('running', 'succeeded', 'failed')),
  started_at          timestamptz not null default now(),
  finished_at         timestamptz,
  error               text,
  steps               jsonb not null default '{}'::jsonb
);
create index if not exists cost_sync_runs_started_at_idx on cost_sync_runs (started_at desc);
-- At most one running run: a second Refresh click conflicts here and gets the existing run.
create unique index if not exists cost_sync_runs_one_running
  on cost_sync_runs ((status)) where status = 'running';
alter table cost_sync_runs enable row level security;

create table if not exists cost_fx_rates (
  month       date primary key,
  usd_to_inr  numeric not null check (usd_to_inr > 0),
  set_by      uuid,
  set_at      timestamptz not null default now()
);
alter table cost_fx_rates enable row level security;

-- Aggregates succeeded generations per IST day and owner. Feature and provider are derived in
-- TypeScript (src/lib/costs/rollup.ts), so this returns the raw generation type and model.
create or replace function cost_recorded_rollup(p_from date, p_to date)
returns table (
  day date, org_id uuid, org_name text, org_credit_limit numeric,
  client_id uuid, client_name text,
  scope_type text, scope_id uuid, scope_name text,
  gen_type text, model_used text,
  cost_usd numeric, credits numeric, generations bigint
)
language sql stable security definer set search_path = public as $$
  select
    (g.created_at at time zone 'Asia/Kolkata')::date,
    g.org_id, o.name, o.monthly_credit_limit,
    coalesce(g.client_id, cv.client_id, a.client_id, s.client_id),
    c.name,
    case when g.node_id is not null then 'canvas'
         when g.avatar_id is not null then 'avatar'
         when g.script_id is not null then 'script'
         else 'other' end,
    coalesce(n.canvas_id, g.avatar_id, g.script_id),
    coalesce(cv.name, nullif(a.name, ''), s.doc -> 'header' ->> 'title'),
    g.type,
    coalesce(g.model_used, 'unknown'),
    sum(coalesce(g.cost_usd, 0)),
    sum(coalesce(g.credits_charged, 0)),
    count(*)
  from generations g
  join organizations o on o.id = g.org_id
  left join nodes n on n.id = g.node_id
  left join canvases cv on cv.id = n.canvas_id
  left join client_avatars a on a.id = g.avatar_id
  left join client_scripts s on s.id = g.script_id
  left join clients c on c.id = coalesce(g.client_id, cv.client_id, a.client_id, s.client_id)
  where g.status = 'succeeded'
    and g.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata')
    and g.created_at <  ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
  group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11;
$$;
revoke all on function cost_recorded_rollup(date, date) from public, anon, authenticated;
grant execute on function cost_recorded_rollup(date, date) to service_role;

-- Replaces one environment's rows for a day range in one transaction (idempotent re-runs).
create or replace function cost_replace_recorded(p_env text, p_from date, p_to date, p_rows jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from cost_daily_recorded where env = p_env and day between p_from and p_to;
  insert into cost_daily_recorded (
    day, env, org_id, org_name, org_credit_limit, client_id, client_name,
    scope_type, scope_id, scope_name, feature, provider, model, cost_usd, credits, generations
  )
  select r.day, p_env, r.org_id, r.org_name, r.org_credit_limit, r.client_id, r.client_name,
         r.scope_type, r.scope_id, r.scope_name, r.feature, r.provider, r.model,
         r.cost_usd, r.credits, r.generations
  from jsonb_to_recordset(p_rows) as r(
    day date, org_id uuid, org_name text, org_credit_limit numeric, client_id uuid,
    client_name text, scope_type text, scope_id uuid, scope_name text, feature text,
    provider text, model text, cost_usd numeric, credits numeric, generations int
  );
end;
$$;
revoke all on function cost_replace_recorded(text, date, date, jsonb) from public, anon, authenticated;
grant execute on function cost_replace_recorded(text, date, date, jsonb) to service_role;
```

- [ ] **Step 2: Record it in the pending-migrations doc**

Add under `## Pending` in `docs/superpowers/plans/MIGRATIONS-PENDING.md`:

```markdown
- [ ] **`0057_cost_dashboard.sql`** — D380–D382 (cost dashboard phase 1)
      Apply to **staging and production**. Tables `cost_daily_recorded`, `cost_sync_runs`,
      `cost_fx_rates` (RLS on, no policies); functions `cost_recorded_rollup`,
      `cost_replace_recorded` (service role only); index `generations_created_at_idx`.
      Verify queries: `docs/auth-production-migration.md` § "Migration 0057".
      **Blocks:** the cost sync task and `/admin/costs`.
```

- [ ] **Step 3: Add verify queries to the migration doc**

Append to `docs/auth-production-migration.md`:

```markdown
## Migration 0057 — cost dashboard (apply to staging and production)

Verify after applying:

    select count(*) from cost_recorded_rollup(current_date - 7, current_date);   -- returns, no error
    select to_regclass('public.cost_daily_recorded'), to_regclass('public.cost_sync_runs'),
           to_regclass('public.cost_fx_rates');                                     -- all non-null
    select has_function_privilege('anon', 'cost_recorded_rollup(date,date)', 'execute'); -- false
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0057_cost_dashboard.sql docs/superpowers/plans/MIGRATIONS-PENDING.md docs/auth-production-migration.md
git commit -m "feat(costs): migration 0057 — cost summary tables and rollup functions (D380)"
```

---

### Task 2: Constants, coverage registry and provider mapping

**Files:**
- Create: `src/lib/costs/constants.ts`, `src/lib/costs/coverage.ts`, `src/lib/costs/providers.ts`
- Test: `src/lib/costs/__tests__/coverage.test.ts`, `src/lib/costs/__tests__/providers.test.ts`

**Interfaces:**
- Produces: `TRACKING_START: "2026-11-01"`, `REFRESH_STALE_MS: 600_000`, `COST_TIMEZONE: "Asia/Kolkata"`, `type Env = "prod" | "staging"`, `type EnvFilter = Env | "all"`; `type ScopeType = "canvas" | "avatar" | "script" | "other"`; `type CoverageStatus = "charged" | "logged" | "none"`; `type CoverageEntry = { feature: string; area: string; label: string; providers: string; status: CoverageStatus }`; `COVERAGE: CoverageEntry[]`; `featureFor(scopeType: ScopeType, genType: string): string`; `providerForModel(model: string): string`.

- [ ] **Step 1: Write the failing tests**

`src/lib/costs/__tests__/coverage.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { COVERAGE, featureFor } from "../coverage";

describe("featureFor", () => {
  it("maps canvas generations by type", () => {
    expect(featureFor("canvas", "video")).toBe("canvas.video");
    expect(featureFor("canvas", "image")).toBe("canvas.image");
    expect(featureFor("canvas", "prompt")).toBe("canvas.prompt");
    expect(featureFor("canvas", "dub")).toBe("canvas.dubbing");
    expect(featureFor("canvas", "lipsync")).toBe("canvas.dubbing");
    expect(featureFor("canvas", "voice")).toBe("canvas.voice_change");
  });
  it("maps avatar and script owners", () => {
    expect(featureFor("avatar", "image")).toBe("avatars.images");
    expect(featureFor("avatar", "video")).toBe("avatars.voice_preview");
    expect(featureFor("script", "image")).toBe("scripts.panels");
  });
  it("falls back to other for anything unmapped", () => {
    expect(featureFor("other", "image")).toBe("other");
    expect(featureFor("canvas", "something-new")).toBe("other");
  });
  it("every feature featureFor can return has a registry entry", () => {
    const keys = new Set(COVERAGE.map((c) => c.feature));
    const produced = [
      ["canvas", "video"], ["canvas", "image"], ["canvas", "prompt"], ["canvas", "dub"],
      ["canvas", "lipsync"], ["canvas", "voice"], ["avatar", "image"], ["avatar", "video"],
      ["script", "image"], ["other", "x"],
    ] as const;
    for (const [s, t] of produced) expect(keys.has(featureFor(s, t))).toBe(true);
  });
  it("registry keys are unique", () => {
    const keys = COVERAGE.map((c) => c.feature);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
```

`src/lib/costs/__tests__/providers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { providerForModel } from "../providers";

describe("providerForModel", () => {
  it.each([
    ["openai:gpt-4.1", "openai"],
    ["fal:lipsync-2-pro", "fal"],
    ["sarvam:dub", "sarvam"],
    ["gemini:gemini-2.5-flash", "google"],
    ["veo-3.1-generate-preview", "google"],
    ["gemini-2.5-flash-image", "google"],
    ["imagen-4.0", "google"],
    ["kling-v3", "kling"],
    ["kling-video-o1", "kling"],
    ["seedream-5-0-lite-260128", "byteplus"],
    ["dreamina-seedance-2-5", "byteplus"],
    ["omnihuman-1.5", "byteplus"],
    ["sora-2", "openai"],
    ["gpt-image-1", "openai"],
    ["eleven_multilingual_sts_v2", "elevenlabs"],
    ["fal-ai/sync-lipsync/v2", "fal"],
    ["unknown", "other"],
  ])("%s → %s", (model, provider) => {
    expect(providerForModel(model)).toBe(provider);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/costs/__tests__/coverage.test.ts src/lib/costs/__tests__/providers.test.ts`
Expected: FAIL — cannot find module `../coverage` / `../providers`.

- [ ] **Step 3: Implement**

`src/lib/costs/constants.ts`:

```ts
// Cost dashboard constants (docs/superpowers/specs/2026-10-16-cost-dashboard-design.md, D380–D382).

/** First day the dashboard syncs or shows. Staging and production got separate provider keys in Oct 2026. */
export const TRACKING_START = "2026-11-01";
/** A `running` sync older than this counts as failed, so Refresh now can start a new one. */
export const REFRESH_STALE_MS = 10 * 60 * 1000;
export const COST_TIMEZONE = "Asia/Kolkata";

export type Env = "prod" | "staging";
export type EnvFilter = Env | "all";
export const ENVS: Env[] = ["prod", "staging"];
```

`src/lib/costs/coverage.ts`:

```ts
// The credit coverage registry (D382): every feature that spends money, and whether it charges
// credits. Hand-maintained — when a feature is connected to the credit system, flip its status.
// `feature` keys are what cost_daily_recorded.feature stores (via featureFor).

export type ScopeType = "canvas" | "avatar" | "script" | "other";
export type CoverageStatus = "charged" | "logged" | "none";
export type CoverageEntry = {
  feature: string;
  area: "Canvas" | "Avatars" | "Scripts" | "Brand kit" | "Research" | "Other";
  label: string;
  providers: string;
  status: CoverageStatus;
};

export const COVERAGE: CoverageEntry[] = [
  { feature: "canvas.video", area: "Canvas", label: "Video generation", providers: "Google, Kling, OpenAI, BytePlus", status: "charged" },
  { feature: "canvas.image", area: "Canvas", label: "Image generation and composite", providers: "Google, OpenAI, BytePlus", status: "charged" },
  { feature: "canvas.dubbing", area: "Canvas", label: "Dubbing and lip sync", providers: "Sarvam, ElevenLabs, fal", status: "charged" },
  { feature: "canvas.prompt", area: "Canvas", label: "Prompt, video prompt, multishot", providers: "OpenAI, Google", status: "charged" },
  { feature: "canvas.voice_change", area: "Canvas", label: "Voice change", providers: "ElevenLabs", status: "charged" },
  { feature: "canvas.parse", area: "Canvas", label: "Script parsing, split scene, compose ideas", providers: "OpenAI", status: "logged" },
  { feature: "canvas.dub_voice_preview", area: "Canvas", label: "Dubbing voice preview", providers: "ElevenLabs, Sarvam", status: "none" },
  { feature: "canvas.assistant", area: "Canvas", label: "Canvas assistant", providers: "OpenAI", status: "none" },
  { feature: "canvas.file_reading", area: "Canvas", label: "Reading uploaded files", providers: "OpenAI, Google", status: "none" },
  { feature: "avatars.images", area: "Avatars", label: "Avatar images (front, sheet, variations)", providers: "Google, OpenAI, BytePlus", status: "charged" },
  { feature: "avatars.voice_preview", area: "Avatars", label: "Avatar voice preview", providers: "ElevenLabs", status: "charged" },
  { feature: "scripts.panels", area: "Scripts", label: "Storyboard panels", providers: "Google, OpenAI, BytePlus", status: "charged" },
  { feature: "scripts.copilot", area: "Scripts", label: "Script writing copilot", providers: "OpenAI, Google", status: "none" },
  { feature: "brand_kit.knowledge_base", area: "Brand kit", label: "Knowledge base build and image analysis", providers: "OpenAI, Google", status: "none" },
  { feature: "research.apify", area: "Research", label: "Market research and social import", providers: "Apify", status: "none" },
  { feature: "other", area: "Other", label: "Other recorded generations", providers: "Various", status: "charged" },
];

const CANVAS_BY_TYPE: Record<string, string> = {
  video: "canvas.video",
  image: "canvas.image",
  prompt: "canvas.prompt",
  dub: "canvas.dubbing",
  lipsync: "canvas.dubbing",
  voice: "canvas.voice_change",
};

/** The coverage feature a recorded generation belongs to, from its owner and generations.type. */
export function featureFor(scopeType: ScopeType, genType: string): string {
  if (scopeType === "canvas") return CANVAS_BY_TYPE[genType] ?? "other";
  if (scopeType === "avatar") return genType === "video" ? "avatars.voice_preview" : genType === "image" ? "avatars.images" : "other";
  if (scopeType === "script") return genType === "image" ? "scripts.panels" : "other";
  return "other";
}
```

`src/lib/costs/providers.ts`:

```ts
// Which provider billed a generation, from generations.model_used. Some call sites store
// "provider:model", others the vendor's bare model id.
const PREFIXES: Record<string, string> = { openai: "openai", fal: "fal", sarvam: "sarvam", gemini: "google", google: "google", kling: "kling", byteplus: "byteplus", elevenlabs: "elevenlabs" };

const BARE: Array<[RegExp, string]> = [
  [/^(veo|gemini|imagen)/, "google"],
  [/^kling/, "kling"],
  [/^(seedream|seedance|dreamina|omnihuman)/, "byteplus"],
  [/^(gpt|sora|dall-e|o\d)/, "openai"],
  [/^eleven/, "elevenlabs"],
  [/^fal-ai\//, "fal"],
  [/^(bulbul|saarika|saaras|sarvam)/, "sarvam"],
];

export function providerForModel(model: string): string {
  const m = model.trim().toLowerCase();
  const colon = m.indexOf(":");
  if (colon > 0 && PREFIXES[m.slice(0, colon)]) return PREFIXES[m.slice(0, colon)];
  for (const [re, provider] of BARE) if (re.test(m)) return provider;
  return "other";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/costs/__tests__/coverage.test.ts src/lib/costs/__tests__/providers.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/lib/costs/constants.ts src/lib/costs/coverage.ts src/lib/costs/providers.ts src/lib/costs/__tests__
git commit -m "feat(costs): coverage registry, feature and provider mapping (D382)"
```

---

### Task 3: IST date helpers

**Files:**
- Create: `src/lib/costs/dates.ts`
- Test: `src/lib/costs/__tests__/dates.test.ts`

**Interfaces:**
- Consumes: `TRACKING_START`, `COST_TIMEZONE` (Task 2).
- Produces: `type DateRange = { from: string; to: string }` (ISO `YYYY-MM-DD`, inclusive); `istToday(now: Date): string`; `monthOf(day: string): string` (`YYYY-MM`); `monthRange(month: string): DateRange`; `syncRanges(now: Date, trigger: "schedule" | "manual"): DateRange[]`; `sameDaysWindow(month: string, now: Date): { current: DateRange; previous: DateRange; daysElapsed: number; daysInMonth: number; isCurrent: boolean }`; `lastSixMonths(month: string): string[]` (oldest first, clipped to tracking start); `expectedForMonth(recordedSoFar: number, daysElapsed: number, daysInMonth: number): number`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { istToday, monthRange, syncRanges, sameDaysWindow, lastSixMonths, expectedForMonth } from "../dates";

const at = (iso: string) => new Date(iso);

describe("istToday", () => {
  it("uses the IST calendar day", () => {
    expect(istToday(at("2026-11-30T19:00:00Z"))).toBe("2026-12-01"); // 00:30 IST
    expect(istToday(at("2026-11-30T18:00:00Z"))).toBe("2026-11-30"); // 23:30 IST
  });
});

describe("monthRange", () => {
  it("covers the whole month", () => {
    expect(monthRange("2026-11")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(monthRange("2027-02")).toEqual({ from: "2027-02-01", to: "2027-02-28" });
  });
});

describe("syncRanges", () => {
  it("manual refresh recomputes the current month to today", () => {
    expect(syncRanges(at("2026-11-16T06:00:00Z"), "manual")).toEqual([{ from: "2026-11-01", to: "2026-11-16" }]);
  });
  it("nightly on days 1–3 also recomputes the previous month", () => {
    expect(syncRanges(at("2026-12-02T20:30:00Z"), "schedule")).toEqual([
      { from: "2026-12-01", to: "2026-12-03" },
      { from: "2026-11-01", to: "2026-11-30" },
    ]);
  });
  it("nightly after day 3 only does the current month", () => {
    expect(syncRanges(at("2026-12-10T20:30:00Z"), "schedule")).toEqual([{ from: "2026-12-01", to: "2026-12-11" }]);
  });
  it("never reaches before tracking start", () => {
    expect(syncRanges(at("2026-10-20T06:00:00Z"), "manual")).toEqual([]);
    expect(syncRanges(at("2026-11-01T20:30:00Z"), "schedule")).toEqual([{ from: "2026-11-01", to: "2026-11-02" }]);
  });
});

describe("sameDaysWindow", () => {
  it("current month compares the same number of days", () => {
    expect(sameDaysWindow("2026-12", at("2026-12-16T06:00:00Z"))).toEqual({
      current: { from: "2026-12-01", to: "2026-12-16" },
      previous: { from: "2026-11-01", to: "2026-11-16" },
      daysElapsed: 16, daysInMonth: 31, isCurrent: true,
    });
  });
  it("a past month compares whole months, clipping short previous months", () => {
    expect(sameDaysWindow("2027-03", at("2027-04-05T06:00:00Z"))).toEqual({
      current: { from: "2027-03-01", to: "2027-03-31" },
      previous: { from: "2027-02-01", to: "2027-02-28" },
      daysElapsed: 31, daysInMonth: 31, isCurrent: false,
    });
  });
});

describe("lastSixMonths", () => {
  it("lists six months oldest first, clipped to tracking start", () => {
    expect(lastSixMonths("2027-06")).toEqual(["2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06"]);
    expect(lastSixMonths("2027-01")).toEqual(["2026-11", "2026-12", "2027-01"]);
  });
});

describe("expectedForMonth", () => {
  it("extrapolates the month's pace", () => {
    expect(expectedForMonth(1600, 16, 31)).toBe(3100);
    expect(expectedForMonth(0, 0, 30)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/costs/__tests__/dates.test.ts`
Expected: FAIL — cannot find module `../dates`.

- [ ] **Step 3: Implement**

```ts
// IST calendar helpers for the cost dashboard. All dates are ISO strings (YYYY-MM-DD) in IST.
import { COST_TIMEZONE, TRACKING_START } from "./constants";

export type DateRange = { from: string; to: string };

const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: COST_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });

export function istToday(now: Date): string {
  return fmt.format(now); // en-CA formats as YYYY-MM-DD
}

export function monthOf(day: string): string {
  return day.slice(0, 7);
}

function daysIn(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function monthRange(month: string): DateRange {
  return { from: `${month}-01`, to: `${month}-${pad(daysIn(month))}` };
}

function clip(range: DateRange): DateRange | null {
  if (range.to < TRACKING_START) return null;
  return { from: range.from < TRACKING_START ? TRACKING_START : range.from, to: range.to };
}

/** Which day ranges a sync recomputes: the current month to today, plus (nightly, days 1–3) the previous month. */
export function syncRanges(now: Date, trigger: "schedule" | "manual"): DateRange[] {
  const today = istToday(now);
  const month = monthOf(today);
  const ranges: Array<DateRange | null> = [clip({ from: `${month}-01`, to: today })];
  if (trigger === "schedule" && Number(today.slice(8, 10)) <= 3) ranges.push(clip(monthRange(shiftMonth(month, -1))));
  return ranges.filter((r): r is DateRange => r !== null);
}

export function sameDaysWindow(month: string, now: Date) {
  const today = istToday(now);
  const isCurrent = monthOf(today) === month;
  const daysInMonth = daysIn(month);
  const daysElapsed = isCurrent ? Number(today.slice(8, 10)) : daysInMonth;
  const prev = shiftMonth(month, -1);
  const prevDays = Math.min(daysElapsed, daysIn(prev));
  return {
    current: { from: `${month}-01`, to: `${month}-${pad(daysElapsed)}` },
    previous: { from: `${prev}-01`, to: `${prev}-${pad(prevDays)}` },
    daysElapsed,
    daysInMonth,
    isCurrent,
  };
}

export function lastSixMonths(month: string): string[] {
  const start = monthOf(TRACKING_START);
  return [-5, -4, -3, -2, -1, 0].map((d) => shiftMonth(month, d)).filter((m) => m >= start);
}

export function expectedForMonth(recordedSoFar: number, daysElapsed: number, daysInMonth: number): number {
  if (daysElapsed <= 0) return 0;
  return Math.round((recordedSoFar / daysElapsed) * daysInMonth);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/costs/__tests__/dates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/costs/dates.ts src/lib/costs/__tests__/dates.test.ts
git commit -m "feat(costs): IST date helpers for sync windows and comparisons"
```

---

### Task 4: Rollup mapping and DB access layer

**Files:**
- Create: `src/lib/costs/rollup.ts`, `src/lib/supabase/staging.ts`, `src/lib/db/cost-dashboard.ts`
- Test: `src/lib/costs/__tests__/rollup.test.ts`, `src/lib/db/__tests__/cost-dashboard.test.ts`

**Interfaces:**
- Consumes: `featureFor`, `ScopeType` (Task 2), `providerForModel` (Task 2), `Env`, `REFRESH_STALE_MS` (Task 2), `DateRange` (Task 3).
- Produces:
  - `type RawRollupRow = { day: string; org_id: string; org_name: string; org_credit_limit: number | null; client_id: string | null; client_name: string | null; scope_type: ScopeType; scope_id: string | null; scope_name: string | null; gen_type: string; model_used: string; cost_usd: number; credits: number; generations: number }`
  - `type RecordedRow = { day: string; org_id: string; org_name: string; org_credit_limit: number | null; client_id: string | null; client_name: string | null; scope_type: ScopeType; scope_id: string | null; scope_name: string | null; feature: string; provider: string; model: string; cost_usd: number; credits: number; generations: number }`
  - `type StoredRecordedRow = RecordedRow & { env: Env }`
  - `mapRollupRows(raw: RawRollupRow[]): RecordedRow[]`
  - `createStagingSupabase(): SupabaseClient` (throws if env vars missing)
  - `readRecordedRollup(client: SupabaseClient, range: DateRange): Promise<RawRollupRow[]>`
  - `replaceRecorded(env: Env, range: DateRange, rows: RecordedRow[]): Promise<void>`
  - `listRecordedRows(range: DateRange): Promise<StoredRecordedRow[]>`
  - `type CostSyncRun = { id: string; trigger: "schedule" | "manual"; requested_by_email: string | null; month: string; status: "running" | "succeeded" | "failed"; started_at: string; finished_at: string | null; error: string | null; steps: Record<string, { ok: boolean; message?: string; rows?: number }> }`
  - `startOrGetRun(input: { trigger: "schedule" | "manual"; month: string; requestedBy?: string; requestedByEmail?: string | null; now?: Date }): Promise<{ run: CostSyncRun; created: boolean }>`
  - `finishRun(id: string, result: { status: "succeeded" | "failed"; steps: CostSyncRun["steps"]; error?: string }): Promise<void>`
  - `getLatestRun(): Promise<CostSyncRun | null>`
  - `getFxRate(month: string): Promise<number>` (falls back to `USD_TO_INR`)

- [ ] **Step 1: Write the failing tests**

`src/lib/costs/__tests__/rollup.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapRollupRows, type RawRollupRow } from "../rollup";

const raw = (over: Partial<RawRollupRow>): RawRollupRow => ({
  day: "2026-11-05", org_id: "o1", org_name: "Digital Marketing", org_credit_limit: 150000,
  client_id: "c1", client_name: "Brightline", scope_type: "canvas", scope_id: "cv1", scope_name: "Diwali reel",
  gen_type: "video", model_used: "kling-v3", cost_usd: 1.5, credits: 1500, generations: 2, ...over,
});

describe("mapRollupRows", () => {
  it("adds feature and provider and keeps the model", () => {
    const [row] = mapRollupRows([raw({})]);
    expect(row).toMatchObject({ feature: "canvas.video", provider: "kling", model: "kling-v3", cost_usd: 1.5, credits: 1500, generations: 2 });
  });
  it("coerces numeric strings from PostgREST", () => {
    const [row] = mapRollupRows([raw({ cost_usd: "0.25" as unknown as number, generations: "3" as unknown as number })]);
    expect(row.cost_usd).toBe(0.25);
    expect(row.generations).toBe(3);
  });
  it("merges rows that collapse to the same feature (dub + lipsync on one canvas, same model)", () => {
    const rows = mapRollupRows([
      raw({ gen_type: "dub", model_used: "sarvam:dub", cost_usd: 1, generations: 1 }),
      raw({ gen_type: "lipsync", model_used: "sarvam:dub", cost_usd: 2, generations: 1 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ feature: "canvas.dubbing", cost_usd: 3, generations: 2 });
  });
});
```

`src/lib/db/__tests__/cost-dashboard.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => db }));

import { replaceRecorded, startOrGetRun, getFxRate } from "../cost-dashboard";

// Minimal chainable query-builder stub: every method returns the builder; awaiting resolves `result`.
function builder(result: unknown) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "insert", "update", "eq", "lt", "gte", "lte", "order", "limit", "maybeSingle", "single"]) b[m] = vi.fn(() => b);
  b.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return b;
}

beforeEach(() => vi.clearAllMocks());

describe("replaceRecorded", () => {
  it("sends the env, range and rows to the replace function", async () => {
    db.rpc.mockResolvedValue({ error: null });
    await replaceRecorded("staging", { from: "2026-11-01", to: "2026-11-16" }, []);
    expect(db.rpc).toHaveBeenCalledWith("cost_replace_recorded", { p_env: "staging", p_from: "2026-11-01", p_to: "2026-11-16", p_rows: [] });
  });
});

describe("startOrGetRun", () => {
  it("fails stale running runs, then inserts a new one", async () => {
    const stale = builder({ error: null });
    const insert = builder({ data: { id: "r2", status: "running" }, error: null });
    db.from.mockReturnValueOnce(stale).mockReturnValueOnce(insert);
    const { run, created } = await startOrGetRun({ trigger: "manual", month: "2026-11", requestedBy: "u1", requestedByEmail: "a@b.c", now: new Date("2026-11-16T06:00:00Z") });
    expect(created).toBe(true);
    expect(run.id).toBe("r2");
    expect(stale.update).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
    expect(stale.lt).toHaveBeenCalledWith("started_at", "2026-11-16T05:50:00.000Z");
  });
  it("returns the running run when the insert conflicts", async () => {
    db.from
      .mockReturnValueOnce(builder({ error: null }))
      .mockReturnValueOnce(builder({ data: null, error: { code: "23505" } }))
      .mockReturnValueOnce(builder({ data: { id: "r1", status: "running" }, error: null }));
    const { run, created } = await startOrGetRun({ trigger: "manual", month: "2026-11" });
    expect(created).toBe(false);
    expect(run.id).toBe("r1");
  });
});

describe("getFxRate", () => {
  it("falls back to the app's USD_TO_INR when no rate is stored", async () => {
    db.from.mockReturnValueOnce(builder({ data: null, error: null }));
    expect(await getFxRate("2026-11")).toBe(95.77);
  });
  it("uses the stored rate", async () => {
    db.from.mockReturnValueOnce(builder({ data: { usd_to_inr: "88.4" }, error: null }));
    expect(await getFxRate("2026-11")).toBe(88.4);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/costs/__tests__/rollup.test.ts src/lib/db/__tests__/cost-dashboard.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/lib/costs/rollup.ts`**

```ts
// Turns cost_recorded_rollup rows into stored rows: adds the coverage feature and the provider,
// and merges rows that become identical once dub/lipsync etc. share a feature.
import { featureFor, type ScopeType } from "./coverage";
import { providerForModel } from "./providers";
import type { Env } from "./constants";

export type RawRollupRow = {
  day: string; org_id: string; org_name: string; org_credit_limit: number | null;
  client_id: string | null; client_name: string | null;
  scope_type: ScopeType; scope_id: string | null; scope_name: string | null;
  gen_type: string; model_used: string; cost_usd: number; credits: number; generations: number;
};

export type RecordedRow = Omit<RawRollupRow, "gen_type" | "model_used"> & { feature: string; provider: string; model: string };
export type StoredRecordedRow = RecordedRow & { env: Env };

const num = (v: unknown) => (v == null ? 0 : Number(v));

export function mapRollupRows(raw: RawRollupRow[]): RecordedRow[] {
  const merged = new Map<string, RecordedRow>();
  for (const r of raw) {
    const feature = featureFor(r.scope_type, r.gen_type);
    const key = [r.day, r.org_id, r.client_id, r.scope_type, r.scope_id, feature, r.model_used].join("|");
    const existing = merged.get(key);
    if (existing) {
      existing.cost_usd += num(r.cost_usd);
      existing.credits += num(r.credits);
      existing.generations += num(r.generations);
      continue;
    }
    merged.set(key, {
      day: r.day, org_id: r.org_id, org_name: r.org_name,
      org_credit_limit: r.org_credit_limit == null ? null : num(r.org_credit_limit),
      client_id: r.client_id, client_name: r.client_name,
      scope_type: r.scope_type, scope_id: r.scope_id, scope_name: r.scope_name,
      feature, provider: providerForModel(r.model_used), model: r.model_used,
      cost_usd: num(r.cost_usd), credits: num(r.credits), generations: num(r.generations),
    });
  }
  return [...merged.values()];
}
```

- [ ] **Step 4: Implement `src/lib/supabase/staging.ts`**

```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client for the STAGING database, used only by the cost sync task running in the
// production Trigger.dev project (D380). The web app never sets these variables.
export function createStagingSupabase() {
  const url = process.env.STAGING_SUPABASE_URL;
  const key = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing STAGING_SUPABASE_URL or STAGING_SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
```

- [ ] **Step 5: Implement `src/lib/db/cost-dashboard.ts`**

```ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { USD_TO_INR } from "@/lib/pricing";
import { REFRESH_STALE_MS, type Env } from "@/lib/costs/constants";
import type { DateRange } from "@/lib/costs/dates";
import type { RawRollupRow, RecordedRow, StoredRecordedRow } from "@/lib/costs/rollup";

export type CostSyncRun = {
  id: string;
  trigger: "schedule" | "manual";
  requested_by_email: string | null;
  month: string;
  status: "running" | "succeeded" | "failed";
  started_at: string;
  finished_at: string | null;
  error: string | null;
  steps: Record<string, { ok: boolean; message?: string; rows?: number }>;
};

const RUN_COLUMNS = "id, trigger, requested_by_email, month, status, started_at, finished_at, error, steps";
const ROW_COLUMNS =
  "day, env, org_id, org_name, org_credit_limit, client_id, client_name, scope_type, scope_id, scope_name, feature, provider, model, cost_usd, credits, generations";

export async function readRecordedRollup(client: SupabaseClient, range: DateRange): Promise<RawRollupRow[]> {
  const { data, error } = await client.rpc("cost_recorded_rollup", { p_from: range.from, p_to: range.to });
  if (error) throw error;
  return (data ?? []) as RawRollupRow[];
}

export async function replaceRecorded(env: Env, range: DateRange, rows: RecordedRow[]): Promise<void> {
  const { error } = await createServerSupabase().rpc("cost_replace_recorded", {
    p_env: env, p_from: range.from, p_to: range.to, p_rows: rows,
  });
  if (error) throw error;
}

/** Every stored row in the range, both environments (the caller filters by env). */
export async function listRecordedRows(range: DateRange): Promise<StoredRecordedRow[]> {
  const { data, error } = await createServerSupabase()
    .from("cost_daily_recorded")
    .select(ROW_COLUMNS)
    .gte("day", range.from)
    .lte("day", range.to);
  if (error) throw error;
  return ((data ?? []) as StoredRecordedRow[]).map((r) => ({
    ...r,
    cost_usd: Number(r.cost_usd), credits: Number(r.credits), generations: Number(r.generations),
    org_credit_limit: r.org_credit_limit == null ? null : Number(r.org_credit_limit),
  }));
}

export async function startOrGetRun(input: {
  trigger: "schedule" | "manual"; month: string; requestedBy?: string; requestedByEmail?: string | null; now?: Date;
}): Promise<{ run: CostSyncRun; created: boolean }> {
  const supabase = createServerSupabase();
  const now = input.now ?? new Date();
  const staleBefore = new Date(now.getTime() - REFRESH_STALE_MS).toISOString();

  const { error: staleError } = await supabase
    .from("cost_sync_runs")
    .update({ status: "failed", finished_at: now.toISOString(), error: "Timed out" })
    .eq("status", "running")
    .lt("started_at", staleBefore);
  if (staleError) throw staleError;

  const { data, error } = await supabase
    .from("cost_sync_runs")
    .insert({
      trigger: input.trigger, month: `${input.month}-01`, status: "running",
      requested_by: input.requestedBy ?? null, requested_by_email: input.requestedByEmail ?? null,
    })
    .select(RUN_COLUMNS)
    .single();
  if (!error) return { run: data as CostSyncRun, created: true };
  if ((error as { code?: string }).code !== "23505") throw error;

  const { data: running, error: readError } = await supabase
    .from("cost_sync_runs")
    .select(RUN_COLUMNS)
    .eq("status", "running")
    .maybeSingle();
  if (readError) throw readError;
  return { run: running as CostSyncRun, created: false };
}

export async function finishRun(
  id: string,
  result: { status: "succeeded" | "failed"; steps: CostSyncRun["steps"]; error?: string },
): Promise<void> {
  const { error } = await createServerSupabase()
    .from("cost_sync_runs")
    .update({ status: result.status, steps: result.steps, error: result.error ?? null, finished_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function getLatestRun(): Promise<CostSyncRun | null> {
  const { data, error } = await createServerSupabase()
    .from("cost_sync_runs")
    .select(RUN_COLUMNS)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as CostSyncRun | null) ?? null;
}

export async function getFxRate(month: string): Promise<number> {
  const { data, error } = await createServerSupabase()
    .from("cost_fx_rates")
    .select("usd_to_inr")
    .eq("month", `${month}-01`)
    .maybeSingle();
  if (error) throw error;
  return data ? Number((data as { usd_to_inr: number | string }).usd_to_inr) : USD_TO_INR;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/lib/costs/__tests__/rollup.test.ts src/lib/db/__tests__/cost-dashboard.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/costs/rollup.ts src/lib/supabase/staging.ts src/lib/db/cost-dashboard.ts src/lib/costs/__tests__/rollup.test.ts src/lib/db/__tests__/cost-dashboard.test.ts
git commit -m "feat(costs): rollup mapping and cost dashboard DB layer"
```

---

### Task 5: Sync orchestration and Trigger.dev tasks

**Files:**
- Create: `src/lib/costs/sync.ts`, `trigger/cost-sync.ts`
- Test: `src/lib/costs/__tests__/sync.test.ts`

**Interfaces:**
- Consumes: `syncRanges`, `monthOf`, `istToday` (Task 3); `mapRollupRows` (Task 4); `readRecordedRollup`, `replaceRecorded`, `startOrGetRun`, `finishRun`, `CostSyncRun` (Task 4); `createStagingSupabase` (Task 4); `createServerSupabase`.
- Produces: `type SyncDeps = { now: Date; trigger: "schedule" | "manual"; runId?: string; readProd: (r: DateRange) => Promise<RawRollupRow[]>; readStaging: (r: DateRange) => Promise<RawRollupRow[]>; replace: (env: Env, r: DateRange, rows: RecordedRow[]) => Promise<void>; startRun: typeof startOrGetRun; finishRun: typeof finishRun }`; `runCostSync(deps: SyncDeps): Promise<{ runId: string; status: "succeeded" | "failed"; steps: CostSyncRun["steps"] }>`. Trigger task ids `cost-sync-nightly` (schedule) and `cost-sync-refresh` (payload `{ runId: string }`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { runCostSync, type SyncDeps } from "../sync";
import type { RawRollupRow } from "../rollup";

const row: RawRollupRow = {
  day: "2026-11-05", org_id: "o1", org_name: "DM", org_credit_limit: null, client_id: "c1", client_name: "B",
  scope_type: "canvas", scope_id: "cv1", scope_name: "Reel", gen_type: "video", model_used: "kling-v3",
  cost_usd: 1, credits: 1000, generations: 1,
};

function deps(over: Partial<SyncDeps> = {}): SyncDeps {
  return {
    now: new Date("2026-11-16T06:00:00Z"),
    trigger: "manual",
    runId: "r1",
    readProd: vi.fn(async () => [row]),
    readStaging: vi.fn(async () => []),
    replace: vi.fn(async () => undefined),
    startRun: vi.fn(async () => ({ run: { id: "r-new" } as never, created: true })),
    finishRun: vi.fn(async () => undefined),
    ...over,
  };
}

describe("runCostSync", () => {
  it("replaces each environment's current month and records success", async () => {
    const d = deps();
    const result = await runCostSync(d);
    expect(d.replace).toHaveBeenCalledWith("prod", { from: "2026-11-01", to: "2026-11-16" }, [expect.objectContaining({ feature: "canvas.video", provider: "kling" })]);
    expect(d.replace).toHaveBeenCalledWith("staging", { from: "2026-11-01", to: "2026-11-16" }, []);
    expect(result).toMatchObject({ runId: "r1", status: "succeeded" });
    expect(d.finishRun).toHaveBeenCalledWith("r1", expect.objectContaining({ status: "succeeded" }));
  });

  it("a failed environment keeps its old rows and marks the run failed, the other still updates", async () => {
    const d = deps({ readStaging: vi.fn(async () => { throw new Error("staging down"); }) });
    const result = await runCostSync(d);
    expect(d.replace).toHaveBeenCalledTimes(1);
    expect(d.replace).toHaveBeenCalledWith("prod", expect.anything(), expect.anything());
    expect(result.status).toBe("failed");
    expect(result.steps["staging 2026-11-01..2026-11-16"]).toEqual({ ok: false, message: "staging down" });
  });

  it("a scheduled run starts its own run row", async () => {
    const d = deps({ trigger: "schedule", runId: undefined });
    const result = await runCostSync(d);
    expect(d.startRun).toHaveBeenCalledWith({ trigger: "schedule", month: "2026-11" });
    expect(result.runId).toBe("r-new");
  });

  it("does nothing before tracking starts, but still closes the run", async () => {
    const d = deps({ now: new Date("2026-10-20T06:00:00Z") });
    const result = await runCostSync(d);
    expect(d.replace).not.toHaveBeenCalled();
    expect(result.status).toBe("succeeded");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/costs/__tests__/sync.test.ts`
Expected: FAIL — cannot find module `../sync`.

- [ ] **Step 3: Implement `src/lib/costs/sync.ts`**

```ts
// Cost sync orchestration (spec §5), dependency-injected so it is testable without a database.
// Each (environment, range) step fails independently: a failed read never writes, so that
// environment keeps its previous rows (performance rule 13 — a failure is never "empty").
import { ENVS, type Env } from "./constants";
import { istToday, monthOf, syncRanges, type DateRange } from "./dates";
import { mapRollupRows, type RawRollupRow, type RecordedRow } from "./rollup";
import type { CostSyncRun, finishRun, startOrGetRun } from "@/lib/db/cost-dashboard";

export type SyncDeps = {
  now: Date;
  trigger: "schedule" | "manual";
  runId?: string;
  readProd: (r: DateRange) => Promise<RawRollupRow[]>;
  readStaging: (r: DateRange) => Promise<RawRollupRow[]>;
  replace: (env: Env, r: DateRange, rows: RecordedRow[]) => Promise<void>;
  startRun: typeof startOrGetRun;
  finishRun: typeof finishRun;
};

export async function runCostSync(deps: SyncDeps) {
  const runId = deps.runId ?? (await deps.startRun({ trigger: deps.trigger, month: monthOf(istToday(deps.now)) })).run.id;
  const steps: CostSyncRun["steps"] = {};

  for (const range of syncRanges(deps.now, deps.trigger)) {
    await Promise.all(
      ENVS.map(async (env) => {
        const label = `${env} ${range.from}..${range.to}`;
        try {
          const raw = await (env === "prod" ? deps.readProd : deps.readStaging)(range);
          const rows = mapRollupRows(raw);
          await deps.replace(env, range, rows);
          steps[label] = { ok: true, rows: rows.length };
        } catch (e) {
          steps[label] = { ok: false, message: e instanceof Error ? e.message : String(e) };
        }
      }),
    );
  }

  const failed = Object.values(steps).some((s) => !s.ok);
  const status = failed ? "failed" : "succeeded";
  await deps.finishRun(runId, { status, steps, error: failed ? "Some steps failed" : undefined });
  return { runId, status, steps } as const;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/costs/__tests__/sync.test.ts`
Expected: PASS.

- [ ] **Step 5: Write `trigger/cost-sync.ts`**

```ts
// trigger/cost-sync.ts — cost dashboard sync (spec §5, D380). Runs only in the production
// Trigger.dev project (COST_SYNC_PRIMARY=true); the staging project registers these tasks but
// they return immediately. @/lib imports are dynamic: those modules carry `server-only`
// (see trigger/reconcile-stuck-generations.ts for why).
import { schedules, task, logger } from "@trigger.dev/sdk/v3";

async function sync(trigger: "schedule" | "manual", runId?: string) {
  if (process.env.COST_SYNC_PRIMARY !== "true") {
    logger.info("Cost sync skipped: not the primary project");
    return { skipped: true };
  }
  const { createServerSupabase } = await import("@/lib/supabase/server");
  const { createStagingSupabase } = await import("@/lib/supabase/staging");
  const db = await import("@/lib/db/cost-dashboard");
  const { runCostSync } = await import("@/lib/costs/sync");

  const result = await runCostSync({
    now: new Date(),
    trigger,
    runId,
    readProd: (r) => db.readRecordedRollup(createServerSupabase(), r),
    readStaging: (r) => db.readRecordedRollup(createStagingSupabase(), r),
    replace: db.replaceRecorded,
    startRun: db.startOrGetRun,
    finishRun: db.finishRun,
  });
  logger.info("Cost sync finished", result);
  return result;
}

export const costSyncNightly = schedules.task({
  id: "cost-sync-nightly",
  cron: "30 20 * * *", // 02:00 IST
  run: async () => sync("schedule"),
});

// Started by POST /api/admin/costs/refresh, which has already created the run row.
export const costSyncRefresh = task({
  id: "cost-sync-refresh",
  retry: { maxAttempts: 1 },
  run: async (payload: { runId: string }) => sync("manual", payload.runId),
});
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors in `src/lib/costs/**` or `trigger/cost-sync.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/costs/sync.ts src/lib/costs/__tests__/sync.test.ts trigger/cost-sync.ts
git commit -m "feat(costs): cost sync orchestration and nightly/refresh Trigger.dev tasks (D380)"
```

---

### Task 6: Dashboard read model and CSV

**Files:**
- Create: `src/lib/costs/dashboard.ts`
- Test: `src/lib/costs/__tests__/dashboard.test.ts`

**Interfaces:**
- Consumes: `StoredRecordedRow` (Task 4), `COVERAGE`, `CoverageEntry` (Task 2), `sameDaysWindow`, `lastSixMonths`, `expectedForMonth`, `monthOf` (Task 3), `EnvFilter`, `Env` (Task 2), `CostSyncRun` (Task 4).
- Produces:

```ts
export type AccountItem = { key: string; kind: "canvas" | "avatars" | "scripts" | "other"; name: string; inr: number; lastInr: number; topModel: string | null; topShare: number | null; count: number };
export type AccountClient = { key: string; name: string; inr: number; lastInr: number; items: AccountItem[] };
export type AccountRow = { key: string; env: Env; name: string; inr: number; lastInr: number; share: number; limitUsedCredits: number; limitCredits: number | null; clients: AccountClient[] };
export type CoverageRow = CoverageEntry & { inr: number | null };
export type TrendPoint = { month: string; prodInr: number; stagingInr: number; expectedInr: number | null };
export type CostDashboard = {
  month: string; env: EnvFilter; fxRate: number; isCurrent: boolean;
  kpis: { recordedInr: number; lastInr: number; changePct: number | null; expectedInr: number | null; generations: number; prodInr: number; stagingInr: number };
  accounts: AccountRow[]; coverage: CoverageRow[]; trend: TrendPoint[]; latestRun: CostSyncRun | null;
};
export function buildDashboard(input: { month: string; env: EnvFilter; now: Date; fxRate: number; rows: StoredRecordedRow[]; latestRun: CostSyncRun | null }): CostDashboard;
export function dashboardToCsv(d: CostDashboard): string;
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildDashboard, dashboardToCsv } from "../dashboard";
import type { StoredRecordedRow } from "../rollup";

const r = (over: Partial<StoredRecordedRow>): StoredRecordedRow => ({
  day: "2026-12-05", env: "prod", org_id: "o1", org_name: "Digital Marketing", org_credit_limit: 150000,
  client_id: "c1", client_name: "Brightline", scope_type: "canvas", scope_id: "cv1", scope_name: "Diwali reel",
  feature: "canvas.video", provider: "kling", model: "kling-v3", cost_usd: 10, credits: 10000, generations: 2, ...over,
});

const now = new Date("2026-12-16T06:00:00Z"); // day 16 of 31, IST
const rows: StoredRecordedRow[] = [
  r({}),
  r({ model: "veo-3.1", provider: "google", cost_usd: 30, credits: 30000 }),
  r({ scope_type: "avatar", scope_id: "a1", scope_name: "Asha", feature: "avatars.images", model: "seedream", cost_usd: 5, credits: 5000 }),
  r({ day: "2026-11-10", cost_usd: 20, credits: 20000 }),          // previous month, inside same-days window
  r({ day: "2026-11-25", cost_usd: 99, credits: 99000 }),          // previous month, outside window
  r({ env: "staging", org_id: "o9", org_name: "Yuvabe QA", org_credit_limit: null, client_id: "c9", client_name: "Test", scope_id: "cv9", cost_usd: 4, credits: 4000 }),
];

describe("buildDashboard", () => {
  const d = buildDashboard({ month: "2026-12", env: "all", now, fxRate: 100, rows, latestRun: null });

  it("computes KPIs in rupees for both environments", () => {
    expect(d.kpis.recordedInr).toBe(4900);   // (10+30+5+4) × 100
    expect(d.kpis.lastInr).toBe(2000);       // only 2026-11-10 is within 1–16 Nov
    expect(d.kpis.changePct).toBeCloseTo(145);
    expect(d.kpis.expectedInr).toBe(9494);   // 4900 / 16 × 31
    expect(d.kpis.prodInr).toBe(4500);
    expect(d.kpis.stagingInr).toBe(400);
    expect(d.kpis.generations).toBe(8);
  });

  it("builds account → client → items, with avatars grouped and the biggest model per canvas", () => {
    const dm = d.accounts.find((a) => a.name === "Digital Marketing")!;
    expect(dm).toMatchObject({ env: "prod", inr: 4500, lastInr: 2000, limitUsedCredits: 45000, limitCredits: 150000 });
    const client = dm.clients[0];
    expect(client.items.map((i) => i.kind)).toEqual(["canvas", "avatars"]);
    expect(client.items[0]).toMatchObject({ name: "Diwali reel", inr: 4000, topModel: "veo-3.1", topShare: 0.75 });
    expect(client.items[1]).toMatchObject({ name: "Avatars", inr: 500, count: 1 });
    expect(d.accounts.map((a) => a.name)).toEqual(["Digital Marketing", "Yuvabe QA"]); // sorted by spend
  });

  it("filters to one environment", () => {
    const s = buildDashboard({ month: "2026-12", env: "staging", now, fxRate: 100, rows, latestRun: null });
    expect(s.kpis.recordedInr).toBe(400);
    expect(s.accounts).toHaveLength(1);
  });

  it("fills coverage with this month's spend; non-charged rows have no amount", () => {
    expect(d.coverage.find((c) => c.feature === "canvas.video")!.inr).toBe(4400);
    expect(d.coverage.find((c) => c.feature === "scripts.copilot")!.inr).toBeNull();
  });

  it("trend runs from tracking start to the month, with expected only for the current month", () => {
    expect(d.trend.map((t) => t.month)).toEqual(["2026-11", "2026-12"]);
    expect(d.trend[0]).toMatchObject({ prodInr: 11900, stagingInr: 0, expectedInr: null });
    expect(d.trend[1]).toMatchObject({ prodInr: 4500, stagingInr: 400, expectedInr: 9494 });
  });
});

describe("dashboardToCsv", () => {
  it("writes one line per item with account and client context", () => {
    const d = buildDashboard({ month: "2026-12", env: "all", now, fxRate: 100, rows, latestRun: null });
    const lines = dashboardToCsv(d).trim().split("\n");
    expect(lines[0]).toBe("Environment,Account,Client,Type,Item,This month (INR),Last month (INR),Change %");
    expect(lines).toContain("Production,Digital Marketing,Brightline,Canvas,Diwali reel,4000,2000,100");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/costs/__tests__/dashboard.test.ts`
Expected: FAIL — cannot find module `../dashboard`.

- [ ] **Step 3: Implement `src/lib/costs/dashboard.ts`**

```ts
// Pure read model for /admin/costs (spec §3). Input: stored rows for the six-month window; output:
// everything the page shows, already in rupees.
import { COVERAGE, type CoverageEntry } from "./coverage";
import type { Env, EnvFilter } from "./constants";
import { expectedForMonth, lastSixMonths, monthOf, sameDaysWindow, type DateRange } from "./dates";
import type { StoredRecordedRow } from "./rollup";
import type { CostSyncRun } from "@/lib/db/cost-dashboard";

export type AccountItem = { key: string; kind: "canvas" | "avatars" | "scripts" | "other"; name: string; inr: number; lastInr: number; topModel: string | null; topShare: number | null; count: number };
export type AccountClient = { key: string; name: string; inr: number; lastInr: number; items: AccountItem[] };
export type AccountRow = { key: string; env: Env; name: string; inr: number; lastInr: number; share: number; limitUsedCredits: number; limitCredits: number | null; clients: AccountClient[] };
export type CoverageRow = CoverageEntry & { inr: number | null };
export type TrendPoint = { month: string; prodInr: number; stagingInr: number; expectedInr: number | null };
export type CostDashboard = {
  month: string; env: EnvFilter; fxRate: number; isCurrent: boolean;
  kpis: { recordedInr: number; lastInr: number; changePct: number | null; expectedInr: number | null; generations: number; prodInr: number; stagingInr: number };
  accounts: AccountRow[]; coverage: CoverageRow[]; trend: TrendPoint[]; latestRun: CostSyncRun | null;
};

const inRange = (day: string, r: DateRange) => day >= r.from && day <= r.to;
const sum = (rows: StoredRecordedRow[]) => rows.reduce((s, r) => s + r.cost_usd, 0);
const KIND_LABEL = { avatars: "Avatars", scripts: "Scripts", other: "Other" } as const;

function itemKey(r: StoredRecordedRow): { key: string; kind: AccountItem["kind"]; name: string } {
  if (r.scope_type === "canvas") return { key: `canvas:${r.scope_id}`, kind: "canvas", name: r.scope_name ?? "Untitled canvas" };
  const kind = r.scope_type === "avatar" ? "avatars" : r.scope_type === "script" ? "scripts" : "other";
  return { key: kind, kind, name: KIND_LABEL[kind] };
}

export function buildDashboard(input: {
  month: string; env: EnvFilter; now: Date; fxRate: number; rows: StoredRecordedRow[]; latestRun: CostSyncRun | null;
}): CostDashboard {
  const { month, env, fxRate } = input;
  const inr = (usd: number) => Math.round(usd * fxRate);
  const win = sameDaysWindow(month, input.now);
  const scoped = input.rows.filter((r) => env === "all" || r.env === env);
  const cur = scoped.filter((r) => inRange(r.day, win.current));
  const prev = scoped.filter((r) => inRange(r.day, win.previous));

  const recordedUsd = sum(cur);
  const lastUsd = sum(prev);
  // Extrapolated in rupees (not USD) so rounding happens once, on the figure shown.
  const expectedInr = win.isCurrent ? expectedForMonth(inr(recordedUsd), win.daysElapsed, win.daysInMonth) : null;

  // accounts → clients → items
  const accounts = new Map<string, AccountRow>();
  const addTo = (r: StoredRecordedRow, field: "inr" | "lastInr") => {
    const aKey = `${r.env}:${r.org_id}`;
    let a = accounts.get(aKey);
    if (!a) {
      a = { key: aKey, env: r.env, name: r.org_name, inr: 0, lastInr: 0, share: 0, limitUsedCredits: 0, limitCredits: r.org_credit_limit, clients: [] };
      accounts.set(aKey, a);
    }
    const cKey = r.client_id ?? "none";
    let c = a.clients.find((x) => x.key === cKey);
    if (!c) { c = { key: cKey, name: r.client_name ?? "No client", inr: 0, lastInr: 0, items: [] }; a.clients.push(c); }
    const k = itemKey(r);
    let i = c.items.find((x) => x.key === k.key);
    if (!i) { i = { ...k, inr: 0, lastInr: 0, topModel: null, topShare: null, count: 0 }; c.items.push(i); }
    const v = r.cost_usd * fxRate;
    a[field] += v; c[field] += v; i[field] += v;
    if (field === "inr") a.limitUsedCredits += r.credits;
  };
  cur.forEach((r) => addTo(r, "inr"));
  prev.forEach((r) => addTo(r, "lastInr"));

  // biggest model per canvas + distinct scope counts for grouped items (current month)
  const modelTotals = new Map<string, Map<string, number>>();
  const scopeSets = new Map<string, Set<string>>();
  for (const r of cur) {
    const id = `${r.env}:${r.org_id}:${r.client_id ?? "none"}:${itemKey(r).key}`;
    const m = modelTotals.get(id) ?? new Map<string, number>();
    m.set(r.model, (m.get(r.model) ?? 0) + r.cost_usd);
    modelTotals.set(id, m);
    const s = scopeSets.get(id) ?? new Set<string>();
    s.add(r.scope_id ?? "none");
    scopeSets.set(id, s);
  }

  const totalInr = recordedUsd * fxRate;
  const accountList = [...accounts.values()].map((a) => {
    a.clients.forEach((c) => {
      c.items.forEach((i) => {
        const id = `${a.key}:${c.key}:${i.key}`;
        const models = modelTotals.get(id);
        i.count = scopeSets.get(id)?.size ?? 0;
        if (i.kind === "canvas" && models && i.inr > 0) {
          const [topModel, topUsd] = [...models.entries()].sort((x, y) => y[1] - x[1])[0];
          i.topModel = topModel;
          i.topShare = Math.round((topUsd * fxRate / i.inr) * 100) / 100;
        }
        i.inr = Math.round(i.inr); i.lastInr = Math.round(i.lastInr);
      });
      c.items.sort((x, y) => (x.kind === "canvas" ? 0 : 1) - (y.kind === "canvas" ? 0 : 1) || y.inr - x.inr);
      c.inr = Math.round(c.inr); c.lastInr = Math.round(c.lastInr);
    });
    a.clients.sort((x, y) => y.inr - x.inr);
    a.share = totalInr > 0 ? a.inr / totalInr : 0;
    a.inr = Math.round(a.inr); a.lastInr = Math.round(a.lastInr);
    return a;
  }).sort((x, y) => y.inr - x.inr);

  // coverage
  const byFeature = new Map<string, number>();
  for (const r of cur) byFeature.set(r.feature, (byFeature.get(r.feature) ?? 0) + r.cost_usd);
  const coverage: CoverageRow[] = COVERAGE.map((c) => ({ ...c, inr: c.status === "charged" ? inr(byFeature.get(c.feature) ?? 0) : null }));

  // trend (each month whole, current month to date)
  const trend: TrendPoint[] = lastSixMonths(month).map((m) => {
    const rowsM = scoped.filter((r) => monthOf(r.day) === m);
    const prodInr = inr(sum(rowsM.filter((r) => r.env === "prod")));
    const stagingInr = inr(sum(rowsM.filter((r) => r.env === "staging")));
    return { month: m, prodInr, stagingInr, expectedInr: m === month ? expectedInr : null };
  });

  return {
    month, env, fxRate, isCurrent: win.isCurrent,
    kpis: {
      recordedInr: inr(recordedUsd),
      lastInr: inr(lastUsd),
      changePct: lastUsd > 0 ? ((recordedUsd - lastUsd) / lastUsd) * 100 : null,
      expectedInr,
      generations: cur.reduce((s, r) => s + r.generations, 0),
      prodInr: inr(sum(cur.filter((r) => r.env === "prod"))),
      stagingInr: inr(sum(cur.filter((r) => r.env === "staging"))),
    },
    accounts: accountList, coverage, trend, latestRun: input.latestRun,
  };
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const TYPE_LABEL = { canvas: "Canvas", avatars: "Avatars", scripts: "Scripts", other: "Other" } as const;

export function dashboardToCsv(d: CostDashboard): string {
  const out = ["Environment,Account,Client,Type,Item,This month (INR),Last month (INR),Change %"];
  for (const a of d.accounts) for (const c of a.clients) for (const i of c.items) {
    const change = i.lastInr > 0 ? Math.round(((i.inr - i.lastInr) / i.lastInr) * 100) : "";
    out.push([a.env === "prod" ? "Production" : "Staging", a.name, c.name, TYPE_LABEL[i.kind], i.name, i.inr, i.lastInr, change].map(csvCell).join(","));
  }
  return out.join("\n") + "\n";
}
```

> Expected values in the test assume `fxRate = 100`; expected = round(4900 / 16 × 31) = 9494.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/costs/__tests__/dashboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/costs/dashboard.ts src/lib/costs/__tests__/dashboard.test.ts
git commit -m "feat(costs): dashboard read model (KPIs, accounts tree, coverage, trend) and CSV"
```

---

### Task 7: API routes

**Files:**
- Create: `src/app/api/admin/costs/route.ts`, `src/app/api/admin/costs/refresh/route.ts`, `src/app/api/admin/costs/runs/latest/route.ts`, `src/app/api/admin/costs/export/route.ts`, `src/lib/costs/load-dashboard.ts`
- Test: `src/app/api/admin/costs/route.test.ts`, `src/app/api/admin/costs/refresh/route.test.ts`

**Interfaces:**
- Consumes: `requireSuperAdmin` (`@/lib/auth/require-super-admin`, returns `CallerContext { userId, email, ... }`, 404s non-admins); `listRecordedRows`, `getLatestRun`, `getFxRate`, `startOrGetRun` (Task 4); `buildDashboard`, `dashboardToCsv` (Task 6); `lastSixMonths`, `monthRange`, `istToday`, `monthOf` (Task 3); `TRACKING_START` (Task 2); `tasks` from `@trigger.dev/sdk/v3`.
- Produces: `loadDashboard(month: string, env: EnvFilter, now?: Date): Promise<CostDashboard>`; `parseMonth(v: string | null, now: Date): string`; `parseEnv(v: string | null): EnvFilter`. Routes: `GET /api/admin/costs?month&env` → `apiOk({ dashboard })`; `POST /api/admin/costs/refresh` → `apiOk({ run, created })` (202 when created, 200 when already running); `GET /api/admin/costs/runs/latest` → `apiOk({ run })`; `GET /api/admin/costs/export?month&env` → CSV.

Before writing: read `node_modules/next/dist/docs/` for route handler conventions in this Next.js version (params are Promises; no `NextResponse` needed for plain JSON via our helpers).

- [ ] **Step 1: Write the failing tests**

`src/app/api/admin/costs/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(async () => ({ userId: "u1", email: "a@yuvabe.com" })),
  listRecordedRows: vi.fn(async () => []),
  getLatestRun: vi.fn(async () => null),
  getFxRate: vi.fn(async () => 95.77),
}));
vi.mock("@/lib/auth/require-super-admin", () => ({ requireSuperAdmin: mocks.requireSuperAdmin }));
vi.mock("@/lib/db/cost-dashboard", () => ({ listRecordedRows: mocks.listRecordedRows, getLatestRun: mocks.getLatestRun, getFxRate: mocks.getFxRate }));

import { GET } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/admin/costs", () => {
  it("loads six months of rows once, plus the latest run and the month's rate, in parallel", async () => {
    const res = await GET(new Request("http://x/api/admin/costs?month=2027-03&env=prod"));
    expect(res.status).toBe(200);
    expect(mocks.listRecordedRows).toHaveBeenCalledTimes(1);
    expect(mocks.listRecordedRows).toHaveBeenCalledWith({ from: "2026-11-01", to: "2027-03-31" });
    expect(mocks.getFxRate).toHaveBeenCalledWith("2027-03");
    const body = await res.json();
    expect(body.dashboard).toMatchObject({ month: "2027-03", env: "prod" });
  });

  it("rejects bad month and env values by falling back to defaults", async () => {
    const res = await GET(new Request("http://x/api/admin/costs?month=junk&env=nope"));
    const body = await res.json();
    expect(body.dashboard.env).toBe("all");
    expect(body.dashboard.month).toMatch(/^\d{4}-\d{2}$/);
  });
});
```

`src/app/api/admin/costs/refresh/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(async () => ({ userId: "u1", email: "a@yuvabe.com" })),
  startOrGetRun: vi.fn(),
  trigger: vi.fn(async () => ({ id: "run_1" })),
  finishRun: vi.fn(async () => undefined),
}));
vi.mock("@/lib/auth/require-super-admin", () => ({ requireSuperAdmin: mocks.requireSuperAdmin }));
vi.mock("@/lib/db/cost-dashboard", () => ({ startOrGetRun: mocks.startOrGetRun, finishRun: mocks.finishRun }));
vi.mock("@trigger.dev/sdk/v3", () => ({ tasks: { trigger: mocks.trigger } }));

import { POST } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("POST /api/admin/costs/refresh", () => {
  it("creates a run and starts the refresh task", async () => {
    mocks.startOrGetRun.mockResolvedValue({ run: { id: "r1", status: "running" }, created: true });
    const res = await POST();
    expect(res.status).toBe(202);
    expect(mocks.startOrGetRun).toHaveBeenCalledWith(expect.objectContaining({ trigger: "manual", requestedBy: "u1", requestedByEmail: "a@yuvabe.com" }));
    expect(mocks.trigger).toHaveBeenCalledWith("cost-sync-refresh", { runId: "r1" });
  });

  it("returns the running run without starting another task", async () => {
    mocks.startOrGetRun.mockResolvedValue({ run: { id: "r0", status: "running" }, created: false });
    const res = await POST();
    expect(res.status).toBe(200);
    expect(mocks.trigger).not.toHaveBeenCalled();
    expect((await res.json()).run.id).toBe("r0");
  });

  it("marks the run failed if the task cannot be started", async () => {
    mocks.startOrGetRun.mockResolvedValue({ run: { id: "r1", status: "running" }, created: true });
    mocks.trigger.mockRejectedValueOnce(new Error("trigger down"));
    const res = await POST();
    expect(res.status).toBe(500);
    expect(mocks.finishRun).toHaveBeenCalledWith("r1", expect.objectContaining({ status: "failed" }));
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/app/api/admin/costs`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/lib/costs/load-dashboard.ts`**

```ts
import "server-only";
import { getFxRate, getLatestRun, listRecordedRows } from "@/lib/db/cost-dashboard";
import { buildDashboard, type CostDashboard } from "./dashboard";
import { TRACKING_START, type EnvFilter } from "./constants";
import { istToday, lastSixMonths, monthOf, monthRange } from "./dates";

/** A valid YYYY-MM between tracking start and now; anything else falls back to the current month. */
export function parseMonth(v: string | null, now: Date): string {
  const start = monthOf(TRACKING_START);
  const current = monthOf(istToday(now));
  const fallback = current < start ? start : current;
  if (!v || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return fallback;
  if (v < start) return start;
  return v > fallback ? fallback : v;
}

export function parseEnv(v: string | null): EnvFilter {
  return v === "prod" || v === "staging" ? v : "all";
}

/** One read of six months of summary rows + the latest run + the month's rate, in parallel (rule 5). */
export async function loadDashboard(month: string, env: EnvFilter, now = new Date()): Promise<CostDashboard> {
  // lastSixMonths is clipped to tracking start and always includes the previous month when that
  // month is tracked, so this one range also covers "same days last month".
  const months = lastSixMonths(month);
  const range = { from: monthRange(months[0] ?? month).from, to: monthRange(month).to };
  const [rows, latestRun, fxRate] = await Promise.all([listRecordedRows(range), getLatestRun(), getFxRate(month)]);
  return buildDashboard({ month, env, now, fxRate, rows, latestRun });
}
```

- [ ] **Step 4: Implement the four routes**

`src/app/api/admin/costs/route.ts`:

```ts
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { apiOk, withTryCatch } from "@/lib/api/route-helpers";
import { loadDashboard, parseEnv, parseMonth } from "@/lib/costs/load-dashboard";

// GET /api/admin/costs?month=YYYY-MM&env=all|prod|staging — the whole cost dashboard, from the
// summary tables only (spec §8). Super-admin only (404 otherwise).
export async function GET(req: Request) {
  await requireSuperAdmin();
  const url = new URL(req.url);
  const now = new Date();
  const month = parseMonth(url.searchParams.get("month"), now);
  const env = parseEnv(url.searchParams.get("env"));
  return withTryCatch("Couldn't load costs.", async () => apiOk({ dashboard: await loadDashboard(month, env, now) }));
}
```

`src/app/api/admin/costs/refresh/route.ts`:

```ts
import { tasks } from "@trigger.dev/sdk/v3";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { apiError, apiOk, withTryCatch } from "@/lib/api/route-helpers";
import { finishRun, startOrGetRun } from "@/lib/db/cost-dashboard";
import { istToday, monthOf } from "@/lib/costs/dates";

// POST /api/admin/costs/refresh — start a refresh, or return the one already running (spec §5).
export async function POST() {
  const caller = await requireSuperAdmin();
  return withTryCatch("Couldn't start a refresh.", async () => {
    const { run, created } = await startOrGetRun({
      trigger: "manual", month: monthOf(istToday(new Date())), requestedBy: caller.userId, requestedByEmail: caller.email,
    });
    if (!created) return apiOk({ run, created });
    try {
      await tasks.trigger("cost-sync-refresh", { runId: run.id });
    } catch {
      await finishRun(run.id, { status: "failed", steps: {}, error: "Couldn't start the refresh" });
      return apiError("Couldn't start a refresh. Try again in a minute.", 500);
    }
    return apiOk({ run, created }, 202); // apiOk(data, status = 200)
  });
}
```

`src/app/api/admin/costs/runs/latest/route.ts`:

```ts
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { apiOk, withTryCatch } from "@/lib/api/route-helpers";
import { getLatestRun } from "@/lib/db/cost-dashboard";

// GET /api/admin/costs/runs/latest — polled by the page while a refresh runs.
export async function GET() {
  await requireSuperAdmin();
  return withTryCatch("Couldn't check the refresh.", async () => apiOk({ run: await getLatestRun() }));
}
```

`src/app/api/admin/costs/export/route.ts`:

```ts
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { withTryCatch } from "@/lib/api/route-helpers";
import { dashboardToCsv } from "@/lib/costs/dashboard";
import { loadDashboard, parseEnv, parseMonth } from "@/lib/costs/load-dashboard";

// GET /api/admin/costs/export?month&env — the accounts table as CSV, for finance.
export async function GET(req: Request) {
  await requireSuperAdmin();
  const url = new URL(req.url);
  const month = parseMonth(url.searchParams.get("month"), new Date());
  const env = parseEnv(url.searchParams.get("env"));
  return withTryCatch("Couldn't build the CSV.", async () => {
    const csv = dashboardToCsv(await loadDashboard(month, env));
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="creativeos-costs-${month}-${env}.csv"`,
      },
    });
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/app/api/admin/costs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/costs src/lib/costs/load-dashboard.ts
git commit -m "feat(costs): admin cost API routes — dashboard, refresh, latest run, CSV"
```

---

### Task 8: Service and query hooks

**Files:**
- Create: `src/services/admin-costs.service.ts`, `src/hooks/queries/admin-costs.ts`
- Test: `src/hooks/queries/__tests__/admin-costs.test.ts`

**Interfaces:**
- Consumes: `readJson` (`src/services/read-json.ts`), `authFetch` (`@/lib/supabase/session-ready`), `CostDashboard` (Task 6), `CostSyncRun` (type-only import from Task 4 — use `import type`), `EnvFilter`.
- Produces: `adminCostsService.dashboard(month, env)`, `.latestRun()`, `.refresh()`, `exportCsvUrl(month, env): string`; `adminCostKeys = { all: ["admin-costs"], dashboard: (month, env) => [...], latestRun: () => [...] }`; `useCostDashboard(month: string, env: EnvFilter)`; `useLatestCostRun(enabled: boolean)` polling every 3 s while `status === "running"`; `useRefreshCosts()` mutation that seeds the run query and invalidates `adminCostKeys.all` when the polled run finishes; `isRunActive(run): boolean`.

- [ ] **Step 1: Write the failing test** (pure parts only: keys and `isRunActive`)

```ts
import { describe, it, expect, vi } from "vitest";

// The service pulls in the browser session helper; these tests only need the pure exports.
vi.mock("@/services/admin-costs.service", () => ({ adminCostsService: {} }));

import { adminCostKeys, isRunActive, nextPollInterval } from "../admin-costs";

describe("adminCostKeys", () => {
  it("nests every key under one root so a refresh can invalidate all of them", () => {
    expect(adminCostKeys.dashboard("2026-11", "prod").slice(0, 1)).toEqual(adminCostKeys.all);
    expect(adminCostKeys.latestRun().slice(0, 1)).toEqual(adminCostKeys.all);
  });
});

describe("polling", () => {
  it("polls only while a run is running", () => {
    expect(isRunActive({ status: "running" } as never)).toBe(true);
    expect(isRunActive({ status: "succeeded" } as never)).toBe(false);
    expect(isRunActive(null)).toBe(false);
    expect(nextPollInterval({ status: "running" } as never)).toBe(3000);
    expect(nextPollInterval({ status: "failed" } as never)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/hooks/queries/__tests__/admin-costs.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

```ts
// src/services/admin-costs.service.ts
import { authFetch } from "@/lib/supabase/session-ready";
import type { CostDashboard } from "@/lib/costs/dashboard";
import type { CostSyncRun } from "@/lib/db/cost-dashboard";
import type { EnvFilter } from "@/lib/costs/constants";
import { readJson } from "./read-json";

const qs = (month: string, env: EnvFilter) => `month=${encodeURIComponent(month)}&env=${env}`;

class AdminCostsService {
  async dashboard(month: string, env: EnvFilter): Promise<CostDashboard> {
    const res = await authFetch(`/api/admin/costs?${qs(month, env)}`);
    return (await readJson<{ dashboard: CostDashboard }>(res, "Couldn't load costs.")).dashboard;
  }
  async latestRun(): Promise<CostSyncRun | null> {
    const res = await authFetch("/api/admin/costs/runs/latest");
    return (await readJson<{ run: CostSyncRun | null }>(res, "Couldn't check the refresh.")).run;
  }
  async refresh(): Promise<{ run: CostSyncRun; created: boolean }> {
    const res = await authFetch("/api/admin/costs/refresh", { method: "POST" });
    return readJson(res, "Couldn't start a refresh.");
  }
}

export const adminCostsService = new AdminCostsService();
export const exportCsvUrl = (month: string, env: EnvFilter) => `/api/admin/costs/export?${qs(month, env)}`;
```

> `src/lib/db/cost-dashboard.ts` carries `import "server-only"`. A **type-only** import is erased at build time and is safe in a client module; make sure every client-side import of it is `import type`. If the bundler still complains, move `CostSyncRun` to `src/lib/costs/types.ts` (no server-only) and re-export it from `cost-dashboard.ts`.

- [ ] **Step 4: Implement the query hooks**

```ts
// src/hooks/queries/admin-costs.ts
"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminCostsService } from "@/services/admin-costs.service";
import type { CostSyncRun } from "@/lib/db/cost-dashboard";
import type { EnvFilter } from "@/lib/costs/constants";

export const adminCostKeys = {
  all: ["admin-costs"] as const,
  dashboard: (month: string, env: EnvFilter) => ["admin-costs", "dashboard", month, env] as const,
  latestRun: () => ["admin-costs", "latest-run"] as const,
};

export const isRunActive = (run: CostSyncRun | null | undefined) => run?.status === "running";
export const nextPollInterval = (run: CostSyncRun | null | undefined) => (isRunActive(run) ? 3000 : false);

export function useCostDashboard(month: string, env: EnvFilter) {
  return useQuery({
    queryKey: adminCostKeys.dashboard(month, env),
    queryFn: () => adminCostsService.dashboard(month, env),
    staleTime: 60_000,
  });
}

/** The latest sync run. Polls every 3 s while one is running; when it finishes, refetches the dashboard. */
export function useLatestCostRun(initial: CostSyncRun | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: adminCostKeys.latestRun(),
    queryFn: () => adminCostsService.latestRun(),
    initialData: initial,
    refetchInterval: (q) => nextPollInterval(q.state.data),
  });
  const wasRunning = useRef(isRunActive(initial));
  useEffect(() => {
    const running = isRunActive(query.data);
    if (wasRunning.current && !running) void queryClient.invalidateQueries({ queryKey: ["admin-costs", "dashboard"] });
    wasRunning.current = running;
  }, [query.data, queryClient]);
  return query;
}

export function useRefreshCosts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => adminCostsService.refresh(),
    onSuccess: ({ run }) => queryClient.setQueryData(adminCostKeys.latestRun(), run),
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/hooks/queries/__tests__/admin-costs.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/admin-costs.service.ts src/hooks/queries/admin-costs.ts src/hooks/queries/__tests__/admin-costs.test.ts
git commit -m "feat(costs): admin costs service and TanStack Query hooks with run polling"
```

---

### Task 9: The `/admin/costs` page

**Files:**
- Create: `src/app/admin/costs/page.tsx`, `src/components/admin/costs/cost-dashboard.tsx`, `src/components/admin/costs/cost-header.tsx`, `src/components/admin/costs/cost-kpis.tsx`, `src/components/admin/costs/cost-accounts-table.tsx`, `src/components/admin/costs/cost-coverage-table.tsx`, `src/components/admin/costs/cost-trend-chart.tsx`, `src/components/admin/costs/format.ts`
- Modify: `src/app/admin/(agencies)/page.tsx` (add a "Costs" link button)
- Test: `src/components/admin/costs/__tests__/format.test.ts`

**Interfaces:**
- Consumes: `useCostDashboard`, `useLatestCostRun`, `useRefreshCosts`, `isRunActive` (Task 8); `exportCsvUrl` (Task 8); `CostDashboard`, `AccountRow`, `CoverageRow`, `TrendPoint` (Task 6); `getLatestRun` (Task 4, server page only); `requireSuperAdmin`; shadcn `Button`, `Select*`, `Tabs`/`TabsList`/`TabsTrigger`, `Badge`, `Progress`, `Card`, `Skeleton`, `Tooltip`; Lucide `RefreshCw`, `Download`, `ChevronRight`; recharts.
- Produces: `formatInr(v: number): string` (en-IN, `₹1,84,300`), `formatShortInr(v: number): string` (`₹1.84L`, `₹38.2k`), `formatChange(pct: number | null): { label: string; direction: "up" | "down" | "none" }`, `monthOptions(now: Date): { value: string; label: string }[]` (tracking start → current month, newest first).

- [ ] **Step 1: Write the failing test for the formatters**

```ts
import { describe, it, expect } from "vitest";
import { formatInr, formatShortInr, formatChange, monthOptions } from "../format";

describe("formatters", () => {
  it("formats rupees the Indian way", () => {
    expect(formatInr(184300)).toBe("₹1,84,300");
    expect(formatShortInr(184300)).toBe("₹1.84L");
    expect(formatShortInr(38200)).toBe("₹38.2k");
    expect(formatShortInr(900)).toBe("₹900");
  });
  it("describes change", () => {
    expect(formatChange(52.4)).toEqual({ label: "52%", direction: "up" });
    expect(formatChange(-15)).toEqual({ label: "15%", direction: "down" });
    expect(formatChange(null)).toEqual({ label: "New", direction: "none" });
  });
  it("offers months from tracking start to now, newest first", () => {
    expect(monthOptions(new Date("2027-01-10T06:00:00Z"))).toEqual([
      { value: "2027-01", label: "January 2027" },
      { value: "2026-12", label: "December 2026" },
      { value: "2026-11", label: "November 2026" },
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/admin/costs/__tests__/format.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `format.ts`**

```ts
import { TRACKING_START } from "@/lib/costs/constants";
import { istToday, monthOf } from "@/lib/costs/dates";

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
export const formatInr = (v: number) => `₹${inr.format(Math.round(v))}`;

export function formatShortInr(v: number): string {
  if (v >= 100_000) return `₹${(v / 100_000).toFixed(2).replace(/\.?0+$/, "")}L`;
  if (v >= 1_000) return `₹${(v / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `₹${Math.round(v)}`;
}

export function formatChange(pct: number | null): { label: string; direction: "up" | "down" | "none" } {
  if (pct === null) return { label: "New", direction: "none" };
  return { label: `${Math.abs(Math.round(pct))}%`, direction: pct >= 0 ? "up" : "down" };
}

export function monthOptions(now: Date): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const start = monthOf(TRACKING_START);
  let [y, m] = monthOf(istToday(now)).split("-").map(Number);
  for (;;) {
    const value = `${y}-${String(m).padStart(2, "0")}`;
    if (value < start) break;
    out.push({ value, label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }) });
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/components/admin/costs/__tests__/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Server page**

`src/app/admin/costs/page.tsx`:

```tsx
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { getLatestRun } from "@/lib/db/cost-dashboard";
import { CostDashboard } from "@/components/admin/costs/cost-dashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Costs — Admin" };

export default async function AdminCostsPage() {
  await requireSuperAdmin();
  const latestRun = await getLatestRun();
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-14">
      <CostDashboard initialRun={latestRun} />
    </main>
  );
}
```

- [ ] **Step 6: Container component**

`src/components/admin/costs/cost-dashboard.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { CostSyncRun } from "@/lib/db/cost-dashboard";
import type { EnvFilter } from "@/lib/costs/constants";
import { istToday, monthOf } from "@/lib/costs/dates";
import { TRACKING_START } from "@/lib/costs/constants";
import { useCostDashboard } from "@/hooks/queries/admin-costs";
import { Skeleton } from "@/components/ui/skeleton";
import { CostHeader } from "./cost-header";
import { CostKpis } from "./cost-kpis";
import { CostAccountsTable } from "./cost-accounts-table";
import { CostCoverageTable } from "./cost-coverage-table";
import { CostTrendChart } from "./cost-trend-chart";

export function CostDashboard({ initialRun }: { initialRun: CostSyncRun | null }) {
  const current = monthOf(istToday(new Date()));
  const [month, setMonth] = useState(current < monthOf(TRACKING_START) ? monthOf(TRACKING_START) : current);
  const [env, setEnv] = useState<EnvFilter>("all");
  const { data, isPending, isError } = useCostDashboard(month, env);

  return (
    <div className="grid gap-6">
      <CostHeader month={month} env={env} onMonth={setMonth} onEnv={setEnv} initialRun={initialRun} />
      {isError && <p className="text-sm text-muted-foreground">Couldn&apos;t load costs. Try refreshing the page.</p>}
      {isPending && <Skeleton className="h-96 w-full rounded-xl" />}
      {data && (
        <>
          <CostKpis dashboard={data} />
          <CostAccountsTable accounts={data.accounts} showEnv={env === "all"} />
          <CostCoverageTable rows={data.coverage} />
          <CostTrendChart points={data.trend} env={env} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Header (month, environment, refresh, CSV, freshness)**

`src/components/admin/costs/cost-header.tsx`:

```tsx
"use client";

import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CostSyncRun } from "@/lib/db/cost-dashboard";
import type { EnvFilter } from "@/lib/costs/constants";
import { exportCsvUrl } from "@/services/admin-costs.service";
import { isRunActive, useLatestCostRun, useRefreshCosts } from "@/hooks/queries/admin-costs";
import { monthOptions } from "./format";

function freshness(run: CostSyncRun | null | undefined): string {
  if (!run) return "Not updated yet. The first update runs tonight at 2:00 am.";
  if (run.status === "running") return "Updating now…";
  const when = new Date(run.finished_at ?? run.started_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const who = run.trigger === "manual" ? `refreshed by ${run.requested_by_email ?? "an admin"}` : "nightly";
  return run.status === "failed" ? `Last update on ${when} didn't finish. Showing the previous figures.` : `Last update: ${when} (${who}).`;
}

export function CostHeader(props: {
  month: string; env: EnvFilter; onMonth: (m: string) => void; onEnv: (e: EnvFilter) => void; initialRun: CostSyncRun | null;
}) {
  const { data: run } = useLatestCostRun(props.initialRun);
  const refresh = useRefreshCosts();
  const busy = isRunActive(run) || refresh.isPending;
  const months = monthOptions(new Date());

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="grid gap-1">
        <span className="text-eyebrow">Admin · Costs</span>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Costs</h1>
        <p className="text-sm text-muted-foreground">In rupees. Updated every night at 2:00 am. {freshness(run)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => refresh.mutate()} disabled={busy}>
          <RefreshCw strokeWidth={1.5} className={busy ? "animate-spin" : undefined} />
          {busy ? "Refreshing…" : "Refresh now"}
        </Button>
        <Select value={props.month} onValueChange={(v) => v && props.onMonth(v as string)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {months.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Tabs value={props.env} onValueChange={(v) => props.onEnv(v as EnvFilter)}>
          <TabsList>
            <TabsTrigger value="all">Both</TabsTrigger>
            <TabsTrigger value="prod">Production</TabsTrigger>
            <TabsTrigger value="staging">Staging</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="outline" render={<a href={exportCsvUrl(props.month, props.env)} />}>
          <Download strokeWidth={1.5} /> Download CSV
        </Button>
      </div>
    </div>
  );
}
```

> Check `src/components/ui/select.tsx` and `tabs.tsx` for the exact `onValueChange` signatures in this Base UI registry and adjust the casts. Read `src/components/ui/button.tsx` to confirm `render` usage for the link.

- [ ] **Step 8: KPIs**

`src/components/admin/costs/cost-kpis.tsx`:

```tsx
import { Card } from "@/components/ui/card";
import type { CostDashboard } from "@/lib/costs/dashboard";
import { formatChange, formatInr, formatShortInr } from "./format";

export function CostKpis({ dashboard: d }: { dashboard: CostDashboard }) {
  const change = formatChange(d.kpis.changePct);
  const monthName = new Date(`${d.month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", timeZone: "UTC" });
  const tiles = [
    {
      label: "Recorded this month",
      value: formatInr(d.kpis.recordedInr),
      sub: d.env === "all" ? `Production ${formatShortInr(d.kpis.prodInr)} · Staging ${formatShortInr(d.kpis.stagingInr)}` : "From our generation records",
    },
    {
      label: "Same days last month",
      value: formatInr(d.kpis.lastInr),
      sub: change.direction === "none" ? "Nothing to compare yet" : `${change.direction === "up" ? "▲" : "▼"} ${change.label} this month`,
    },
    {
      label: d.isCurrent ? `Expected for ${monthName}` : `Total for ${monthName}`,
      value: formatInr(d.isCurrent ? d.kpis.expectedInr ?? 0 : d.kpis.recordedInr),
      sub: d.isCurrent ? "At this month's pace so far" : "Month closed",
    },
    { label: "Generations", value: d.kpis.generations.toLocaleString("en-IN"), sub: `At ₹${d.fxRate} per dollar` },
  ];
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((t) => (
        <Card key={t.label} className="grid gap-1.5 rounded-xl p-5 shadow-card">
          <span className="text-eyebrow">{t.label}</span>
          <span className="font-display text-2xl font-semibold tabular-nums">{t.value}</span>
          <span className="text-xs text-muted-foreground">{t.sub}</span>
        </Card>
      ))}
    </section>
  );
}
```

- [ ] **Step 9: Accounts table (expandable)**

`src/components/admin/costs/cost-accounts-table.tsx` — keep under ~200 lines; split `AccountRowView` into its own file `cost-account-row.tsx` if it grows past that.

```tsx
"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { AccountRow } from "@/lib/costs/dashboard";
import { formatChange, formatInr } from "./format";

function Change({ now, last }: { now: number; last: number }) {
  const c = formatChange(last > 0 ? ((now - last) / last) * 100 : null);
  if (c.direction === "none") return <Badge variant="outline">New</Badge>;
  return <span className={c.direction === "up" ? "text-destructive" : "text-success"}>{c.direction === "up" ? "▲" : "▼"} {c.label}</span>;
}

function Toggle({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  return (
    <Button variant="ghost" size="icon-xs" aria-expanded={open} aria-label={label} onClick={onClick}>
      <ChevronRight strokeWidth={1.5} className={`transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${open ? "rotate-90" : ""}`} />
    </Button>
  );
}

export function CostAccountsTable({ accounts, showEnv }: { accounts: AccountRow[]; showEnv: boolean }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const flip = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const total = accounts.reduce((s, a) => s + a.inr, 0);
  const totalLast = accounts.reduce((s, a) => s + a.lastInr, 0);

  return (
    <Card className="rounded-xl p-5 shadow-card">
      <h2 className="font-display text-lg font-semibold">Accounts and clients</h2>
      <p className="mb-4 text-sm text-muted-foreground">What each account spent, and inside it each client. A client opens to its canvases, plus its avatars and scripts. Compared with the same days last month.</p>
      {accounts.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nothing recorded for this month yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-eyebrow text-left">
              <tr className="border-b">
                <th className="py-2 pr-2">Account / client / canvas</th><th className="py-2 text-right">This month</th>
                <th className="py-2 text-right">Last month</th><th className="py-2 text-right">Change</th>
                <th className="py-2 pl-4">Share</th><th className="py-2">Credit limit used</th><th className="py-2">Biggest cost</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {accounts.map((a) => (
                <AccountRows key={a.key} a={a} total={total} showEnv={showEnv} open={open} flip={flip} />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-semibold">
                <td className="py-2">Recorded total</td><td className="text-right">{formatInr(total)}</td>
                <td className="text-right">{formatInr(totalLast)}</td><td className="text-right"><Change now={total} last={totalLast} /></td><td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}

function AccountRows({ a, total, showEnv, open, flip }: { a: AccountRow; total: number; showEnv: boolean; open: Record<string, boolean>; flip: (k: string) => void }) {
  const limitPct = a.limitCredits ? Math.min(100, (a.limitUsedCredits / a.limitCredits) * 100) : null;
  return (
    <>
      <tr className="border-b bg-muted/40">
        <td className="py-2 pr-2">
          <div className="flex items-center gap-2 font-semibold">
            <Toggle open={!!open[a.key]} onClick={() => flip(a.key)} label={`Show ${a.name} clients`} />
            {a.name}
            {showEnv && <Badge variant="outline">{a.env === "prod" ? "Production" : "Staging"}</Badge>}
            <span className="text-xs font-normal text-muted-foreground">{a.clients.length} {a.clients.length === 1 ? "client" : "clients"}</span>
          </div>
        </td>
        <td className="text-right">{formatInr(a.inr)}</td>
        <td className="text-right text-muted-foreground">{formatInr(a.lastInr)}</td>
        <td className="text-right"><Change now={a.inr} last={a.lastInr} /></td>
        <td className="pl-4 text-muted-foreground">{total > 0 ? Math.round((a.inr / total) * 100) : 0}%</td>
        <td>
          {limitPct === null ? <span className="text-muted-foreground">No limit</span> : (
            <div className="grid min-w-28 gap-1 text-xs">
              <span>{a.limitUsedCredits.toLocaleString("en-IN")} of {a.limitCredits!.toLocaleString("en-IN")} credits</span>
              <Progress value={limitPct} />
            </div>
          )}
        </td>
        <td />
      </tr>
      {open[a.key] && a.clients.map((c) => {
        const ck = `${a.key}|${c.key}`;
        return (
          <ClientRows key={ck} ck={ck} c={c} accountInr={a.inr} open={open} flip={flip} />
        );
      })}
    </>
  );
}

function ClientRows({ ck, c, accountInr, open, flip }: { ck: string; c: AccountRow["clients"][number]; accountInr: number; open: Record<string, boolean>; flip: (k: string) => void }) {
  return (
    <>
      <tr className="border-b">
        <td className="py-2 pl-7 pr-2">
          <div className="flex items-center gap-2">
            <Toggle open={!!open[ck]} onClick={() => flip(ck)} label={`Show ${c.name} details`} />
            {c.name}
          </div>
        </td>
        <td className="text-right">{formatInr(c.inr)}</td>
        <td className="text-right text-muted-foreground">{formatInr(c.lastInr)}</td>
        <td className="text-right"><Change now={c.inr} last={c.lastInr} /></td>
        <td className="pl-4 text-muted-foreground">{accountInr > 0 ? Math.round((c.inr / accountInr) * 100) : 0}% of account</td>
        <td /><td />
      </tr>
      {open[ck] && c.items.map((i) => (
        <tr key={`${ck}|${i.key}`} className="border-b">
          <td className="py-2 pl-16 pr-2">{i.name}{i.kind !== "canvas" && <span className="ml-2 text-xs text-muted-foreground">{i.count}</span>}</td>
          <td className="text-right">{formatInr(i.inr)}</td>
          <td className="text-right text-muted-foreground">{i.lastInr ? formatInr(i.lastInr) : "—"}</td>
          <td className="text-right"><Change now={i.inr} last={i.lastInr} /></td>
          <td className="pl-4 text-muted-foreground">{c.inr > 0 ? Math.round((i.inr / c.inr) * 100) : 0}% of client</td>
          <td />
          <td className="text-muted-foreground">{i.topModel ? `${i.topModel}, ${Math.round((i.topShare ?? 0) * 100)}%` : ""}</td>
        </tr>
      ))}
    </>
  );
}
```

> `Button` has `size="icon-xs"` and `globals.css` defines `--success` (verified). Split this into two files to stay near the ~200-line rule: `cost-accounts-table.tsx` (the `CostAccountsTable` shell) and `cost-account-rows.tsx` (exports `AccountRows`, `ClientRows`, `Change`, `Toggle`). Import only `formatChange` and `formatInr` from `./format`.

- [ ] **Step 10: Coverage table**

`src/components/admin/costs/cost-coverage-table.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { CoverageRow } from "@/lib/costs/dashboard";
import { formatInr } from "./format";

const STATUS = {
  charged: { label: "Charges credits", variant: "secondary" as const },
  logged: { label: "Usage saved, not charged", variant: "outline" as const },
  none: { label: "Not recorded", variant: "destructive" as const },
};

export function CostCoverageTable({ rows }: { rows: CoverageRow[] }) {
  const visible = rows.filter((r) => r.feature !== "other" || (r.inr ?? 0) > 0);
  const counts = { charged: 0, logged: 0, none: 0 };
  visible.forEach((r) => counts[r.status]++);
  let prevArea = "";
  return (
    <Card className="rounded-xl p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Credit coverage</h2>
          <p className="text-sm text-muted-foreground">Which features charge credits, and which still spend money without recording it.</p>
        </div>
        <p className="text-xs text-muted-foreground">{counts.charged} charge credits · {counts.logged} save usage only · {counts.none} not recorded</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-eyebrow text-left"><tr className="border-b"><th className="py-2">Area</th><th>Feature</th><th>Provider</th><th>Status</th><th className="text-right">This month</th></tr></thead>
          <tbody>
            {visible.map((r) => {
              const area = r.area !== prevArea ? r.area : "";
              prevArea = r.area;
              return (
                <tr key={r.feature} className="border-b">
                  <td className="py-2 font-semibold">{area}</td><td>{r.label}</td>
                  <td className="text-muted-foreground">{r.providers}</td>
                  <td><Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge></td>
                  <td className="text-right tabular-nums">
                    {r.inr === null
                      ? <span className="text-muted-foreground">{r.status === "logged" ? "Not measured yet" : "Unknown until connected"}</span>
                      : formatInr(r.inr)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
```

> Badge variants available: `default`, `secondary`, `destructive`, `outline` (verified).

- [ ] **Step 11: Trend chart**

`src/components/admin/costs/cost-trend-chart.tsx` (recharts, matching `src/components/admin/usage-trend-chart.tsx`):

```tsx
"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import type { TrendPoint } from "@/lib/costs/dashboard";
import type { EnvFilter } from "@/lib/costs/constants";
import { formatInr, formatShortInr } from "./format";

export function CostTrendChart({ points, env }: { points: TrendPoint[]; env: EnvFilter }) {
  const data = points.map((p) => ({
    label: new Date(`${p.month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" }),
    prod: env === "staging" ? 0 : p.prodInr,
    staging: env === "prod" ? 0 : p.stagingInr,
    rest: p.expectedInr === null ? 0 : Math.max(0, p.expectedInr - (env === "staging" ? 0 : p.prodInr) - (env === "prod" ? 0 : p.stagingInr)),
  }));
  return (
    <Card className="rounded-xl p-5 shadow-card">
      <h2 className="font-display text-lg font-semibold">Last six months</h2>
      <p className="mb-4 text-sm text-muted-foreground">Recorded spend per month. The current month shows spend so far, with the expected total on top.</p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis tickFormatter={formatShortInr} tickLine={false} axisLine={false} fontSize={12} width={56} />
            <Tooltip formatter={(v: number, name: string) => [formatInr(v), name === "prod" ? "Production" : name === "staging" ? "Staging" : "Expected rest of month"]} />
            <Bar dataKey="prod" stackId="m" fill="var(--chart-5)" />
            <Bar dataKey="staging" stackId="m" fill="var(--chart-2)" />
            <Bar dataKey="rest" stackId="m" fill="transparent" stroke="var(--muted-foreground)" strokeDasharray="4 3" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
```

> Production = `--chart-5` (green), staging = `--chart-2` (yellow), matching the approved mockup. Add a two-item legend under the title (small swatches + "Production" / "Staging") using the same tokens.

- [ ] **Step 12: Link from the admin home**

In `src/app/admin/(agencies)/page.tsx`, next to `<NewOrgDialog />`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
// …
<div className="flex items-center gap-2">
  <Button variant="outline" render={<Link href="/admin/costs">Costs</Link>} />
  <NewOrgDialog />
</div>
```

- [ ] **Step 13: Lint, typecheck, run the costs tests**

Run: `npx tsc --noEmit -p . && npx eslint src/components/admin/costs src/app/admin/costs src/hooks/queries/admin-costs.ts src/services/admin-costs.service.ts && npx vitest run src/lib/costs src/components/admin/costs src/hooks/queries/__tests__/admin-costs.test.ts src/app/api/admin/costs src/lib/db/__tests__/cost-dashboard.test.ts`
Expected: no type or lint errors; all tests PASS.

- [ ] **Step 14: Commit**

```bash
git add src/app/admin/costs src/components/admin/costs "src/app/admin/(agencies)/page.tsx"
git commit -m "feat(costs): /admin/costs page — KPIs, accounts and clients, coverage, trend, refresh, CSV"
```

---

### Task 10: Environment wiring and manual verification

**Files:**
- Modify: `docs/superpowers/specs/2026-10-16-cost-dashboard-design.md` (add an "Environment variables" note under §5 if missing)

- [ ] **Step 1: Set Trigger.dev environment variables (operator, dashboard UI)**

Production Trigger.dev project only:
- `COST_SYNC_PRIMARY=true`
- `STAGING_SUPABASE_URL=<staging project URL>`
- `STAGING_SUPABASE_SERVICE_ROLE_KEY=<staging service role key>`

Staging Trigger.dev project: set nothing (the tasks skip there).

- [ ] **Step 2: Apply migration 0057 to staging and production** (SQL editor), run the verify queries from `docs/auth-production-migration.md` § "Migration 0057", tick the entry in `MIGRATIONS-PENDING.md`.

- [ ] **Step 3: Deploy Trigger.dev tasks** to production (`npx trigger.dev@latest deploy` with the production env active, as the repo does for other tasks) and confirm `cost-sync-nightly` appears under Schedules with cron `30 20 * * *`.

- [ ] **Step 4: Verify end to end (after 1 Nov 2026, or temporarily set `TRACKING_START` locally to a past date for a dry run — do not commit that change)**

1. Open `/admin/costs` as a super-admin → page loads, "Not updated yet" freshness line.
2. Click **Refresh now** → button shows "Refreshing…", freshness shows "Updating now…", then "Last update: … (refreshed by you@…)" within a minute; numbers appear.
3. Click again within the run → no second run starts (only one `running` row in `cost_sync_runs`).
4. Toggle Both / Production / Staging → KPIs, table and chart change; staging accounts show only under Staging.
5. Expand an account → clients; expand a client → canvases, then Avatars / Scripts rows.
6. **Download CSV** → file opens with the header row and one line per item.
7. As a non-super-admin, `/admin/costs` and `/api/admin/costs` return 404.

- [ ] **Step 5: Commit any doc touch-ups**

```bash
git add docs/superpowers/specs/2026-10-16-cost-dashboard-design.md docs/superpowers/plans/MIGRATIONS-PENDING.md
git commit -m "docs(costs): phase 1 environment wiring and migration status"
```
