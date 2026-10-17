# Cost dashboard (internal) — design

*Recorded 2026-10-16. Decisions D380–D382 in the ADR log (roadmap §7).*
*Approved mockup: [assets/2026-10-16-cost-dashboard-mockup.html](assets/2026-10-16-cost-dashboard-mockup.html)
(open in a browser; all numbers in it are sample data).*

## 1. Goal

One internal page that answers, for any month, in rupees, for staging and production:

1. **How much did we spend?** What each AI provider actually billed us.
2. **Who spent it?** Account (org) → client → canvas, plus each client's avatars and scripts.
3. **Does it match what we recorded?** Provider bill vs our own records, and why they differ.
4. **What isn't connected to credits yet?** Every feature that costs money and whether it charges credits.

Audience: Yuvabe super-admins. Not shown to agencies.

Out of scope for now: hosting costs (Vercel, Supabase, Trigger.dev), card forex fees and GST,
alerts, budgets beyond the existing `monthly_credit_limit`.

## 2. Terms (used the same way in UI, code and docs)

| Term | Meaning | Source |
|---|---|---|
| **Billed** | What a provider says we spent. | Provider billing API, balance diff, or a manual monthly entry |
| **Recorded** | What CreativeOS stored for its own generations. | `generations.cost_usd` (raw USD, before the credit round-up) |
| **Not recorded** | Billed − Recorded. Spend we have no record of. | Derived |
| **Rupees** | USD × that month's stored rate. | `cost_fx_rates` |

Credits appear only in the "Credit limit used" column (credits vs `organizations.monthly_credit_limit`,
from `credit_transactions`), because that is what the limit is measured in.

## 3. The page — `/admin/costs` (production only)

Super-admin only (`requireSuperAdmin`), linked from the admin nav. Layout, top to bottom, as in the mockup:

- **Header:** month picker (default current month), **Both / Production / Staging** toggle,
  **Refresh now**, **Download CSV**, and "Last update: <time> (nightly | refreshed by <name>)".
- **Four numbers:** Spent this month (Billed, with % vs the same days last month and the prod/staging
  split), Recorded by CreativeOS, Not recorded (₹ and %, chip turns amber above 10%), Expected for
  the month (month-to-date ÷ days elapsed × days in month; current month only).
- **Accounts and clients:** expandable table. Account → client → canvases, then that client's
  **Avatars** and **Scripts** rows. Columns: this month, same days last month, change %, share,
  credit limit used (accounts only), biggest cost (model and its share; canvas rows). Footer:
  recorded total plus the not-recorded amount. With **Both**, each account shows an env chip;
  a staging org and a production org with the same name stay separate rows.
- **Providers:** Billed, Recorded, Not recorded (₹ and %), and the bill's source chip
  (Billing API / Balance check / Monthly entry). "Not recorded at all" when Recorded is 0.
  Gap-reason boxes appear in phase 3 (§9).
- **Credit coverage:** every money-spending feature, grouped by area (Canvas, Avatars, Scripts,
  Brand kit, Research), with its provider(s), status (Charges credits / Usage saved, not charged /
  Not recorded) and this month's recorded spend ("Unknown until connected" for Not recorded).
- **Last six months:** stacked bars (production, staging), current month with a dashed "expected" cap.

Past months are read-only and never recomputed by the nightly run (see §5).

## 4. Data model (production DB, new migration)

All tables are written only by the sync task (service role) and read only by the admin page.
RLS on, no policies (deny-all backstop, as with other admin-only tables).

