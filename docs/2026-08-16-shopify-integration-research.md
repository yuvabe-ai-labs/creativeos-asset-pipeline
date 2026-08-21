# Shopify & CreativeOS — integration research

**Date:** 2026-08-16
**Status:** Research complete. No decision taken.
**Question asked:** Is there an angle for CreativeOS in Shopify — as an integration, an App Store
presence, or a channel? And does any of it conflict with our current ICP (design agencies producing
content for D2C brands)?

---

## 1. Verdict

**Shopify is worth integrating as a data source. It is closed to us as a distribution channel — not
by judgement, but by Shopify's own written policy.**

Three findings drive that:

1. **App Store requirement 1.1.14 explicitly prohibits apps that connect merchants to agencies.**
   We are, by definition, the thing that sentence bars.
2. **Every unit in the Shopify app model is the shop** — install, token, scopes, billing, uninstall.
   There is no API credential that spans stores. The entity that is our customer, the agency, does
   not exist in Shopify's data model.
3. **The merchant-facing prize is small and shrinking.** Shopify now gives away AI image editing and
   social post generation free on every plan, and the leading third-party AI social app has 130
   reviews in four years.

The recommended path is a **merchant-created custom app** — one API token per client store, pasted
into that client's brand workspace. Days of engineering, zero review time, zero revenue share, and
our agency pricing survives untouched.

**On ICP conflict:** the data-source angle *reinforces* the current ICP. The App Store angle would
replace it — and would discard the one differentiator no competitor in our category has.

---

## 2. How the Shopify app model actually works

### 2.1 An app is not a plugin

"Plugin" implies WordPress — code installed into the host that can touch anything. Shopify is the
opposite. **An app is an external web service that Shopify grants scoped, revocable API access to,
one store at a time.** Our code never runs inside Shopify.

An app bundles four things:

* **API access** — scoped credentials against that store (`read_products`, `write_files`, …)
* **Extensions** — slots where Shopify renders our UI: an embedded admin page (App Bridge), an
  action or block on a product page, a theme extension, checkout UI on Plus
* **Webhooks** — events pushed to us (`products/update`, `app/uninstalled`)
* **Billing** — if listed, charges placed on that merchant's Shopify invoice

### 2.2 The shop is the unit of everything

Install is per shop. Token is per shop. Scopes are per shop. Billing is per shop. Uninstall revokes
per shop.

**There is no API credential that spans shops** — not for partners, not for agencies. Collaborator
accounts look like the exception (one Partner account reaching many client stores) but they are
**human admin access, deliberately outside the app model**. A collaborator can log into a client's
admin; a collaborator cannot make API calls across a portfolio.

Once that is internalised, every constraint below stops being a rule to work around and becomes
arithmetic.

### 2.3 The three distribution types

| | Installs on | Review | Billing API |
|---|---|---|---|
| **Public** | Many stores, listed in the App Store | **Yes**, no published SLA | **Mandatory** |
| **Custom** | One store — or several *within one Plus organization* | No | No |
| **Merchant-created** (store admin → Develop apps) | The single store that created it | No | No |

The "multi-store" custom option means **one merchant's own family of stores under a single Plus
org** — a brand running `.com`, `.co.uk`, `.ca`. It is not an agency's portfolio of unrelated
clients, and was never intended to be.

Going public is real engineering, not paperwork: OAuth on install, session tokens, an embedded App
Bridge experience, **functioning with no third-party cookies or localStorage including Chrome
incognito**, GraphQL-only since April 2025, Shopify billing wired in, plus test credentials and a
demo screencast. Then a review queue with **no published SLA** — community reports range from 5–10
business days to 30+.

---

## 3. How Shopify apps charge customers

### 3.1 The rule

A **listed** app cannot bill customers itself; off-platform billing is prohibited (requirement
1.2.1). **Custom and merchant-created apps have no Billing API at all** — so they bill however they
like, entirely outside Shopify. The two models are opposites.

### 3.2 Charge types (listed apps)

* **Recurring** — free, monthly, or annual plans
* **One-time** — a single charge
* **Usage-based** — metered, via billable usage events through the App Events API

Free trials are supported, and Shopify's own guidance is to *"align with Shopify's free trial or $1
plan."*

