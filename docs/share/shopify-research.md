# Shopify: a data source, not a channel

> *Review copy for comments — the live version is at https://claude.ai/code/artifact/5e46e0cb-e26b-4eeb-a195-f1034bd009b9*

**Date:** 16 August 2026 · **Status:** Research complete, no decision taken · **Owner:** Cyril Varghese

We looked at Shopify as an integration, a distribution channel, and a revenue stream.

## The verdict

**Closed to us as a channel.** Not by judgement — by Shopify's own written policy. Their App Store
rules bar apps that connect merchants to agencies, and every unit in their model is the shop; the
agency, our actual customer, has no representation in it.

**Worth doing as a data source.** A merchant-created custom app — one API token per client store,
pasted into that client's brand workspace. Days of engineering, zero review time, zero revenue
share, and our agency pricing survives untouched.

---

## 1. How the app model works

**How it works.** A Shopify app is not a plugin — it's an external web service that Shopify grants
scoped, revocable API access to, one store at a time. Our code never runs inside Shopify. And the
shop is the unit of everything: install, token, scopes, billing, uninstall — all per shop. There is
no API credential that spans stores, not for partners, not for agencies. (Collaborator accounts
look like the exception, but they're human admin access — a collaborator can log into a client's
admin; they cannot make API calls across a portfolio.)

**What this means for us.** The agency — our customer — has no box in Shopify's model. Twelve
connected clients would be twelve unrelated installs by twelve unrelated merchants. Every
constraint in this memo is that one fact, applied.

