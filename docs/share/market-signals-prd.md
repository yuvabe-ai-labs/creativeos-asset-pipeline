# PRD — Market Signals

> *Review copy for comments — the live version is at https://claude.ai/code/artifact/4d7dfa84-0ece-4cc8-a0df-d474062d453c*

**Date:** 2026-08-17
**Status:** Draft, pending review. Feature shape agreed with the owner 2026-08-17; MR-team
discovery pending (§8).
**Owner:** Cyril Varghese
**Audience:** Product, design, engineering, and the MR team. This is the *what* and *why* — the
same split the Post PRD uses. The *how* (final schema, resolver, surfaces) becomes a design spec
once the §8 discovery session and the §12 questions close; the shapes in §4–§5 are **proposals**
for that spec, not decisions.
**Decisions:** will land in the ADR log as **D149+** once settled.
**Parent:** the CreativeOS V2 PRD §6.1–6.2 — this PRD details that scope; the V2 PRD is
unchanged.

---

## 1. The problem

When someone starts a reel or post for a client, the first questions are market questions — what's
trending in this category, what formats are working, what competitors are running, what moment is
coming. Today the answers live in people's heads, WhatsApp forwards and saved Instagram folders.

Three costs:

1. **Generation is market-deaf.** Brand context is injected everywhere; market context nowhere.
2. **Ideation happens off-product**, and the examples that drove a creative decision are never kept.
3. **Nothing is shared.** One strategist's category knowledge helps only the work they touch.

We also already have a **Market Research team that does this research for clients as a separate
service** — and its output lands in deliverables, not in the tool where generation happens.

## 2. The goal

Every generation starts informed by the market, and ideation happens with market material in view.
Two tests that it's real: switching signals on **measurably changes what gets generated** —
measured on real client work — and the MR team and designers **actually use the shelf** during
real work.

## 3. Who does what

| Who | Role |
|---|---|
| **MR team** (exists today, Yuvabe-side) | Owns signals: finds, writes, maintains, retires. Curates all three scopes. Modeled as a simple role flag for now (like `senior`), not new RBAC. |
| **Designers / seniors** | Consume signals — apply them to generations, browse them while ideating. Never required to. |
| **Tool integrations / agents** (later) | Propose signals — integrations first (they remove the data entry), agents after. **Never publish** — everything goes live through MR review. |

## 4. What a signal is

**Observation + direction.** What's happening, and what this brand (or this category, or everyone)
should do about it. A signal without a direction is not accepted — the direction is what a
generation can actually use. The LLM helps draft the direction; a person always confirms.

### The record

```
signals
  id            uuid pk
  scope         'global' | 'category' | 'client'
  client_id     uuid null → clients     (set only when scope = 'client')
  category      text null               (set only when scope = 'category')
  kind          'trending_format' | 'competitor_pattern' | 'seasonal_moment'
                | 'audience_shift' | 'past_performance'   (last one: phase 2, needs publish data)
  status        'proposed' | 'live' | 'archived'
  source        text default 'manual'   (later: tool/agent name)
  observation   text
  direction     text
  valid_from    date
  valid_until   date
  created_by / created_at / updated_at

signal_references
  id, signal_id fk, url, source_url, thumbnail_path, position
```

Notes, each earning its place:

* **`status` and `source` exist from day one** even though phase 1 only writes `live` + `manual`.
  They are the seams the manual → automated shift slides along (§9) — adding them later is a
  migration; adding them now is two columns.
* **Expiry is derived on read** from `valid_until` (the house D9 pattern), not a status value —
  so nothing has to run a cron to expire a signal. `archived` is a human act; expired is a date.
  Expired signals stop resolving by default and are shown as expired, never silently dropped.
* **References save a thumbnail at add time.** The moodboard URL-only lesson (F6 caveat): a link
  that rots later is unrecoverable. Small write-path cost now.
* **How a client maps to a category** is open — cheapest is a nullable `clients.category` the MR
  team sets; the KB's `industry` field could suggest it. Decide during build, not here.

## 5. Scopes and resolution

Three levels, **flowing downward only** — the shape D45 already approved:

* **global** — applies to every client
* **category** — applies to clients in that category ("ayurvedic skincare")
* **client** — this brand only; never visible anywhere else

One resolver, used by every consumer:

```
resolveSignals(clientId) →
  live signals, in validity window, where
    scope = 'global'
    OR (scope = 'category' AND category = client's category)
    OR (scope = 'client'   AND client_id = clientId)
```

However a signal reaches a generation, this one function resolves it — same signal, same
context, everywhere.

## 6. Mode A — informing generation

**The Script node is the primary consumer.** A signal shapes what the reel is about and what kinds
of shots get written — upstream, where creative decisions happen. **The Prompt node joins it in the
first cut** — scripts are where signals shape the idea, prompts are where they shape the image,
and testing on real work covers both layers. Shot Composer and Motion Prompt follow (sprint 3).

How it behaves — the *what*; the actual surface (controls, placement, any on-canvas presence) is
decided in the design spec, after this PRD is discussed:

* **Off by default.** A signal influences a generation only when someone deliberately applies it
  to that piece of work.
* **Visible before Generate.** What's being applied is shown with the prompt, before the model
  runs.
* **Recorded after.** Every generation records the signals it used, including the direction text
  itself — signals are edited in place, so the record must survive the edit.

## 7. Mode B — material for thinking

Signals are browsable, not just injectable.

* **Sprint 1 (minimal):** the curation page itself is the browse surface — every signal shows its
  references as thumbnails. Ideation material exists from day one where it's maintained.