### 3.3 Where the money goes

> *"Charges are directly added to the merchant's Shopify invoice."*

The merchant never enters a card into the app. They approve an upgrade in the Shopify admin, and the
charge lands on the same bill as their Shopify subscription. Shopify collects, handles sales tax,
and pays out.

### 3.4 What Shopify takes — less than assumed

> *"You keep 100% of your first $1,000,000 USD in gross app revenue earned from January 1, 2025, and
> 85% of earnings above that."*
>
> *"All billing is subject to a 2.9% processing fee and applicable sales tax."*

Plus a one-time **$19** Partner registration. Developers above **$20M/year** through the App Store,
or **$100M+** company-wide, *"pay 15% revenue share on all app revenue"* with no 0% tier.

Two details with teeth: revenue share is computed on **gross sales with refunds not deducted**, and
it **aggregates across all associated developer accounts**, so a second account does not reset the
threshold.

**At our scale that is 2.9% and nothing else — cheaper than Stripe.** Worth stating plainly, because
it removes "app store tax" from the list of reasons not to list. **The economics are generous; the
shape is disqualifying.** Only one of those is negotiable.

### 3.5 The pattern AI apps actually use

Almost no AI app on Shopify bills purely by usage, despite the API supporting it. They sell **tiered
subscriptions bundling credits**:

| App | Tiers |
|---|---|
| SellerPic | Free (20 credits) / $29 (200) / $79 (600) / $99 (3,000) |
| Vidify | Free (2 videos) / $20 (20) / $40 (40) / $60 (60) |
| Predis | Core $32 (1 store, 1,300 credits) / Rise $79 (**up to 4 stores**, 3,200 credits) |

The reason is variable cost of goods — every generation costs real money — against a merchant's
desire for a predictable bill. Bundled-credit tiers cap COGS exposure without the friction of a
metered charge needing re-approval when a cap is raised.

**Our own pricing is already this shape** (Creator 20,000 credits, Studio 52,000). The commercial
model is ecosystem-native; it is simply billed to the wrong entity for Shopify's rails.

---

## 4. The merchant-facing AI creative market on Shopify

### 4.1 Shopify gives the category away

**Shopify Magic is free on every plan** — verbatim: *"Shopify Magic tools and experiences are
available for free, regardless of your subscription plan."*

The Winter '26 Edition pushed it well into creative territory:

* Sidekick image editing — *"change image backgrounds, add or remove elements, and expand canvas size"*
* A mobile image editor turning phone photos into product shots
* **Social post generation to promote products**
* Shoppable videos on Shop with AI-optimised distribution

Background swaps, lifestyle stills, and basic social copy are now commodity give-aways inside the
admin the merchant is already in.

### 4.2 The third-party market is small

Shopify does not publish install counts; review counts are the only public scale proxy.

| App | Rating / reviews | Launched | Pricing |
|---|---|---|---|
| **Predis** (AI social — category leader) | 4.6★ / **130** | Mar 2022 | $32–$79/mo |
| **SellerPic** | 4.4★ / 80 | Dec 2024 | Free–$99/mo |
| **Photoroom** | 4.7★ / 26 | Mar 2023 | **Free** |
| **CreatorKit** | **1.6★ / 4** | Sep 2021 | Free–$99/mo |
| **Vidify** | 4.6★ / 9 | Mar 2022 | Free–$60/mo |

For contrast, first-party channel apps in the same category: **TikTok 15,424 reviews**, Facebook &
Instagram 5,171, Google & YouTube 5,091.

The leader in AI social on Shopify accumulated **130 reviews in four years.** The long tail is
~50 near-identical $20–$99/mo credit-metered apps.

### 4.3 The real money was made off-platform

* **Creatify** — crossed **$9M ARR** ~18 months after launch; **$15.5M Series A**
* **AdCreative.ai** — acquired by Appier for **$38.7M**, Feb 2025

Neither needed an App Store listing. Where value has accrued in e-commerce AI creative, it is in
**paid-social ad creative at volume**, sold directly.

---

## 5. Why the App Store is closed to us — four layers

Each is independently sufficient.

**Layer 1 — Policy.**

> **1.1.14** — *"Don't connect merchants to external agencies and developers. Apps that connect
> merchants to agencies and freelancers cannot be distributed through the Shopify App Store."*