*Detail: the three distribution types* — **Public** (many stores, App Store listing, review
required, Shopify billing mandatory), **Custom** (one store, or several within one Plus
organization — that's one merchant's own store family, not an agency's client portfolio), and
**Merchant-created** (the single store that created it; no review, no Shopify billing). Going
public is real engineering: OAuth, session tokens, an embedded App Bridge experience that works
with no third-party cookies, GraphQL-only, plus a review queue with no published SLA — reports
range from 5–10 business days to 30+.

## 2. How Shopify apps charge customers

**How it works.** If an app is listed in the App Store, Shopify does the billing — the charge lands
on each store's monthly Shopify bill, and billing the customer yourself is against the rules. If an
app is *not* listed, Shopify does no billing at all — you charge your customer directly, however
you like. Shopify's cut on listed apps is small: 2.9% processing, nothing more until $1M in
revenue, 15% after that.

**What this means for us.** Our customer is the agency — and Shopify can only bill stores. A listed
app would split one agency subscription into per-store charges landing on our customers' customers'
bills. So the fee was never the problem — 2.9% is cheaper than Stripe — the shape is. Staying
unlisted keeps our pricing exactly as it is.

*Detail.* Listed apps can charge recurring (free/monthly/annual), one-time, or by usage. Revenue
share is computed on gross sales, refunds not deducted, aggregated across associated developer
accounts. AI apps on the store almost never bill by usage — they sell tiered subscriptions bundling
credits (SellerPic $29–99, Predis $32–79), because generation has real per-unit cost and merchants
want a predictable bill. Our own pricing is already that shape — it's just billed to the agency,
which Shopify's rails can't do.

## 3. The merchant-facing market is small and shrinking

**What we found.**

**The floor — Shopify gives the category away.** Shopify Magic is free on every plan, and the
Winter '26 Edition pushed it well into creative territory: image editing that can "change image
backgrounds, add or remove elements, and expand canvas size", a mobile editor turning phone photos
into product shots, social post generation, and shoppable videos. Background swaps, lifestyle
stills and basic social copy are now commodity give-aways inside the admin the merchant is already
in. Anything sold to a merchant in that band competes with free.

The third-party market (review counts are the only public scale proxy — Shopify doesn't publish
installs):

| App | Rating / reviews | Launched | Pricing |
|---|---|---|---|
| Predis — category leader, AI social | 4.6★ / 130 | Mar 2022 | $32–79/mo |
| SellerPic | 4.4★ / 80 | Dec 2024 | Free–$99/mo |
| Photoroom | 4.7★ / 26 | Mar 2023 | Free |
| Vidify | 4.6★ / 9 | Mar 2022 | Free–$60/mo |
| CreatorKit | 1.6★ / 4 | Sep 2021 | Free–$99/mo |

For contrast, the first-party TikTok channel app has 15,424 reviews. The leader in AI social
accumulated 130 reviews in four years. Meanwhile the real money in e-commerce AI creative was made
entirely off-platform: Creatify crossed $9M ARR about eighteen months after launch; AdCreative.ai
was acquired for $38.7M. Neither needed an App Store listing; both sell paid-social ad creative at
volume.

**What this means for us.** There is no merchant-side prize worth chasing. The buyers with money
buy ad-creative volume, off-platform — and everything else in this space competes with free, inside
the admin the merchant already lives in. Selling CreativeOS to merchants should stay off the table.

## 4. Why the App Store is closed to us

**How it works.** Shopify's requirement 1.1.14, verbatim: *"Don't connect merchants to external
agencies and developers. Apps that connect merchants to agencies and freelancers cannot be
distributed through the Shopify App Store."* We are a tool an agency uses on a client's behalf —
that is the prohibited sentence.

**What this means for us — four ways it's closed, each enough on its own:**

- **Policy** — The rules bar us by name: agency-connecting apps can't be listed, and all billing
  must run through Shopify (1.1.14, 1.2.1).
- **Architecture** — The agency doesn't exist in Shopify's model: twelve clients would be twelve
  unrelated installs by twelve unrelated merchants.
- **Economics** — A listing would bill our customers' customers, per store, on each merchant's
  invoice; the agency stops being a paying party.
- **Market** — We'd sell against free, to the wrong buyer: per-client isolation is worth nothing
  to a merchant with one brand.

**Why the rule exists.** Shopify runs two separate systems. The App Store sells software to
merchants. The Partner program is where agencies live — and it has no app distribution and no
billing, by design. An agency tool has no door into the Store because none was built.

## 5. What does work — Shopify as a data source

**How it works.** One API token per client store lets us read their products — names, descriptions,
prices, official photography — and even push generated assets back. No Shopify approval is needed
for any of it.

**What this means for us.** A store connection fills three holes that already exist in our own
product, each currently patched by hand:

| Today | With a store connection |
|---|---|
| Product links are parsed from every reel script, stored, rendered — and completely inert. Nothing resolves them. | They resolve to title, description, price, and official product photography |
| The brand KB's "products / services" section comes from a web scrape | Authoritative, structured, current |
| Brand Kit product images are uploaded by hand | They populate themselves |

Plus one the Post PRD already flags: an offer's price lives in the caption, and price is live
commerce data that goes stale. A caption publishing ₹499 against a store now charging ₹599 is
exactly the error class a product with compliance warnings should catch.

*Detail — readable and writable.* The Admin GraphQL `products` query returns title, description,
vendor, type, tags, categories, variants with pricing, media and SEO metadata. The `read_products`
scope covers products, variants and collections in one — and none of these scopes are protected,
so no Shopify approval is required; a product-only integration never touches personal data. Writing
back works too: `fileCreate` uploads generated assets to the store's Files (20 MB / 4472×4472 px
per image, 250 media per product). Rate limit: 100 points/second on the standard plan.

*Detail — a brand object exists, on the wrong API.* Shopify's Storefront API exposes a `Brand`
object with colours, logo, slogan and short description — a genuine Brand-KB seed. The Admin API
has no brand field, and how an installed app reaches the Storefront version is unverified — the
highest-value, lowest-confidence item in this research. Prototype it first.

*Detail — no marketing surface.* Shopify has no social publishing, ad creative, or creative asset
surface for third-party apps. It's a product-data source, not a publishing destination — our
Instagram/Facebook/LinkedIn work is unaffected either way.

## 6. Recommended path

**Start cheaper than Shopify.** The product links in our scripts are just URLs, and we already
ship a pattern for turning external URLs into structured brand context. A generic product-page
resolver works on any store, needs no credentials, and has zero onboarding friction.

