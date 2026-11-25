# Billing phase 1: agency onboarding to credit management

**Date:** 2026-11-19, revised 2026-11-20 after the call with Anupama · **Status:** journey agreed;
the open questions answered on 20 Nov except final prices · **Prototype:**
`OneDrive/Documents/CreativeOS/Credits/shared/2026-11-20-billing-journey-prototype-v4.html`, the
plan page `Credits/shared/2026-11-20-credits-plan-v2.html`, the notes
`Credits/2026-11-19-phase-1-notes.md` · **Builds on:** the test top-up (D573,
`2026-11-19-razorpay-test-top-up-design.md`).

This is the map for phase 1. Each piece below gets its own spec, plan and build, in the order given.

## What phase 1 makes possible

Yuvabe adds an agency, optionally with free credits that end on a date we set. The owner tries
the product, picks a monthly plan and pays by card or UPI Autopay, the plan renews every month,
the owner can top up and see who used what, a failed payment stops AI runs, and Yuvabe can see
and change every agency's billing at any time.

### The journey

1. **Yuvabe adds the agency** in Admin: name, owner's email and **billing**:
   - **Pays for a plan.** Optionally **free credits to start**: an amount and an end date, both
     typed each time (no defaults).
   - **Managed by Yuvabe.** A monthly credit limit or unlimited, as today. Never charged. Our own
     team and every agency that exists today.
   The owner is invited as today: the email (which mentions any free credits), and the sign-up
   link to copy.
2. **The owner signs up** and lands in the workspace. A bar at the top shows the free credits and
   their end date, or "Pick a plan to start generating". Clients, brand kits and inviting the team
   work without a plan. **An AI run needs credits**: free credits or a plan.
3. **The owner picks a plan and pays** through Razorpay. Monthly plans only; they renew on the day
   of the first payment. A plan bought while free credits are left adds its credits on top.
4. **Credits arrive when Razorpay's signed webhook confirms the payment** (never from the browser).
5. **Runs** hold credits at the start and take only the real cost at the end (as today). **Credits
   that end first are used first**: free credits, then plan credits, then top-ups.
6. **Free credits end on their end date.** Whatever is left is gone. Without a plan, AI runs stop
   until one is picked.
7. **At 80% used** the owner sees a warning. A **top-up** adds credits until the plan month ends.
   Top-ups need a plan. Members never see credits or billing; when blocked they are told to ask
   the owner.
8. **Every month** Razorpay charges the plan. New plan credits arrive; what was left last month,
   top-ups included, ends. A plan above ₹15,000 a month (with GST) can’t be charged automatically
   (RBI): its renewal is **payment needed** until the owner approves Razorpay’s request, and the
   month’s credits arrive then.
9. **Change plan** applies from the next payment. **Cancel** stops the next charge, with no refund;
   the plan works until the paid month ends.
10. **A failed renewal stops AI runs** at the first failed attempt: view only, with a message.
    Nothing is deleted; paying restores everything at once.
11. **Yuvabe can change any agency at any time** (below). Every change is logged with who, when and
    a reason.

### Yuvabe admin controls

- **Agencies:** add; switch between paying and managed (switching to managed cancels the plan with
  Razorpay, no refund); give more free credits, move their end date, or end them now; add credits
  or take back unused ones; change a managed agency's limit.
- **Plans and prices:** add, rename or hide plans and top-up packs; set their credits; set the
  plan margin and the top-up margin over our AI cost. **One price list for every paying agency.**
  A change applies to each agency from its next payment; the screen lists who is affected before
  saving.
- **Plan type** on each agency, always `standard` for now, so custom plans can come later.
- **Payments and usage:** every payment with failed ones first, renewals coming up, what each
  agency has paid; send a payment link after a failed payment; usage for every agency by member,
  client and canvas (the usage view the owner sees).

### Later (not phase 1)

- Custom plans and prices for one agency (`plan_type = custom`).
- Yearly or 6-monthly plans at a lower price (deferred on 20 Nov).
- Refunds from Admin. Until then: refund in Razorpay, then take the credits back in Admin.
- Extra days to pay after a failed payment. Pausing or closing an agency.
- Upgrading mid-month. Until then: top up, and the new plan starts from the next payment.
- Top-ups that last longer than the plan month.
- Emails at 80% and 100% used, and before free credits end.
- Model prices in the database with start dates (prices stay in code; a change needs a release).
- A public landing page where agencies sign up and pay on their own.

### Decided on 20 November

1. **Plans above ₹15,000 a month** renew as payment needed until the owner approves (journey 8).
2. **GST invoices:** Razorpay’s invoice for each payment, with the agency’s GSTIN. No numbering
   of our own.
3. **Failed payment:** AI runs stop at the first failed attempt; paying starts them again.
4. **Yearly or 6-monthly plans:** later.
5. **Rupee rate:** fixed, $1 = ₹100 (1,000 credits = ₹100 before margin). A setting Yuvabe can
   change in Admin; a change applies from each agency’s next payment, like a margin change.