We are a tool an agency uses on a client's behalf. That is the prohibited sentence.

**Layer 2 — Architecture.** Our organizing principle is *one agency, many client brands*. Shopify's
is *one shop*. Twelve connected clients would appear to Shopify as twelve unrelated installs by
twelve unrelated merchants. **The agency — our actual customer — has no representation in the
platform's model.**

**Layer 3 — Economics.** Listed apps must bill per store on each merchant's invoice. Our ₹14,199/mo
Studio plan covering four brand workspaces would become four charges to four different merchants —
**billing our customers' customers.** The agency, who chooses and pays us, ceases to be a paying
party. That is a different business, not a pricing tweak.

**Layer 4 — Product/market.** Even ignoring the first three: we would enter a commodity band against
a free first-party incumbent, with a professional multi-brand canvas aimed at a buyer who wants one
click — and our differentiator (per-client isolation) is worth **nothing** to a merchant with one
brand.

### 5.1 The structural reason behind the policy

Shopify runs two separate houses. The **App Store** is software merchants *buy*. The **Partner
program** is for those who *build and service* stores — agencies, freelancers, developers. They are
kept apart so the App Store does not become a marketplace for human services.

An agency tool belongs, conceptually, to the Partner side — and **the Partner side has no app
distribution and no billing rails, by design.** We are not falling through a gap; we are standing in
the deliberate space between two separated systems.

---

## 6. What does work — Shopify as a data source

### 6.1 Three holes in our own product that product data fills

| Today | With a store connection |
|---|---|
| `product_links[]` is parsed from every reel script, stored, rendered — and **completely inert**. Nothing resolves it. | Resolves to title, description, price, and official product photography |
| KB "products/services" comes from a **web scrape** (`src/prompts/website-research.ts`) | Authoritative, structured, current |
| Brand Kit `product` assets (`client_brand_assets`) are **uploaded by hand** | Populate themselves |

Plus one the Post PRD already flags: *"An offer's terms, price and claims live in the caption."*
**Price is live commerce data that goes stale.** A caption publishing ₹499 against a store now
charging ₹599 is exactly the error class a product with compliance warnings should catch.

### 6.2 What is readable and writable

**Read.** The Admin GraphQL `products` query returns title, description, vendor, product type, tags,
categories, variants (pricing + inventory), media, SEO metadata, publication status. The
`read_products` scope covers products, variants, collections and selling plans in one.

**None of these scopes are protected** — no Shopify approval required. **Protected customer data
does not apply** to a product-only integration, since we never touch PII.

**Write.** `fileCreate` uploads generated assets to the store's Files, which can then be attached to
products or collections. Limits: images **20 MB / 4472×4472 px** (2048×2048 recommended), video 1 GB
/ 10 min, **250 media per product**, 250 files per mutation, async processing.

**Rate limits.** Calculated-cost leaky bucket: 100 points/sec Standard, 200 Advanced, 1000 Plus,
2000 Enterprise.

### 6.3 A brand object exists — on the wrong API

Shopify's **Storefront API** exposes `Brand` with `colors`, `logo`, `squareLogo`, `coverImage`,
`slogan` and `shortDescription`. That is a genuine Brand-KB seed.

**The Admin API `Shop` object has no `brand` field.** How an installed app reaches the Storefront
`Brand` is **unverified** — this is the highest-value, lowest-confidence item in this research and
should be prototyped before anything is designed around it.

### 6.4 Marketing surfaces are a dead end

Marketing activity app extensions are **deprecated for new creation**. What remains for apps: web
pixels, customer segments, importing campaign performance *into* Shopify, marketing automation
actions, SEO tags. **No social publishing. No ad creative. No creative asset surface.** Shopify
Audiences is first-party and Plus-gated; Collabs has no public developer API.

**Shopify is a product-data source, not a publishing destination.** Our Instagram/Facebook/LinkedIn
publishing work is unaffected either way.

---

## 7. Recommended path

### 7.1 Start cheaper than Shopify — a generic product-URL resolver

`product_links[]` are just URLs, and we already ship a pattern for turning external URLs into
structured brand context (`website-research.ts`). **A generic product-page resolver works on any
store, needs no credentials, and has zero onboarding friction.** It unblocks an inert field today
and is platform-agnostic.

