# Super-admin models, prices and credits (v3) — design

Approved 24 Nov 2026 from the clickable prototype
`OneDrive\Documents\CreativeOS\ModelPricing\shared\model-pricing-v3-2026-11-24-grid-and-credits.html`
(critique and screenshots in `ModelPricing\reference\`). The prototype is the source of truth for layout,
copy and behaviour; this page records what the build must do and the decisions behind it. It replaces the
phase-1 admin UI built by `docs/superpowers/plans/2026-11-23-model-catalog-4-admin.md` and keeps its
server checks and write path (D546, D547).

## Credit settings in the database (plan 5a)

How a run's cost in USD becomes credits is today four constants in `src/lib/credits/units.ts`
(1 credit = $0.001, margin 0%, round up to the next 5). They become dated rows in a new table
`credit_settings`, changed by the super admin like prices.

- A row has `effective_from`, `margin_percent` (0 to 200), `round_step` (1, 5 or 10), `note`,
  `created_by`, `created_at`. The credit rate stays 1 credit = $0.001 in code: changing it changes what
  every credit an agency already holds is worth, so it changes only with plan prices. Rounding is always
  up, so a run never charges below its cost.
- Rows are never edited. A row that hasn't started can be cancelled. The first row (from 1 Jan 2026,
  margin 0, step 5) is seeded by the migration, so behaviour is unchanged until an admin adds a row.
- The rows load with the model catalog (one more query in the same cached read) and reach the browser
  through the same `/api/ai-models` payload, so no screen makes a request of its own.
- A run is charged with the settings live when it started: the estimate and the reservation use the
  row live now; completion uses the row live at the run's `created_at`. No new column on `generations`.
- One pure function turns USD into credits given a settings row; every caller passes the row.
- The worked example on screen uses a simple number: a run that costs us $0.0123 is 12.3 credits, which
  rounds up to 15.

## Admin pages (plan 5b)

Built from prototype v3, direction A ("price grid"). Highlights the build must keep:

- **Models list.** Grouped by kind. Each row: name, status, price range ("from $0.0337925/s, up to
  $0.30408 at 4K"), a typical run in credits ("815 credits, 8 s at 720p"), the next change ("−31% 3 Dec"),
  this month's runs and cost. A "Needs a look" card above the list (a model with no price, a scheduled
  price or credit change). Filters by kind, "only with runs this month", search.
- **Model page.** A header strip under the name: status badge with a menu (change waits for Save, with
  the guards), "Made by <provider>", "Nth of M in the picker" (reorder popover), settings people pick;
  the name is inline-editable. One primary action: Change prices. The price sheet is a grid in the
  model's own settings (video: resolution × audio; image: size × quality), each cell the stored price at
  full precision with credits per unit under it; other charges (tokens per 1M) beside it, or below it
  when the grid is wide. "Live now / From <date>" tabs compare with a scheduled change. "Try a run" with
  chips gives credits and our cost. Side column: price history (a timeline) and this month.
- **Change prices.** First asks: edit the scheduled change, or start a new one from today's prices.
  Spreadsheet editing (Tab, arrows, Enter, Esc, "−31%" in a cell), a bulk "change every price by %"
  with "Include other charges", percent results rounded to 4 significant figures and marked, cells typed
  by hand never overwritten by the bulk change, a "big change" note at 50% or more. When: now, or a date
  and time typed in IST with UTC shown under it, with the vendor's date as a shortcut. Review: every
  change with its %, the typical run before and after, the agencies affected (this month's runs), and,
  when it replaces a scheduled change, every price it replaces; the button then says "Replace the
  3 Dec change". Saved with a toast and Undo.
- **Credits page.** One summary line ("1 credit = $0.001 · margin 0% · rounds up to the next 5
  credits"), the scheduled change, one primary action "Change credit settings"; "How is this worked
  out?" opens the worked example. Main content: what typical runs cost in credits, with a note where
  rounding adds a lot. History of settings rows with Cancel and Undo. The change flow: margin and step
  with a live preview of typical runs before and after, When (defaults to tomorrow 00:00 IST; Now warns),
  Review with the agencies affected and "Credits agencies already hold will buy fewer runs", a warning
  when typical runs rise 20% or more.
- **Everywhere.** One primary action per view; explanations in tooltips or one footnote shown only when
  it applies; plain copy, no ids except small secondary text; dialogs are real modals; keyboard and
  390 px work; AA contrast.

## Server additions for plan 5b

- Replace a scheduled price change in one step (cancel the future row and insert the new one in one
  transaction), through the same checks.
- Reorder models in a kind (sort orders written together).
- Agencies affected: this month's runs per agency per model, one grouped query.
- Undo of a price or credit change that has started: a new row with the previous values, live now.