6. **Free credits:** optional, no default amount or end date.

Still open: the real plans, credit amounts, plan margin and top-up margin. They are settings, so
nothing waits on them.

### Needed from Razorpay before pieces 3 and 4

UPI is off on the account (`/v1/methods` reports `upi: false`) and recurring payments are not set.
Ask support to enable UPI (collect, intent, QR), Subscriptions, UPI Autopay and card e-mandates in
test and live mode; finish account activation (KYC) for live.

## The ledger: grants that end

Free credits end on their own date; plan credits, top-ups and Yuvabe's added credits end when the
plan month ends. Because the end dates differ, one balance per period is not enough (the earlier
draft's simplification no longer holds). Instead:

- Every credit an agency receives is a **grant**: kind (`free`, `plan`, `topup`, `admin`), credits,
  starts, ends.
- A run's hold is **allocated to grants** in end-date order (the one ending first, first), and
  settlement moves the real cost onto the same grants. So "credits that end first are used first"
  is exact, and what is lost when a grant ends is exact too.
- The balance is the sum of what is left on grants that have started and not ended. No job is
  needed for credits to end: an ended grant simply stops counting.
- **Managed agencies have no grants** and keep today's monthly limit check unchanged.

## Pieces, in build order

| # | Piece | Depends on | Delivers |
|---|---|---|---|
| 1 | **Credit grants and the paying-agency balance** | – | `organizations.billing_mode` and `plan_type`; `credit_grants`, `credit_grant_uses`; `reserve_credits` v2 (managed: limit as today; paying: grants, with a reason when refused: no credits yet, free credits ended, used up); settlement through one RPC that moves the hold onto the same grants; `credit_balance` for screens; the billing log |
| 2 | **Admin: add an agency with billing, and change it any time** | 1 | Add-agency popup gains Billing and free credits; the agency page gains a Billing tab: switch billing, free credits (give more, move the end date, end now), add or take back credits, the log. Existing agencies stay managed |
| 3 | **Plans, packs and prices** | 1 | `billing_plans`, `topup_packs`, `billing_settings` (rupees per dollar, fixed at ₹100; plan margin; top-up margin); prices derived; Admin's Plans and prices screen with who-is-affected before saving |
| 4 | **One-time payments (top-ups)** | 1, 3 | Top-ups through Razorpay Orders, built on the test top-up; a paid order writes a `topup` grant ending with the plan month |
| 5 | **Monthly subscriptions** | 1, 3 | One Razorpay Plan per plan and price, created on demand; subscribe; webhooks `subscription.activated`, `.charged`, `.pending`, `.halted`, `.cancelled` stored once by event id; each charge writes a `plan` grant for the month; change plan and cancel at the cycle end; payment due stops runs; nightly check against Razorpay |
| 6 | **Owner screens** | 1, 3 (4, 5 for paying) | The free-credits / pick-a-plan bar, plans page, Razorpay Checkout, credits by kind with end dates, billing page (plan, credits, top up, payments and invoices, change, cancel, who used what), blocked-run dialogs for owner and member, 80% warning |
| 7 | **Admin payments and usage** | 4, 5 | Payments across agencies (failed first, renewals in 7 days), send a payment link, usage for every agency |

Pieces 1 to 3 need nothing from Razorpay and can ship before UPI and Subscriptions are enabled.
The test top-up page (`/billing-test`) is removed when piece 6 ships.

## Data model sketch (detailed in each piece's spec)

- `organizations`: `billing_mode` (`managed` | `plans`, default `managed`), `plan_type`
  (`standard` | `custom`, default `standard`).
- `credit_grants`: agency, kind, credits, starts at, ends at, source (payment, subscription
  charge, admin), created by, reason.
- `credit_grant_uses`: generation, grant, credits (the hold or the settled cost on that grant).
- `billing_log`: agency, who, what, before and after, reason, when.
- `billing_settings` (one row: `inr_per_usd` default 100, `plan_margin_pct`, `topup_margin_pct`), `billing_plans` (name, credits, active, sort), `topup_packs`.
- `billing_subscriptions`: agency, plan, Razorpay subscription id, status (`created`, `active`,
  `payment_due`, `cancelling`, `ended`), current period start and end, next plan.
- `billing_payments` (from 0090): gains kind (plan, renewal, top-up), plan or pack, invoice.
- `razorpay_events`: event id (unique), type, payload, processed at.

## Testing approach

- Unit and route tests per piece, as in the test top-up (signatures, idempotency, refusals).
- SQL is pinned by text tests (as for 0065) and checked by hand on staging with the scripted cases
  in each piece's spec.
- The replay script grows to send subscription events, so renewals, failures and repeats are
  tested locally without waiting a month.
- Concurrency test before launch: many runs at once against a small balance; the balance never
  goes below zero and every hold is released.
- End to end in Razorpay test mode through the tunnel, once UPI and Subscriptions are enabled.