```
cost_daily_recorded     -- our records, summed per day
  day date, env text check (env in ('prod','staging')),
  org_id uuid, org_name text,             -- names snapshotted: staging ids don't exist in prod
  client_id uuid null, client_name text null,
  scope_type text check (scope_type in ('canvas','avatar','script','other')),
  scope_id uuid null, scope_name text null,
  feature text,                           -- key into the coverage registry (§6)
  provider text, model text,
  cost_usd numeric, credits numeric, generations int
  unique (day, env, org_id, client_id, scope_type, scope_id, feature, provider, model)
  index (day), index (env, day)

cost_daily_billed       -- provider bills, per day where the provider gives days
  day date, provider text, env text check (env in ('prod','staging','shared')),
  cost_usd numeric, source text check (source in ('api','balance','manual')),
  kind text check (kind in ('usage','prepaid','plan_fee')) default 'usage',
  fetched_at timestamptz
  unique (day, provider, env, kind)

cost_balance_snapshots  -- for balance-only providers (Kling, ElevenLabs)
  provider text, taken_at timestamptz, balance numeric, unit text, top_up numeric default 0

cost_manual_entries     -- monthly invoices typed in (Google, Sarvam, plan fees)
  month date, provider text, env text, amount_usd numeric, note text,
  entered_by uuid, entered_at timestamptz
  unique (month, provider, env)

cost_fx_rates
  month date primary key, usd_to_inr numeric, set_by uuid, set_at timestamptz

cost_sync_runs
  id uuid, trigger text check (trigger in ('schedule','manual')), requested_by uuid null,
  month date, status text check (status in ('running','succeeded','failed')),
  started_at, finished_at, error text null,
  providers jsonb                         -- per-provider ok / failed / skipped + message
```

`shared` billed rows (one key used by both environments) are split at read time by each
environment's share of Recorded for that provider and month, and labelled as split in the UI.

## 5. The sync task — `trigger/cost-sync.ts`

One Trigger.dev task, two entry points:

- **Scheduled:** `schedules.task`, daily 02:00 IST (`cron: "30 20 * * *"` UTC). Recomputes
  **yesterday and the current month to date**. On the 1st–3rd of a month it also recomputes the
  previous month, because providers finalise bills late. After that a month is frozen.
- **Refresh now:** the same task, triggered from `POST /api/admin/costs/refresh`, recomputes the
  current month to date.