### 7.2 Then: a merchant-created custom app, one token per client store

The client's store owner opens **Settings → Apps → Develop apps**, ticks `read_products` (plus
`write_files` / `write_products` if we push assets back), installs, and reveals an Admin API token
**once**. They paste it into the CreativeOS brand workspace.

**Cost:** a token field, a GraphQL client, a product/media sync with cursor pagination. **No OAuth,
no App Bridge, no embedded UI, no incognito-cookie work, no billing integration, no GDPR webhooks.
Zero review. Zero revenue share.** Days, not weeks.

**Trade-offs, stated honestly:**

* No App Store discovery — this is an integration, not an acquisition channel
* The token is revealed once and dies on uninstall → secure storage and a re-key path are ours
* **A human handoff per client**, not a self-serve button. Only the store owner (or suitably
  permissioned staff) can create it.

That last item is the only real risk in the plan, and it is behavioural rather than technical:
**will an agency actually get a client's store owner to do this?** Worth testing with two clients
before building much. No further research can answer it — only a conversation can.

### 7.3 Prototype first, before designing

1. **Whether an installed app can actually reach `shop { brand { logo colors slogan
   shortDescription } }`.** Highest value, weakest evidence.
2. **A full product + media pull on a real store** against the 100 pts/sec bucket, to size the sync.

---

## 8. Comparable platforms

| Platform | Shape for an agency tool |
|---|---|
| **WooCommerce** | **Technically cleanest.** Merchant generates a Consumer Key/Secret in WP Admin and hands it over. No app, no review, no revenue share. Fragmented across self-hosted installs; data quality varies. |
| **BigCommerce** | API-first with native multi-storefront support; store-level tokens are straightforward. Much smaller D2C installed base. |
| **Amazon SP-API** | Heavy onboarding, seller-centric model, and the product creative is Amazon's rather than the brand's. Poor fit. |
| **Meta Commerce/Catalog** | **The best agency permission model of the four.** An agency Business Manager is added as a *partner* to a client's catalog with task-scoped access, and a **system user** token calls against all partnered assets — one agency identity, many client catalogs. Exactly the shape Shopify lacks. Data is second-hand (usually fed *from* Shopify) and thinner. |

Meta's model is worth noting because we will meet it anyway during Meta App Review for publishing —
and it is the permission architecture an agency tool actually wants.

---

## 9. Risks

| Risk | Note |
|---|---|
| **Scope drift toward merchant-side.** Once a connector exists, *"we already have the integration — why not sell to merchants?"* becomes an easy thing to say. | The moat identified in the competitive research — per-client tenancy, per-client cost, multi-brand isolation — is worth **nothing** to a single merchant. Merchant-side does not extend the business; it discards the differentiator and enters a commodity band against free. Requirement 1.1.14 happens to protect us from a mistake we might otherwise talk ourselves into. |
| **The free floor keeps rising.** Shopify Magic went from product descriptions to image editing to social post generation inside a year, free on every plan. | Each Editions release commoditises another layer of basic creative work; anything in our product near that band loses value from below. Defence: what free tooling can't do — per-client brand context, multi-client isolation, client approval, the full reel pipeline. Watch each Editions release to know where the floor is. |
| **The human handoff does not happen.** | Test with two clients before investing. Behavioural risk, not technical. |
| **`shop.brand` turns out unreachable.** | Prototype day one; the product-catalog value stands without it. |
| **Token lifecycle.** Revealed once, revoked on uninstall. | Secure storage, clear re-key path, and a visible "connection health" state — the same pattern the Post PRD already requires for social connections. |

---

## 10. Forward note

The V2 spec defers the **"past performance"** market-signal type because it requires publish-side
data we do not yet produce. **Shopify has sales data.** *"This product is moving"* is a market signal
with an authoritative source — a genuine bridge between this integration and the signals feature,
worth revisiting when V2's second sprint comes around. *(Recorded as an observation only; the V2
spec is frozen and unchanged.)*

---

## 11. Sources

