# Billing piece 2: Admin adds an agency with billing, and changes it any time

**Date:** 2026-11-20 · **Branch:** `feat/razorpay-test` · **Map:** `2026-11-19-billing-phase-1-design.md`
(piece 2) · **Builds on:** piece 1 (`2026-11-20-credit-grants-design.md`, migration 0067)

## Goal

Yuvabe chooses an agency's billing when adding it, can give free credits with an end date, and
can change any of it later from the agency's page. Every change is logged with who, when and why.

## Out of scope

Plans and prices (piece 3); cancelling a Razorpay subscription when switching to managed (piece 5
adds it, since no subscriptions exist before then); the owner's screens (piece 6).

## Add an agency

The popup gains **Billing**, a two-way choice:

- **Managed by Yuvabe** (the default, as every agency is today): the monthly credit limit field
  as now.
- **Pays for a plan**: **Free credits to start**, None (default) or Give free credits. Giving them
  needs an amount (a whole number above 0) and an end date (today or later). No defaults.

The agency and invite are made first, as now. Then the billing mode is set and the free grant
written. If either fails, the agency still exists and the result says what wasn't saved (as the
credit limit does today: "Billing wasn't saved. Set it on the agency's Billing tab.").

When free credits are given, the owner's invite email gets one more line: "You have 50,000 free
credits to try CreativeOS until 3 Dec 2026."

**End dates are days.** A chosen date means the credits work through the end of that day in India
time: `ends_at` is the next day at 00:00 +05:30. Screens show the last day.

## The agency page: a Billing tab

A new tab after Overview. The monthly credit limit card moves here from Overview (one place for
billing).

1. **Billing:** "Pays for a plan" or "Managed by Yuvabe", with **Change**. The change dialog asks
   for a reason (required) and says what happens:
   - to managed: "Their credits stop counting and the monthly limit applies."
   - to plans: "AI runs need credits from now: free credits, or a plan once plans are on."
   Below: Plan type: Standard.
2. **Monthly credit limit** (managed only): today's editor.
3. **Credits** (paying only): the open grants, first-ending first. Each row: kind (Free credits,
   Plan, Top-up, Added by Yuvabe), left of total, ends on. Actions:
   - **Add credits:** amount, end date, reason. Writes an `admin` grant.
   - **Give free credits:** amount, end date, reason. Writes a `free` grant.
   - Per grant **Take back:** amount (up to what is left), reason.
   - Per grant **Change end date:** date, reason. **End now** (on the same dialog): ends it at once.
   Empty state: "No credits. Runs are stopped until credits are added or a plan is bought."
4. **Billing log:** the last 50 changes: when, who, what (plain words), reason.

Ended grants are not listed (they stop counting); the log keeps their history.

## Database (added to migration 0067, which is not applied yet)

Each function locks the agency row (like the piece 1 functions) and writes its `billing_log` row
in the same transaction. `security definer`, `set search_path = public`, `service_role` only.

- `admin_set_billing_mode(p_org_id, p_mode, p_actor, p_reason) returns boolean`: false when the
  agency is missing or already in that mode.
- `admin_grant_credits(p_org_id, p_kind, p_credits, p_ends_at, p_actor, p_reason) returns uuid`:
  `p_kind` is `free` or `admin` (anything else raises); null when the agency is missing.
- `admin_take_back_credits(p_grant_id, p_credits, p_actor, p_reason) returns text`: `ok`,
  `not_found`, or `too_many` (more than is left).
- `admin_set_grant_end(p_grant_id, p_ends_at, p_actor, p_reason) returns text`: `ok` or
  `not_found`. An end before the grant's start is moved to one second after the start.

Log actions: `billing_mode`, `grant`, `take_back`, `grant_end`, each with `before` and `after`.

## Code

- `src/lib/billing/dates.ts`: `endsAtFromDay(day: string)` (`YYYY-MM-DD` → ISO of the next day
  00:00 IST), `lastDayOf(endsAt: string)` (back to `YYYY-MM-DD`), `todayIst()`, `formatDay(day)`
  (`3 Dec 2026`).
- `src/lib/billing/admin-schema.ts`: zod parsing for the form fields (credits, day, reason, mode).
- `src/lib/db/billing-admin.ts`: the four RPCs, `listBillingLog(orgId, limit)` (log rows plus
  actor names in a second query).
- `src/lib/actions/billing-admin.ts`: server actions, each `requireSuperAdmin()`, parse, call,
  `revalidatePath` of the agency page. Plain errors.
- `createAgencyAction` reads `billingMode`, `freeCredits`, `freeUntil`; `createAgency` passes free
  credits to `ownerInviteEmail`.
- Components in `src/components/admin/billing/`: `billing-mode-field.tsx` (popup), 
  `free-credits-field.tsx` (popup), `billing-tab.tsx`, `billing-mode-card.tsx`,
  `grants-card.tsx`, `grant-dialog.tsx` (add / give free), `take-back-dialog.tsx`,
  `grant-end-dialog.tsx`, `billing-log-card.tsx`. shadcn primitives only; the end date is an
  `Input type="date"`.

## Calls on load

The Billing tab's data loads with the page in its existing `Promise.all`: one `credit_balance`
call, one log query, one names query. Nothing per grant or per row.

## Testing

- Dates: the IST boundaries (a day maps to the next 00:00 +05:30 and back).
- Schema: refusals (0, negative, decimals, past day, empty reason).
- Actions: super admin only; each calls its RPC with the parsed values; plain errors on refusal.
- `createAgencyAction`: managed by default; plans with and without free credits; billing failure
  reported beside the link.
- Email: the free credits line appears only when given.
- Migration text test: the four functions lock the agency, log, and are service-role only.
- By hand on staging after 0067: add a paying agency with free credits; take back some; move the
  end date; end now; switch to managed and back; the log shows each.