* **Later (shape to be decided):** browsing and using signals from inside the canvas while
  working. How that surfaces — and whether a signal ever appears as an element on the canvas
  itself — is an implementation question for the design spec, after this PRD is discussed.

## 8. Curation and the research process — with the real MR team

The MR team already does this research as a client service. Phase 1 changes **where findings land**,
not how research happens:

1. **Research — unchanged**, in their existing listening/analytics tools.
2. **Synthesis → entry — the new step.** A finding that used to become a slide also becomes a
   signal: scope, kind, observation, reference links; the LLM drafts the direction; MR edits and
   saves. Target cost: **one–two minutes per signal**, or it will lose to the slide.
3. **Upkeep.** Validity set at entry per kind; an *expiring-soon* view on the curation page so
   renewal rides their existing review rhythm.
4. **The bridge to test first:** if their research lands in a structured deliverable, **paste the
   report and let the LLM propose signals from it** — each accepted/edited/rejected by MR. That is
   the F8 review pattern arriving early, fed by their own document instead of an API. It may beat
   form-entry as the primary input path; discovery decides.

### Discovery — scheduled work, not a footnote (sprint 1, before the curation surface)

A working session with the MR team, before the curation surface is built (it shapes days 3–6):

1. **What does their output look like today?** Deck / report / doc — decides whether report-parse
   (point 4) is the primary entry path.
2. **Cadence and unit of work?** Weekly per category, monthly per client, per-campaign — sets
   validity defaults per kind and how the curation page organizes.
3. **Which tools do they actually use?** Names — so phase-2 connectors are scoped against reality.

Output: one page appended to this spec; the curation surface is built against it.

## 9. The load shift — three steps, MR always the gate

The constant is the **MR gate**; what changes across the steps is who finds and who types.

| Step | How signals arrive | Who approves | When |
|---|---|---|---|
| 1 | **Manual.** MR researches in their external tools and enters signals by hand — pure data entry — and the generation engine consumes them. | MR (implicit — they wrote it) | Sprint 1 |
| 2 | **Tool integrations.** The listening/analytics tools connect into the platform and their findings arrive as *proposed* signals — the data entry disappears. | **MR, via the review queue (F8)** | Phase 2, tool-by-tool |
| 3 | **Agentic research.** Agents do the research themselves and propose signals — human in the loop on every one. | MR, via F8 | After step 2 |

The **review queue (F8)** is built in sprint 3, *ahead of* step 2, so intake has its gate ready
before anything automatic arrives. It's a list of `proposed` signals with approve / edit / reject —
and the report-parse bridge (§8.4) uses the identical surface, so the queue earns its keep even
while entry is still manual.

## 10. Measurement

* **Signals on/off on real client work** — the same script parsed, the same shot prompted, with
  signals off and then on: quality labels
  *and* output variety. A signal that changes nothing means the feature is a dashboard — the PRD's
  kill signal.
* **Homogenization guard:** signals must not become the new monotony ("everything chases the same
  trend"). Variety is measured *with signals on*, not just quality.
* **Usage:** signals added per week, and applied to real generations. Sprint 2 is the natural
  habit test — the MR team curates while the build works elsewhere; an empty shelf by sprint 3 is
  the biggest risk showing up early, while it's cheap to see.

## 11. Sprint mapping

| Sprint | Signals work |
|---|---|
| **1 — prove signals work** | In build order: (1) agree the measurement — real work, on/off protocol, labels; (2) **MR discovery** (§8); (3) the record + resolver (F1); (4) the curation surface + MR flag + LLM assist, shaped by discovery (F2); (5) Script + Prompt integration (F3); (6) the on/off measurement on real scripts (F7). |
| **2 — posting flow** | No build. **MR team curates for real** — the habit test (§10). |
| **3 — signals in daily work** | Signals reaching the rest of the chain (Shot Composer, Motion Prompt); in-canvas browsing and use, in whatever shape the design spec lands on; the **review queue (F8)** — built ahead of step-2 intake (§9). |
| **Phase 2** | **Step 2: tool integrations** feeding the queue, tool-by-tool; then **step 3: agentic research** with MR approval. Category/global curation UI beyond basics; past-performance signals (publish/Shopify data). |

Drop order inside sprint 1: LLM assist → curation polish. **Never:** record + resolver,
Script/Prompt integration, measurement, or the discovery session.

## 12. Open questions

0. **Does this PRD fit the two-week sprint? Probably not all of it — decide at sprint planning,
   not mid-sprint.** Recommendation: treat sprint 1 as **the foundation plus one usable
   end-to-end slice** — the record + resolver, a plain entry form the MR team can genuinely use,
   Script + Prompt integration, usage recorded, and the on/off measurement. That slice is complete
   in itself: MR enters a signal, a designer applies it, the output changes, and we can prove it.
   The AI direction-assist and curation polish are the first drops (directions get written by hand
   for a fortnight). In-canvas browsing, the rest of the chain and the review queue were never
   sprint-1 scope — they are sprint 3 and phase 2. What must survive any cut: the record, the
   Script + Prompt integration, and the measurement — an unmeasured signals feature is the outcome the V2 plan
   calls worthless.
1. The three discovery questions (§8) — answered by the MR session, early in sprint 1.
2. **Validity defaults per kind** — proposed starting points, MR corrects: seasonal moment = its
   season; trending format = 4 weeks; competitor pattern = 8 weeks; audience shift = 6 months.
3. **Client → category mapping** — `clients.category` set by MR vs derived from KB `industry`.

## Not doing (this version)

Scraping or auto-ingest before F8 exists · signals that gate or block anything · per-agency MR
seats / real RBAC · category-global curation UI beyond the basics · past-performance signals before
publish data exists.
