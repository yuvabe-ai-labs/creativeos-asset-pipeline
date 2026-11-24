# Admin models, prices and credits from prototype v3 (5b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the phase-1 admin pages under `/admin/models` with the approved prototype v3 (direction A, "price grid") and add `/admin/credits`, keeping every server check and the single guarded write path (D546, D547, D548).

**Architecture:** The prototype is the UI spec: `C:\Users\yuvab\OneDrive\Documents\CreativeOS\ModelPricing\sources\model-pricing-v3-2026-11-24-grid-and-credits.html` (open the built copy in `..\shared\` to click through it; screenshots in `..\reference\v3-*.png`). Pure view logic (price grid axes, price ranges, typical runs, IST dates, money formatting, percent edits) lives in `src/lib/admin/` with tests; components in `src/components/admin/` render it with shadcn primitives. New server pieces: replace a scheduled price in one transaction, reorder, agencies affected, and Undo of a started change, all through the D546 checks. Plan 5a (credit settings rows) must be complete first.

**Tech Stack:** Next.js 16 (Server Components + server actions), React, shadcn/Base UI, Supabase, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-11-24-model-admin-v3-design.md`.

## Global Constraints

- **Match the prototype** in layout, copy, behaviour and keyboard handling. Where the app's components or brand rules (AGENTS.md "Frontend aesthetics", "Controls — shadcn primitives only", "UI consistency") differ from the prototype's hand-written HTML, the app's rules win; say what differed in the task report. Use the `frontend-design:frontend-design` skill's restraint rules; the brand wins.
- **Simple worked example** on the Credits page and in its "How is this worked out?" dialog: "A run that costs us $0.0123 is 12.3 credits, which rounds up to 15." (with the live margin and step; the Omni example stays only in the typical-runs table).
- Every write goes through the D546 checks in `src/lib/ai-models/model-edit.ts` / D548 checks in `src/lib/credits/settings-edit.ts`, via server actions that call `requireSuperAdmin()` first; cache cleared after a write; no raw DB text in the UI; allowlisted in `with-action-coverage.test.ts`.
- Plain copy, no internal ids in headings or screen-reader labels (ids only as small secondary text), no em-dash phrasing, one primary action per view, explanations in tooltips or one footnote shown only when it applies.
- Dates and times typed and shown in IST with UTC under them; prices at full stored precision via one formatter; credits from unrounded maths.
- Controls are shadcn primitives (`src/components/ui/*`); add a missing primitive there (e.g. a calendar, from the shadcn Base UI registry) rather than a raw element. Real modal dialogs (focus trap, Esc closes the top layer, focus returns). Keyboard and 390 px work. AA contrast.
- Performance: each page makes a fixed number of queries in one `Promise.all`; no per-row query; the agencies-affected numbers come from one grouped query.
- Test env: node, no `@testing-library`; put logic in pure functions and test them; components with `renderToStaticMarkup`. Run vitest from PowerShell.
- Files keep their line endings; comments UTF-8. No AI attribution in commits; stage by explicit path. No database connections by the implementer. tsc: only `.next/` errors known.

---

### Task 1: Server pieces (migration 0088, actions)

Migration 0087 is taken by plan 5a (`0087_credit_settings_lead.sql`), so this migration is 0088.

**Files:** `supabase/migrations/0088_admin_price_ops.sql`, `docs/auth-production-migration.md` (CRLF entry), `src/lib/db/ai-models-admin.ts`, `src/lib/actions/ai-models.ts`, `src/lib/actions/credit-settings.ts` (from 5a), tests next to each.

- **Replace a scheduled price:** SQL function `replace_ai_model_price(p_cancel_id uuid, p_model_id text, p_effective_from timestamptz, p_lines jsonb, p_estimate jsonb, p_source_url text, p_note text, p_created_by uuid)` that deletes the future row (must belong to `p_model_id` and not have started) and inserts the new row in one transaction; returns the new id. Action `replaceAiModelPriceAction({ replaceId, modelId, … })` runs `checkNewPrice` with the replaced row excluded from the duplicate check.
- **Reorder:** action `reorderAiModelsAction(kind, orderedIds)`: every id must exist and be of that kind (rule 14); writes `sort_order` 0..n-1 in one update (an SQL function `reorder_ai_models(p_kind text, p_ids text[])` in 0088).
- **Agencies affected:** SQL function `ai_model_month_runs_by_org(p_from, p_to)` → `(model_id, org_id, org_name, runs, cost_usd, credits)`; helper `modelRunsByAgency(from, to, modelId?)`.
- **Undo a started change:** action `undoAiModelPriceAction(modelId, priceId)`: only for the latest started row of that model created by this admin within the last 24 h; inserts a new row live now with the previous row's lines and estimate (through `checkNewPrice`), note "Undo of the <date> change". Same for credit settings (`undoCreditSettingsAction`). A future row's Undo is the existing cancel.
- Tests for each: refusals write nothing; scoped ids; the replace is one RPC call; plain copy. Migration doc: what, when to apply (before 5b deploys), safe to re-run, verify SQL.

### Task 2: Pure view logic

**Files:** `src/lib/admin/price-grid.ts`, `src/lib/admin/typical-runs.ts`, `src/lib/admin/ist.ts`, `src/lib/admin/percent-edit.ts`, `src/lib/ai-models/price-format.ts` (full precision), tests in `src/lib/admin/__tests__/`.

- `priceGrid(model, price)`: the axes and cells the prototype draws (video: resolution rows × audio columns when the price has audio lines, else one column; image: size rows × quality columns for OpenAI, size rows otherwise), each cell `{ key, label (plain, e.g. "720p, audio on, price per second"), usd, unit }`, plus `otherCharges` (token and other lines, token prices per 1M). Cells a model doesn't offer are marked. Works for every seeded image and video model (test over `seededModelCatalog()`), and for other kinds returns only `otherCharges`.
- `priceRange(model, price)` → the list's "from $X/s, up to $Y at 4K" text.
- `typicalRun(model)` and `TYPICAL_RUNS` (the Credits page list): one definition used by the list, the model page and the Credits page (prototype `defaultSpec` / `calcSpec`); `runCostUsd(model, price, spec)` built on `imageEstimateUsd` / `videoEstimateUsd` / service and text pricing so it equals what a real run estimates.
- `ist.ts`: parse a typed IST time ("8", "8:00", "0800", "8 pm", "20:00"), IST date + time → instant, instant → IST and UTC display, "today in IST", "tomorrow 00:00 IST".
- `percent-edit.ts`: apply "−31%" to a value, round to 4 significant figures, mark approximate; bulk apply that skips hand-typed cells and optionally other charges; "big change" at ≥50%.
- `price-format.ts`: show stored precision trimmed (max 7 significant figures), never exponent; token prices per 1M.

### Task 3: Models list

**Files:** `src/app/admin/models/(list)/page.tsx`, `src/components/admin/models/models-list.tsx` (+ row, needs-a-look card), remove `models-table.tsx` and its test when replaced.

Prototype page "Models list": grouped by kind; row = name, status badge, price range, typical run credits, next-change chip, this month (hidden at 390); "Needs a look" card (no price, scheduled price changes, scheduled credit change); kind tabs, "Only with runs this month", search; rows open with click or Enter. Data: `listAdminModels`, `listAdminPrices`, `modelMonthStats`, credit settings, in one `Promise.all`.

### Task 4: Model page — header strip, price sheet, side column

**Files:** `src/app/admin/models/[id]/page.tsx`, `src/components/admin/models/model-header.tsx` (name inline edit, status menu with Save and guards, "Nth of M in the picker" reorder popover, settings people pick popover), `price-sheet.tsx` (grid view, Live now / From <date> tabs, other charges, footnote when it applies), `try-a-run.tsx`, `price-timeline.tsx`, `month-summary.tsx`; remove `model-details-form.tsx`, `model-definition.tsx`, `model-month-stats.tsx`, `price-history.tsx` when replaced (keep `model-problems.tsx` for broken rows, restyled).

Prototype page "Model". One primary action: Change prices. Broken rows (D547) still render with the problems card.

### Task 5: Change prices flow

**Files:** `src/components/admin/models/change-prices/` (`chooser-dialog.tsx`, `grid-editor.tsx` with keyboard handling, `bulk-percent-bar.tsx`, `keyboard-chip.tsx`, `when-step.tsx` with the calendar popover, `review-step.tsx` with diff, replace list, typical run before/after and agencies affected, `use-change-prices.ts` state), wiring to `addAiModelPriceAction` / `replaceAiModelPriceAction` / cancel / undo with a toast.

Prototype page "Change prices flow", including: chooser when a change is scheduled; spreadsheet keys; −31% per cell and bulk with "Include other charges"; ≈ rounded marks; big-change note; When in IST with the vendor's date; Review "Replace the 3 Dec change" when it replaces; toast with Undo.

### Task 6: Credits page and its change flow

**Files:** `src/app/admin/credits/page.tsx` (+ `loading.tsx` under a route group per `loading-boundaries.test.ts`), `src/components/admin/credits/` (`credits-summary.tsx`, `how-worked-out-dialog.tsx` with the simple $0.0123 example, `typical-runs-table.tsx` with rounding notes, `credit-history.tsx`, `change-credit-settings-dialog.tsx`), admin section nav gains "Credits".

Prototype page "Credits": summary line, scheduled change, one primary action; typical runs main content; history with Cancel and Undo; change flow (margin, step 1/5/10, live preview, When defaulting to tomorrow 00:00 IST with a warning for Now, Review with agencies affected and "Credits agencies already hold will buy fewer runs", warning when typical runs rise 20%+).

### Task 7: Clean-up, ADR and live check

- Remove leftovers of the phase-1 UI (`add-price-sheet.tsx`, `price-lines-editor.tsx`, `price-pair-rows.tsx`, `pair-key-select.tsx`, `price-draft.ts`, `add-chip.tsx` if unused, their tests); keep the server checks.
- ADR D549 in §7: the admin UI follows prototype v3 (link the spec), the replace/reorder/undo operations, IST input.
- Live check on dev with the user: list, model page, a scheduled change edited and replaced, a credit settings change previewed and cancelled, 390 px.

## Not in this plan

Params/rules/capabilities editor (checks exist), per-agency margin, adding a model from the admin.