Steps (each step's failure is recorded in `cost_sync_runs.providers` and never stops the others):

1. **Recorded, production:** call RPC `cost_recorded_rollup(p_from date, p_to date)` on the production DB.
2. **Recorded, staging:** call the same RPC on the staging DB. The staging URL and key exist only in
   the production Trigger.dev environment (`STAGING_SUPABASE_URL`, `STAGING_SUPABASE_SERVICE_ROLE_KEY`).
   The web app never connects to staging.
3. **Billed:** one adapter per provider (§7), all run in parallel.
4. **Write:** per environment, replace the recomputed days through one RPC
   (`cost_replace_recorded(p_env, p_from, p_to, p_rows jsonb)`, delete-then-insert inside the function,
   so it is atomic). Billed rows are upserted per provider the same way. Re-running gives the same rows.

The RPC (same migration on both DBs) returns aggregates only, grouped as `cost_daily_recorded`, from
`generations` where `status = 'succeeded'`, joined to organizations, clients, and canvas / avatar /
script names. How avatar and Visualise-panel generations link to their avatar and script is confirmed
during planning (`node_id`, `meta` or a dedicated column). Anything unlinkable is `scope_type = 'other'`.

**Failure rules** (performance rules 12 and 13):
- A provider fetch that fails leaves that provider's existing rows untouched. It never writes 0.
  The Providers table shows "Couldn't update, showing <date>" for that provider.
- No task-level retries for provider calls inside one run. The next run (nightly or refresh) catches up.
- **Refresh concurrency:** the route returns the running run if one started within the last 10 minutes,
  otherwise inserts a `cost_sync_runs` row and triggers the task. A run older than 10 minutes still
  marked `running` counts as failed.

## 6. Credit coverage registry — `src/lib/costs/coverage.ts`

A typed, hand-maintained list: `{ feature, area, label, providers, status }`, with status
`charged | logged | none`. `cost_daily_recorded.feature` uses the same keys, so the coverage table
joins recorded spend to each row. A unit test fails if a recorded `feature` key has no registry entry.

Current state (code scan, 2026-10-16; confirmed during planning):

| Area | Feature | Status |
|---|---|---|
| Canvas | Video generation · Image generation and composite · Dubbing and lip sync · Prompt / video prompt / multishot · Voice change | charged |
| Canvas | Script parsing, split scene, compose ideas (usage saved on the version, no credits) | logged |
| Canvas | Canvas assistant (copilot) · Reading uploaded files · Dubbing voice preview | none |
| Avatars | Avatar images (front, sheet, variations) · Avatar voice preview | charged |
| Scripts | Storyboard panels (Visualise) | charged |
| Scripts | Script writing copilot (turns, inline edits) | none |
| Brand kit | Knowledge base build and image analysis | none |
| Research | Market research and social import (Apify) | none |

`logged` features get an estimated "about ₹X" from their saved token usage. `none` features show
"Unknown until connected"; their spend is only inside the provider's Billed total.

## 7. Provider bill sources

Probed on 2026-10-16 with the keys in the local `.env` (read-only GET calls). Any provider without
working access falls back to a monthly manual entry until access is granted.

| Provider | Source | Probe result | Needed | Env split |
|---|---|---|---|---|
| OpenAI | Costs API, daily USD, `group_by=api_key_id` | **Works** with `OPENAI_ADMIN_API_KEY` (403 with the normal project key) | Nothing more | **Exact by key**: "Creative OS" = prod, "CreativeOs Stg" = staging |
| fal | `/v1/models/usage?expand=time_series&expand=auth_method` | **Works** with `FAL_ADMIN_KEY` (read-only admin); each row's `auth_method` is the key's name | Nothing more | **Exact by key**: "CreativeOS" = prod, "CreativeOS - Stg" = staging |
| Apify | `/v2/users/me/usage/monthly` | **Works** (USD per cycle and per day, account `developer_yuvabe`); no per-token breakdown | Nothing | `shared`: staging and production use different tokens in the same account (confirmed 2026-10-17), and usage is per account |
| ElevenLabs | `/v1/user/subscription` (plan, characters used of limit) + `/v1/usage/character-stats` (daily characters, by product) | **Works** with `ELEVEN_LABS_ADMIN_KEY` (User + Workspace Analytics only; voices and history refused). Starter plan | Plan fee as a manual entry; Billed = plan fee + any usage beyond the plan limit. Product breakdown (dubbing, speech-to-speech, text-to-speech) shown for context | `breakdown_type=api_keys` returns no rows today; re-check in Nov once the separate stg/prod keys have usage. Until then `shared` |
| Kling | Packs: `GET /account/costs?start_time&end_time` (ms; lists packs **purchased inside the window**, so query ~365 days). Per-charge: `POST /account/billing/package` (body `start_time`, `end_time`, `limit` ≤500, `cursor`, `filters` by `api_key_name`); rows carry `package_id`, `task_id`, `api_key_name`, `model_name`, `deduction_time`, `deduction_amount` (units). `/account/billing/balance` is the cash equivalent (empty for us: packs only). QPS ≤ 1 | **Works** with the existing `KLING_API_KEY` | Pack price entered once per pack (`kind = prepaid`, month of purchase). Unit cost = pack price ÷ pack units, applied per charge via `package_id`. `task_id` matches `generations.provider_job_id` for exact reconciliation. Flag packs expiring with units left (Aug 2026 lost 806 of 1,000) | **Exact by key name**: "Creative OS" = prod, "Creative OS stg" = staging; "Default API Key" ignored |
| BytePlus | Billing OpenAPI `ListBillDetail` (`open.byteplusapi.com`, service `billing`, region `ap-singapore-1`, GET, signed V4). Required: `BillPeriod`, `Limit` (≤300), `Offset`, `GroupTerm=1`, `GroupPeriod=1`; `Total` comes back -1, so page until a short page | **Works** with IAM user `creativeos-cost-reader` (billing read-only) as `BYTEPLUS_BILLING_ACCESS_KEY_ID` / `BYTEPLUS_BILLING_SECRET_ACCESS_KEY`. Lines carry `ExpenseDate`, `Product`, `Element`, `InstanceNo` (the model/endpoint instance), `PayableAmount`, USD | Nothing more | `shared`: lines identify the model instance, not the API key. Checked 2026-10-17: neither ModelArk key ID (`apikey-20260910014644-ktq5n`, `apikey-20261017163608-wshbj`) appears in any field of Sep/Oct bill lines, and ModelArk has no per-key usage API. **Later option:** staging calls its own custom inference endpoints (`ep-…`, IDs from env instead of the hardcoded `variant.arkModel` / `VENDOR_MODEL`); bill `InstanceNo` then splits exactly. Not planned while spend is small |
| Google (Gemini, Veo) | No API for AI Studio keys. Our GCP service account authenticates, but Cloud Billing API is disabled and no BigQuery billing export exists | Manual for now | Optional later: billing admin enables Cloud Billing export to BigQuery and grants the service account read on it (export starts from the day it's enabled) | `shared` |
| Sarvam | No billing API: docs list none, and `/v1/usage`, `/credits`, `/billing`, `/account` and similar all return 404 (checked 2026-10-16). Dashboard Settings → Usage shows spend per workspace | n/a | Manual monthly entry, read from Settings → Usage | Exact if staging and production use separate Sarvam workspaces (one entry each); otherwise `shared` |

**Tracking starts 1 Nov 2026.** Staging and production got separate keys for OpenAI, fal and Kling in
October, so the dashboard's first month is November 2026 and nothing earlier is synced or shown. The
six-month chart fills in from November.

**Only count CreativeOS keys.** The OpenAI "Yuvabe" project also holds keys for other products
("Graph RAG", "Kittykat"), and Kling has a "Default API Key", so the OpenAI, fal and Kling adapters keep
only rows from the keys listed in `src/lib/costs/provider-keys.ts`: a small constant mapping each key
(OpenAI key id, fal key name, Kling key name) to `prod` or `staging`, with the date it took effect.
Key ids and names are not secrets. Rows from any other key are ignored. A key rotation means one new
line in that file. Providers billed per account (BytePlus, Apify, ElevenLabs until its per-key data
appears, Google, Sarvam) are `shared` and split by usage.

**Prepaid packs count when paid.** BytePlus (e.g. a $32 Seedance pack in Sep and Oct 2026) and Kling
sell prepaid packs. Billed counts a pack in the month it was bought, because that is when the money
left. Our records count usage as the pack is drawn down, so a purchase month shows a larger gap. The
Providers table shows the pack as its own labelled amount ("includes $32 prepaid pack"), and
`cost_daily_billed` gets a `kind` column (`usage | prepaid | plan_fee`) to tell them apart.

Manual entries and the monthly FX rate are typed in on the page, in a small "Monthly entries" dialog
(super-admin). A new month's rate defaults to the previous month's until someone sets it.

## 8. API routes (production; `apiOk` / `apiError`, `withTryCatch`)

- `GET /api/admin/costs?month=YYYY-MM&env=all|prod|staging`: everything the page shows, from the
  summary tables only (one round trip per table, run in parallel).
- `POST /api/admin/costs/refresh`: starts or returns the current run (§5).
- `GET /api/admin/costs/runs/latest`: status of the latest run, polled by the page while running.
- `GET /api/admin/costs/export?month=&env=`: CSV of the accounts table (account, client, item, env,
  this month ₹, last month ₹, change %).
- `PUT /api/admin/costs/manual-entries` and `PUT /api/admin/costs/fx-rate`: monthly entries.

Client side follows the three-layer rule: `src/services/admin-costs.service.ts`,
`src/hooks/queries/admin-costs.ts` (`adminCostKeys.month(month, env)`, `adminCostKeys.latestRun()`),
and components under `src/components/admin/costs/`. The run query polls with `refetchInterval`
until the run finishes, then invalidates the month query.

## 9. Build order

1. **Recorded.** Migration (recorded table, runs table, FX table), the rollup RPC on both DBs, the sync
   task's Recorded steps, nightly schedule and Refresh now, and the page's four numbers (Recorded only),
   accounts table, six-month chart and CSV. Useful on day one.
2. **Billed.** Provider adapters, balance snapshots, manual entries and FX dialog, the Providers table,
   Not recorded, the env split for shared keys.
3. **Close the gap.** Gap-reason boxes (failed generations that have a `provider_job_id` and were billed;
   features not connected; plan fees; the rest). Connect the `none` features to the credit system and
   charge the `logged` ones. Each feature connected moves its registry row to `charged`.

## 10. Testing

- RPC: a SQL test fixture with succeeded, failed and running generations across orgs, clients,
  canvases, avatars and scripts; only succeeded rows are summed, and grouping matches.
- Sync task: idempotency (two runs give identical rows), a failed provider adapter leaves its old rows,
  shared-key split arithmetic, month freeze after the 3rd.
- Refresh route: second click within 10 minutes returns the same run; non-super-admin gets 403.
- Coverage registry: every recorded `feature` key has a registry entry.
- Page: env toggle, expand/collapse, CSV columns.