**Shopify — policy & commercial**
* [App Store requirements (1.1.14, 1.2.1)](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements)
* [Revenue share](https://shopify.dev/docs/apps/launch/distribution/revenue-share) · [Billing](https://shopify.dev/docs/apps/launch/billing) · [App charges on a merchant's bill](https://help.shopify.com/en/manual/your-account/manage-billing/billing-charges/types-of-charges/third-party-charges/app-charges)
* [Distribution types](https://shopify.dev/docs/apps/launch/distribution) · [Selecting a distribution method](https://shopify.dev/docs/apps/launch/distribution/select-distribution-method) · [App review process](https://shopify.dev/docs/apps/launch/app-store-review/review-process)

**Shopify — technical**
* [Admin GraphQL `products`](https://shopify.dev/docs/api/admin-graphql/latest/queries/products) · [Access scopes](https://shopify.dev/docs/api/usage/access-scopes) · [Rate limits](https://shopify.dev/docs/api/usage/rate-limits)
* [`fileCreate`](https://shopify.dev/docs/api/admin-graphql/latest/mutations/fileCreate) · [Product media](https://shopify.dev/docs/apps/build/online-store/product-media) · [Metafields](https://shopify.dev/docs/apps/build/custom-data/metafields)
* [Storefront `Brand` object](https://shopify.dev/docs/api/storefront/latest/objects/Brand) · [Admin `Shop` object](https://shopify.dev/docs/api/admin-graphql/latest/objects/Shop)
* [Marketing activities (deprecated)](https://shopify.dev/docs/apps/build/marketing-analytics/marketing-activities/manage) · [Marketing surfaces](https://shopify.dev/docs/apps/build/marketing)
* [Generating admin access tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/generate-app-access-tokens-admin) · [Protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data)
* [Collaborator accounts](https://shopify.dev/docs/storefronts/themes/tools/collaborator-accounts) · [Working on client stores](https://help.shopify.com/en/partners/manage-clients-stores/working-on-client-stores)

**Shopify — first-party AI**
* [Shopify Magic](https://help.shopify.com/en/manual/shopify-admin/productivity-tools/shopify-magic) · [Editions Winter '26](https://www.shopify.com/editions/winter2026)

**Market**
* [Predis](https://apps.shopify.com/predisai) · [SellerPic](https://apps.shopify.com/sellerpic) · [Photoroom](https://apps.shopify.com/photoroom-production) · [CreatorKit](https://apps.shopify.com/creatorkit-1) · [Vidify](https://apps.shopify.com/vidify) · [Ads category](https://apps.shopify.com/categories/marketing-and-conversion-advertising-ads/all)
* [Creatify $9M ARR / Series A](https://finance.yahoo.com/news/creatify-crosses-9m-arr-raises-150000659.html) · [AdCreative.ai acquisition](https://www.crunchbase.com/organization/adcreative-ai)

**Comparables**
* [WooCommerce REST API](https://developer.woocommerce.com/docs/apis/rest-api/) · [BigCommerce multi-storefront](https://developer.bigcommerce.com/api-docs/multi-storefront/api-guide) · [Amazon SP-API](https://developer-docs.amazon.com/sp-api/) · [Meta catalog business asset management](https://developers.facebook.com/docs/marketing-api/business-asset-management/guides/catalog/)

---

## Appendix — confidence

**Confirmed** (read on a primary source): requirements 1.1.14 and 1.2.1; revenue-share terms and the
2.9% fee; charges landing on the merchant invoice; Shopify Magic free on all plans and the Winter '26
feature list; the three distribution types and the Plus-org limit on multi-store custom installs;
`read_products` coverage and its unprotected status; `fileCreate` and product-media limits; rate
limits; Storefront `Brand` fields and their absence from Admin `Shop`; marketing-activity
deprecation; App Store review-count figures; Creatify and AdCreative.ai outcomes; collaborator
accounts being human-scoped.

**Uncertain / to verify before relying on it:** how an installed app authenticates to reach
Storefront `Brand` (staff have suggested tokenless access; unverified); App Store review timeline (no
published SLA — plan 2–6 weeks); whether Winter '26 social post generation *publishes* or only
drafts; exact behaviour of an active subscription on uninstall; whether usage charges still require a
merchant-approved cap; image size limit stated as 20 MB on shopify.dev with only a dimension cap in
the Help Center. Install counts are not published by Shopify — all scale inference rests on review
counts.