**How it works — a merchant-created custom app.** The client's store owner opens Settings → Apps →
Develop apps, ticks `read_products`, installs, and reveals an Admin API token once. They paste it
into the CreativeOS brand workspace.

**What this means for us.** The cost is a token field, a GraphQL client, and a product sync. No
OAuth, no embedded UI, no billing integration, no review, no revenue share. Days, not weeks. This
is the normal shape of every B2B SaaS integration — asking a customer for an API key. The App
Store is the anomaly, not the baseline.

**Trade-offs, stated honestly:** no App Store discovery (this is an integration, not an
acquisition channel); the token is revealed once and dies on uninstall, so secure storage and a
re-key path are ours; and onboarding is a human handoff per client, not a self-serve button.

**The only real risk.** We don't yet know whether agencies can get a client's store owner to do
this handoff. It's a behavioural risk, not a technical one. Test with two clients before building
much — a conversation settles it, more research doesn't.

**Prototype before designing:** (1) whether an installed app can actually reach the Storefront
brand object — highest value, weakest evidence; (2) a full product-and-media pull on a real store,
to size the sync.

## 7. Comparable platforms

**How the others work:**

| Platform | Shape for an agency tool |
|---|---|
| WooCommerce | Technically cleanest: the merchant generates a key/secret and hands it over. No app, no review, no revenue share. Fragmented; data quality varies. |
| BigCommerce | API-first, straightforward store-level tokens. Much smaller D2C base. |
| Amazon SP-API | Heavy onboarding, seller-centric, and the product creative is Amazon's. Poor fit. |
| Meta Commerce / Catalog | The best agency permission model of the four: an agency Business Manager is added as a partner to a client's catalog, and one system-user token calls against every partnered asset — one agency identity, many client catalogs. |

**What this means for us.** WooCommerce proves the token handoff is a normal ask. And Meta's
partner model is the permission architecture an agency tool actually wants — which we'll meet
anyway during Meta App Review for publishing.

## 8. Risks

- **Primary — scope drift toward merchant-side.** A connector will make selling to merchants feel
  adjacent. It isn't. Our moat — per-client tenancy, per-client cost lines, multi-brand isolation —
  is worth nothing to a single merchant with one brand. Merchant-side discards the differentiator
  and competes with free. Rule 1.1.14 blocks the mistake anyway.
- **The free floor keeps rising.** Shopify Magic went from product descriptions to image editing to
  social post generation inside a year, free on every plan — each release commoditises another
  layer of basic creative work. Our defence is what free tooling can't do: per-client brand
  context, multi-client isolation, client approval, the full reel pipeline. Watch each Editions
  release to know where the floor is.
- **The human handoff doesn't happen.** Test with two clients before investing.
- **The Storefront brand object turns out unreachable.** Prototype day one; the product-catalog
  value stands without it.
- **Token lifecycle.** Revealed once, revoked on uninstall — so secure storage, a clear re-key
  path, and a visible connection-health state, the same pattern the Post PRD already requires for
  social connections.

## Appendix — confidence

**Confirmed on primary sources:** requirements 1.1.14 and 1.2.1; the revenue-share terms and 2.9%
fee; charges landing on the merchant invoice; Shopify Magic free on all plans and the Winter '26
feature list; the three distribution types and the Plus-org limit; `read_products` coverage and
its unprotected status; file and media limits; the Storefront `Brand` fields and their absence
from the Admin API; App Store review counts; the Creatify and AdCreative.ai outcomes; collaborator
accounts being human-scoped.

**Uncertain — verify before relying on it:** how an installed app authenticates to reach the
Storefront brand object; App Store review timeline (no published SLA — plan 2–6 weeks); behaviour
of an active subscription on uninstall; whether Winter '26 social post generation publishes or
only drafts. Install counts are not published — all scale inference rests on review counts.

*Full source list with URLs: `docs/2026-08-16-shopify-integration-research.md` in the repo, §11.*
