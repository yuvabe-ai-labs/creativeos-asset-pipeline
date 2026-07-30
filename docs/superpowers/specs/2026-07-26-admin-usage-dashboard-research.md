# How SaaS Products Show Usage/Cost Data — Research for 3F (Admin Usage UI)

Companion to `2026-07-24-industry-credit-system-research.md` (which covered estimate/deduction
*logic*) — this covers how usage is *displayed*, for Stage 3's admin-facing sub-plan 3F.

## Patterns found, by product

**Anthropic Console** (source: [support.claude.com](https://support.claude.com/en/articles/9534590-cost-and-usage-reporting-in-console)) —
splits into two pages:
- **Usage page:** bar chart of input/output token counts (hour/minute granularity), rate-limit
  visualization, filterable by model / date-time / API key, summary totals for the selected
  filter, CSV export.
- **Cost page:** a **daily cost chart** (spend over time, one bar/point per day), filterable by
  workspace / model / specific month, a total-spend summary for the selected period, CSV
  export.
- **Explicit limitation they call out:** no per-user cost breakdown — only by model/key/date.

**Vercel Usage dashboard** (source: [vercel.com/docs/pricing/manage-and-optimize-usage](https://vercel.com/docs/pricing/manage-and-optimize-usage)) —
- An **"allotment indicator"**: how much of the current cycle's quota is consumed + a
  *projected* cost for each metered item (not just historical — forward-looking).
  - Billing-cycle dropdown defaults users toward **"last 30 days"** for pattern-spotting.
  - Breakdown **by project** and **by region** — the equivalent, for us, would be per-client or
    per-model breakdown.
  - A **ratio view** per metric (e.g. cached vs. uncached requests) — not directly applicable
    to credits, but the general idea (a secondary breakdown dimension) is.

**Stripe / general usage-based billing practice** (source: [stripe.com](https://stripe.com/resources/more/what-is-metered-billing-heres-how-this-adaptable-billing-model-works),
industry guides) —
- Show **current-period total next to the plan limit**, prominently, on load.
- **Threshold alerts** are standard practice: notify at 80% and 100% of quota — both a
  courtesy and (for paid upsell products) a natural nudge.
- Core principle: *"the moment your customer sees the meter, they should understand why
  they're paying for it and be able to predict their bill."* — favors a clear breakdown by a
  unit the viewer already understands (for us: generation type / model) over a single opaque
  number.

## Cross-product patterns (what shows up in 2+ sources)

1. **A time-series chart of spend/usage**, not just a single current-total number — daily
   granularity within a month is the common default (Anthropic's daily cost chart, Vercel's
   30-day view).
2. **A breakdown by a meaningful category** — model (Anthropic), project/region (Vercel). For
   this app, the two natural categories already in the data model are **generation type**
   (image/video/prompt) and **model** (gpt-image-2, veo-3.1, etc.) — and, unlike Anthropic
   (which explicitly can't), **this app already has real per-client data** (every generation
   has a `client_id`), so a **per-client breakdown is a real, buildable differentiator**, not
   a stretch.
3. **A month/period selector**, not just "current month" — letting an admin look back at
   November's usage after it's over is table-stakes in every product surveyed.
4. **Export** (CSV) shows up as a real, recurring feature — lower priority than the above
   three, but a cheap, expected addition if a table of rows already exists to export.
5. **Threshold alerts** (80%/100%) are common in metered-billing guidance specifically, but
   are a genuinely separate feature (notifications infra) from a *display* page — flagged as
   a candidate for a LATER sub-plan, not bundled into 3F's first pass.

## What this suggests for 3F, pending user confirmation on scope

- A period selector (current month + some number of past months) is well-supported by the
  data model already: `credit_transactions.created_at` + a `date_trunc('month', ...)` grouping
  gives an accurate historical month figure the same way `org_credit_usage` already computes
  the current month (every past month is by definition "closed" — all its reservations have
  already reached a terminal state, so a plain sum is correct for any past month too, not
  just the live one).
- A breakdown by generation type and/or model requires joining `credit_transactions` back to
  `generations` (via `generation_id`) to read `type`/`model_used` — not currently exposed by
  any existing view.
- A per-client breakdown requires the same join, reading `generations.client_id`.
- A time-series chart requires picking a rendering approach — **this project has no charting
  library installed today** (checked `package.json` — no recharts/chart.js/visx/etc.). Options:
  a) add a small charting dependency, b) build a simple CSS/SVG bar chart in-house (matches
  this project's general preference for minimal dependencies and its existing hand-built
  primitives), c) skip charting for a first pass and show the breakdown as a table only,
  charting as a later iteration.

Sources: [support.claude.com — Cost and usage reporting](https://support.claude.com/en/articles/9534590-cost-and-usage-reporting-in-console),
[vercel.com — Manage and optimize usage](https://vercel.com/docs/pricing/manage-and-optimize-usage),
[stripe.com — Metered billing](https://stripe.com/resources/more/what-is-metered-billing-heres-how-this-adaptable-billing-model-works).
