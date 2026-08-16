# PRD — CreativeOS V2

**Date:** 2026-08-16
**Status:** Draft. Scope set with the user 2026-08-16. Pending review.
**Shape:** Scoped as a two-week sprint. **Six themes do not fit in two weeks** — §5.1 splits them
into two sprints (with the agentic repair cell leading a third), for a reason that is calendar
rather than capacity. Read that section first.
**Owner:** Cyril Varghese
**Audience:** Product, design, engineering. This is the *what* and *why*. The *how* goes into
design specs under `docs/superpowers/specs/`; decisions land in the ADR log
(`docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7) from **D149** onward.

> **Relationship to other docs.** The MVP PRD (`CreativeOS MVP PRD.md`, now at v3) remains the
> standing description of the product. This PRD covers **one version's scope** and folds back into
> that changelog when it ships — the pattern used for `CreativeOS Multi-Tenancy Pilot PRD.md` and
> `superpowers/specs/2026-08-03-post-prd.md`. **Approval and publishing are already specified** in
> the Post PRD §6.8–§6.10 and its two design specs; this document schedules them and does not
> restate them.

---

## 1. Summary

V1 built a canvas that produces reel and post assets. It produces them **from a standing start every
time** — the same brand context regardless of season or market, no record of what worked, a human
driving every step — and then it **stops before the client ever sees the work.**

V2 closes both gaps. Its thesis is the sentence already on the product's own landing page:

> **"Your next D2C creative should not start from zero."**

| | What | Why it is in V2 |
|---|---|---|
| **1. Market signals** | A curated, client-level set of what is changing in the market, usable as generation context | The headline claim on the pricing page today; nothing behind it yet |
| **2. Post + reel validation** | Real design partners on real client work, measured against the wedge | Both surfaces are built and unproven; the Post PRD names the kill signal |
| **3. Post integration + publish** | Client approval links, then publishing to live accounts | Two-thirds of the Post spec is unbuilt; it is also the only differentiator no competitor has |
| **4. Evals** | The frozen harness restored, error analysis finished, a variance guard | Items 1 and 5 change generation inputs — this is what stops quality moving invisibly |
| **5. Agentic** | The copilot made reachable; the repair cell once evals can judge it | Finished code sitting behind a layout bug |
| **6. Asset library** | The Gallery drawer's Assets tab widened from canvas-scoped to **client-wide, searchable** | Sold at every pricing tier; the data is already captured, only the query is missing |

**Still out:** any correction-learning loop, a third asset type, campaign fan-out, the layout-aware
round trip.

---

## 2. Context & problem

| Problem | Impact |
| :---- | :---- |
| **The reel has no ending.** Script → shots → images → clips → *internal archive bundle*. No client ever sees it, nothing is delivered, no approval is captured. | The original wedge produces expensive assets and then files them. Posts get a client; reels get a folder. |
| The Post node is one-third of its own spec — compose ✔, approve ✘, publish ✘. | The wedge cannot be tested end to end, and **Meta App Review cannot even be submitted**, because reviewers need a reachable connect-to-publish flow. |
| The product has no notion of *when* it is. A reel made in June and one made during Diwali get identical context. | Creative is brand-correct and market-deaf — the thing agencies are hired to get right. |
| "Market signals" and "the self-learning agent" are sold on a public, priced page. Neither exists. | A design partner falsifies the second claim by making two reels. |
| The copilot is fully built and commented out of the canvas (YUV-233). | The largest single capability in the product is unreachable by any user. |
| Run-01 found template homogeneity as the dominant failure mode. Step 3 was never done; the harness route was deleted; D23 shipped unmeasured. | The known #1 quality defect is unmeasured, and V2 adds new inputs on top of it. |

**Why evals sit alongside the rest rather than after.** Market signals and an agent both change what
reaches the model. Adding them to a prompt whose dominant defect is *everything looks the same*,
with no way to measure output variety, is how a quality problem becomes invisible.

---

## 3. Users

Designer, senior/owner, and — with item 3 — the **client** as an external approver with no account,
as specified in the Post PRD. V2 adds one role-shaped question rather than a new user: **who curates
signals?** See §10.

---

## 4. The scope rule

**A signal is only worth storing if it changes what gets generated.**

A market-signals feature drifts naturally into a content-marketing dashboard — trend feeds,
competitor galleries, engagement charts — none of which touch a prompt. If a field on a signal cannot
be traced to a difference in a generated asset, it does not ship.

The corollary, from the landing page's own framing: *"from 'this format is trending' to 'here is how
it works for this brand.'"* **The second half is the product.** An observation is an input; the
brand-relevant direction is what a generation can use.

For item 3 the standing rule is the Post PRD's: **anything that only makes the editor better is out.**

---

## 5. Release scope

| Area | **V2** | **Later** |
|---|---|---|
| **Signal capture** | Human-curated, client-level. Five types; past performance deferred until publish data exists. | Agent-researched proposals; external trend/social feeds. |
| **Signal use** | Ambient slices (default) **and** a Signal node for explicit wiring. | Signal-aware shot composition; auto-suggested signals per shot. |
| **Validation** | Post **and reel**, with design partners on real client work. | — |
| **Approval** | Client approval links per Post PRD §6.8, built generically so stills and clips can use them. | Pin-anchored comments; notifications. |
| **Publishing** | Connect + publish flow, and **Meta App Review submitted**. Going live is gated on their clock. | Scheduling, carousels, Stories, analytics. |
| **Evals** | Harness restored, Step 3 completed, Run-02 measured, variance metric added. | Automated clustering; LLM-judge scorers; the correction-learning loop. |
| **Agentic** | Copilot re-enabled. | Repair cell (D58); parallel runs and the canvas matrix (D62). |
| **Asset library** | Assets tab widened to client-wide, filtered by metadata already captured. Moodboard **thumbnail capture switched on**. | Semantic/CLIP search over moodboards and stills; cross-client rollup. |

**Not in V2:** any correction-learning loop, a third asset type, campaign fan-out, the layout-aware
round trip.

### 5.1 Why this is two sprints, not one

**One fact decides it, and it is not team capacity.**

> Publishing cannot go live in two weeks *with any number of engineers*, because **Meta App Review
> takes 2–6 weeks with multiple rounds likely**, and the clock only starts once a reviewer can walk a
> working connect-to-publish flow. Your own Post PRD says it: *"The critical path is a calendar, not
> code. Submit on day one."* Day one has already passed.

That inverts the usual sequencing question. The highest-value thing this sprint can do for
publishing is not *ship* it — it is **reach submission**, because every day not submitted is a day
added to when publishing goes live. Nothing else in V2 has a clock like that.

Publishing also has a hard predecessor: *nothing publishes without a current client approval*
(Post PRD R9.2). So approval must land before the publish flow is demonstrable.

**Sprint 1 — deliver the work to the client, and start the clock**

| | Days | Work |
|---|---|---|
| 1 | 1 | **Restore the eval harness.** `git show aa8afce^:…/eval-bootstrap/route.ts`; `scripts/peek.mjs` is still in the tree. Cheap, and it makes everything after it falsifiable. |
| 2 | 1–2 | **Step 3 open coding** on the Run-01 twenty. Human reading, parallel to the build. |
| 3 | 1–6 | **Client approval links** (Post PRD §6.8) — built against a generic *approvable render*, not a post, so stills and clips reuse it without a rewrite. |
| 4 | 6–9 | **Connect + publish flow** (§6.9) — Meta/LinkedIn connection, publish with read-only caption, publication records, the copy-caption hand-off. |
| 5 | 9–10 | **Meta App Review submitted** — testing instructions, screencast, per-permission use cases. Privacy Policy and Terms already exist on the marketing site. |
| — | 1–10 | **Post + reel validation runs throughout.** Elapsed exposure, not engineering days — it starts day one or it yields nothing by day ten. |

**Sprint 2 — make the work start from something**

| | Days | Work |
|---|---|---|
| 6 | 1–5 | **Signal record + ambient slice resolution + capture in `inputs_used`.** |
| 7 | 5–7 | **Signal node + compiled-prompt surfacing.** |
| 8 | 3–6 | **Asset library** — widen the Assets tab to client-wide with filters; switch on moodboard thumbnail capture. Independent of signals, so it parallelises. |
| 9 | 6–7 | **Copilot re-enable** — resolve the Gallery-drawer collision (YUV-233). |
| 10 | 8–10 | **Run-02 + signals on/off** against the frozen fixture. |

**The repair cell (D58) moves to sprint 3.** It was already conditional on evals producing a
"good enough" signal; adding a sixth theme means it stops being the thing that gets squeezed and
becomes the thing that leads the next sprint. Pre-deciding that is the point of writing it down.

**If it must be one sprint**, the honest version is sprint 1 only — approval, publishing to
submission, validation and the measurement spine. **Market signals and the asset library cannot
share a fortnight with approval and publishing**; attempting all six produces six things at eighty
percent, which is the one outcome with no value at all.

**The cut line inside sprint 1**, in order: Step 3 coding → publish's **LinkedIn** leg (ship Meta
first; LinkedIn is its own stage per the Post PRD). **Never cut:** the harness, approval, and
reaching Meta submission.

**Inside sprint 2:** Signal node → copilot re-enable → asset-library filters (keep the widened
scope, drop the filtering refinement). **Never cut:** the signal record, ambient resolution, and the
signals-on/off measurement.

---

## 6. Requirements

Tagged **[V2]** or **[Later]**. Untagged are V2.

### 6.1 Signals — the record

| | Requirement | |
|---|---|---|
| R1.1 | A **signal** is a client-level record, reusable across every canvas for that client — the ownership shape of the Brand KB and Moodboards. | V2 |
| R1.2 | Five types: **trending format**, **competitor pattern**, **seasonal moment**, **audience shift**, **past performance**. Past performance is **deferred** until publishing produces data — it becomes buildable after item 3 ships, not before. | V2 |
| R1.3 | A signal carries **both an observation and a brand-relevant direction**. A signal without a direction is not usable by a generation and must not be silently accepted. | V2 |
| R1.4 | A signal may carry **reference images or a source URL** for provenance, stored **URL-first** — nothing fetched at capture time, matching the Moodboard decision (D92). | V2 |
| R1.5 | A signal has a **validity window** and can go stale. Expired signals are excluded from generation by default and shown as expired, never silently dropped. | V2 |
| R1.6 | Signals are **human-curated**. Nothing is scraped or auto-ingested. | V2 |
| R1.7 | An LLM may **help author** a signal's direction from its observation, as an assist a human accepts or edits. It never creates a signal unattended. | V2 |
| R1.8 | Agent-researched proposals; external trend/social feeds. | Later |

### 6.2 Signals — reaching generation

| | Requirement | |
|---|---|---|
| R2.1 | Signals resolve **ambiently** through the client; a node opts into specific ones with **toggles** — the Brand-KB slice pattern (D6/D17). | V2 |
| R2.2 | A **Signal node** exists for explicit, visible wiring when a designer wants the influence legible in the graph. | V2 |
| R2.3 | Both paths produce **the same context**. One resolution function, two entry points — ambient and by-edge must be indistinguishable downstream. | V2 |
| R2.4 | Signals are **off by default** on every node; opt-in is per node and deliberate. | V2 |
| R2.5 | The **compiled prompt shows** which signals were applied, before generation (MVP PRD §12). | V2 |
| R2.6 | Every attempt **records the signals used** in `inputs_used`. Without this the harness cannot isolate their effect. | V2 |

### 6.3 Client approval *(specified in Post PRD §6.8 — scheduled here, not restated)*

| | Requirement | |
|---|---|---|
| R3.1 | Implement Post PRD **R8.1–R8.6**: share by link, review without an account, artwork **and** caption, approve or comment, approval bound to **that exact render** and invalidated by any edit, offline approval recordable by a senior and **labelled as recorded**, every round retained. | V2 |
| R3.2 | The shared object is a **generic approvable render**, not a post. Same cost now; it is what lets an approved still or a finished clip use the identical surface without a rewrite — and it is how the reel eventually stops ending at an archive bundle. | V2 |
| R3.3 | **One gate, not two** (Post PRD §6.10). Sharing with a client needs no internal sign-off; the privileged act is publishing. Do not build an approval step in front of sharing. | V2 |
| R3.4 | Pin-anchored comments; email notification on approval or comment. | Later |

### 6.4 Publishing *(Post PRD §6.9)*

| | Requirement | |
|---|---|---|
| R4.1 | Implement **R9.1–R9.6**: publish to connected Instagram, Facebook Page and LinkedIn organisation; **nothing publishes without a current client approval**; caption **read-only** at publish; every publish recorded; a permanent **copy-caption · download** hand-off that also records the publication; visible connection health. | V2 |
| R4.2 | **Meta App Review is submitted within this scope.** Going live is gated on Meta's 2–6 week clock, so submission — not publication — is the deliverable that can be committed to. | V2 |
| R4.3 | **LinkedIn ships as its own stage** when its verification clears, exactly as the Post PRD stages it. Meta first. | V2 |
| R4.4 | The **assisted hand-off carries the pilot** if platform approval slips. This is the pre-agreed fallback, not an improvisation. | V2 |
| R4.5 | Scheduling, carousels, video, Stories, first-comment hashtags, analytics. | Later |

### 6.5 Post + reel validation

Produces **evidence, not features**. No new editor capability ships.

| | Requirement | |
|---|---|---|
| R5.1 | Both surfaces used by **real designers on real client work**, not demo content. | V2 |
| R5.2 | Measure **posts composed in CreativeOS versus finished in Canva** — the wedge in one number. | V2 |
| R5.3 | Measure **time to create a post**, **time from script to first approved still**, and **brand-kit completeness per active client** as the leading indicator. | V2 |
| R5.4 | Measure **compliance issues caught** before work leaves the tool. | V2 |
| R5.5 | Once approval ships: **round trips before client approval**, and **time from approved plate to approved post**. These become measurable for the first time. | V2 |
| R5.6 | Bugs found are fixed; **feature requests are recorded, not built.** | V2 |

### 6.6 Evals

| | Requirement | |
|---|---|---|
| R6.1 | The frozen harness is **restored** and kept in the repo rather than deleted after use. | V2 |
| R6.2 | **Step 3 completed** on Run-01: human open coding, then axial coding into a ranked failure taxonomy. A domain expert reads first; an LLM assists with clustering only after 30–50 are hand-coded. | V2 |
| R6.3 | **Run-02 measured** — the effect of the D23 shot-context trim, decided on Run-01 reasoning, shipped, never measured, though the `SHOT_CONTEXT_MODE` toggle to measure it was built. | V2 |
| R6.4 | **Output variance measured**, not just pass/fail. Approval rate rising while variance falls is the signature of the failure this product cannot afford. | V2 |
| R6.5 | Signals measurable **on versus off** against the same frozen fixture. | V2 |
| R6.6 | **No decision that changes generation inputs closes without its measurement.** D23 shipped unmeasured; this requirement exists to end that practice. | V2 |

### 6.7 Agentic

| | Requirement | |
|---|---|---|
| R7.1 | The copilot is **reachable again** — the Gallery-drawer collision (YUV-233) is resolved, not worked around by leaving it disabled. | V2 |
| R7.2 | Generation steps continue to **pause at a human gate** (D70). The agent proposes and prepares; a human presses Generate. | V2 |
| R7.3 | The copilot can **apply signals** to a node as an ordinary tool call under existing blast-radius gating (D63). | V2 |
| R7.4 | The per-shot **repair cell** (D58): a budget-capped observe-decide loop asking *"is this image good enough?"*, hard ceiling on attempts and spend, every attempt in the version log. **Moved to sprint 3** — its stopping condition needs the quality signal §6.6 produces, and it is the right thing to lead a sprint rather than to squeeze into one. | Later |
| R7.5 | Parallel multi-shot runs and the canvas matrix (D62). | Later |

### 6.8 Asset library *(backlog F6, partially promoted)*

| | Requirement | |
|---|---|---|
| R8.1 | The Gallery drawer's **Assets** tab widens from **canvas-scoped to client-wide** — every generated still and clip for that client, not just the open canvas. This is the smallest change that makes it a library rather than a panel. | V2 |
| R8.2 | **Filter by metadata already captured** in the version envelope: node type, model/provider, **approval state**, and date. No new capture is required — §13's discipline is what makes this a query rather than a project. | V2 |
| R8.3 | A found asset can be **dragged back onto a canvas** as a reference, reusing the existing gallery add path (D41). *"Find the approved still I made for this client"* without reopening the canvas that made it. | V2 |
| R8.4 | **Moodboard thumbnail capture is switched on** at add time. | V2 |
| R8.5 | Semantic / CLIP search over stills and moodboard items; cross-client rollup; prompt-text search. | Later |

> **R8.4 is the one item in V2 whose cost grows with delay.** A moodboard item can only be embedded
> while its source URL is still live (F6). Items collected during the URL-only window whose links
> later rot are **not back-embeddable** — when semantic search lands it can only index forward.
> Every other deferral in the backlog stays flat while it waits; this one quietly destroys future
> value every week it is postponed. It is a small write-path change and it belongs in V2 for that
> reason alone, not because search is imminent.

---

## 7. Success criteria

| Signal | Why it matters |
|---|---|
| **A client approves work through a link** | The reel and the post both get an ending. Nothing in the field does this. |
| **Meta App Review is submitted** | The only deliverable in V2 whose delay compounds. |
| **A signal demonstrably changes the generated asset** | The scope rule (§4) in one measurement. If not, signals are a dashboard. |
| **Output variance rises, or at least holds, with signals on** | The guard against making the known #1 defect worse. |
| **Homogeneity moves against the Run-01 baseline** | The first evidence in this product's life that a prompt change did what it intended. |
| **Posts composed here rather than in Canva** | The post wedge in one number. |
| **Round trips before client approval** | Whether the approval loop actually got shorter — measurable only once item 3 ships. |

**Kill signals.**

* If applying a signal produces no measurable difference in output, **signals are a dashboard** —
  stop building and cut the claim from the pricing page.
* If designers keep going to Canva, **the answer is not more editor features** — the wedge is wrong.
* If clients will not use the approval link and keep replying on WhatsApp, the delivery surface is
  wrong and the assisted hand-off is the real product.

---

## 8. Dependencies & external constraints

| | Impact |
|---|---|
| **Meta App Review — 2–6 weeks, multiple rounds likely, and only test accounts connect until it clears.** | **The critical path of the entire version.** Submission must be treated as a deliverable with a date. Publishing is staged so nothing else waits on it. |
| **LinkedIn app verification** with organisational permissions. | Its own stage when it clears; never a blocker on Meta. |
| **Publishing depends on approval** (R9.2 — nothing publishes without a current client approval). | Fixes the internal build order: approval before publish, no way around it. |
| **The eval harness must be restored before signals ship.** | Only way to satisfy R6.5. ~1–2 days, and it gates the measurement half of V2. |
| **Past-performance signals need published-post data.** | Deferred until item 3 is live — the one signal type with a real predecessor. |
| **Signal curation is a human habit, not a surface.** | If nobody adds signals the feature is dead regardless of quality. §10 Q1 before build; empty states carry the action (D143). |
| **A brand-icon library** is required for posts with a contact strip — the installed icon set has no social marks and will not add them, on trademark grounds. | Carried forward from the Post PRD. A real dependency, not optional. |
| **Client KBs must be in reasonable shape.** | Signals cannot produce brand-relevant directions from a thin KB; pick pilot clients accordingly. |
| **Moodboard embedding decays with time** (F6). Items collected URL-only whose links rot are never back-embeddable. | The reason R8.4 is in V2 rather than deferred with the rest of the library. A small write-path change now preserves an asset that is otherwise being lost weekly. |

---

## 9. Risks

| Risk | Response |
|---|---|
| **The scope does not fit two weeks.** Five themes, two of which are new subsystems. | §5.1 splits it in advance and names what a single sprint would actually contain. Five things at eighty percent is the one outcome with no value. |
| **Meta submission slips again.** It has already slipped from "day one". | Made a named deliverable with a date (R4.2), not a background task. The assisted hand-off (R4.4) carries the pilot regardless. |
| **Signals become a new homogenizer** — every asset chases the same trending format, and monotony returns in a new costume. | Precisely why R6.4 and R6.5 exist. Variance measured with signals on and off against a frozen fixture before signals are called done. |
| **Nobody curates signals.** | Primary product risk, not a UX detail. §10 Q1; empty states carry the action; the LLM assist (R1.7) lowers the cost of a good direction. |
| **Stale signals poison generations.** | Validity windows (R1.5); expired excluded by default and shown as expired. |
| **A shared approval link is forwarded and the wrong person approves.** | Accepted, per the Post PRD: it is the trust model of emailing a PDF, which is what it replaces — with expiry, revocation, per-render scope and a named approver on record. |
| **The repair cell burns credits.** | Scheduled last, after evals give it something to stop on; hard attempt and spend ceiling; every attempt in the version log; the human gate stands. |
| **Two headline claims stay unshipped** — the self-learning agent, and fully automated market signals. | Copy is the fast half: move both behind an explicit roadmap treatment or into the Custom/pilot tier until the product catches up. Cheaper than the churn. |

---

## 10. Open questions

1. **Who curates signals, and when?** Designer mid-canvas, senior as a weekly ritual, or owner per
   client? Decides where the surface lives and whether it is used at all — the biggest risk in §9.
2. **Default validity window** per signal type. A seasonal moment and an audience shift do not expire
   on the same clock.
3. **Link expiry** — the Post PRD proposes 30 days. Confirm before build.
4. **Does a later "request changes" override an earlier approval** on the same render? The Post PRD
   assumes yes. **Should the client see previous rounds?** It assumes no for V1.
5. **How does the copilot–drawer collision resolve** — does the copilot become a different surface
   shape rather than a second docked panel?
6. **How many design partners, on which clients**, for validation to be a signal rather than an
   anecdote?
7. **How wide is "client-wide" for the asset library** — one client, or the whole org? R8.1 assumes
   per client, matching how everything else is scoped; an agency hunting "that shot we did for
   someone else" would want org-wide, which is a different permissions question.
8. **Does a signal belong in the archive bundle** (MVP PRD §16) as part of provenance? It shaped the
   output, so the presumption is yes.

---

## 11. Where the design lives

| Spec | Covers | Decisions |
|---|---|---|
| *(to write — next)* Market signals design | Signal record, types, validity, slice resolution, Signal node, compiled-prompt surfacing | D149– |
| *(existing)* `2026-08-03-post-client-approval-design.md` | Shared link, feedback, approval binding, recorded fallback | D110–D112 |
| *(existing)* `2026-08-03-post-publishing-design.md` | Connections, publish flow, staging around platform approval | D113–D115 |
| *(existing)* Copilot design part 1 & 2, playbook runner | The agentic substrate being re-enabled | D54–D76 |
| *(existing)* `2026-07-02-eval-viewer-error-analysis-design.md` | The workbench Step-3 coding happens in | D94 |
| *(existing)* MVP PRD §21 **F6** | Asset library scope, and the embedding-decay caveat behind R8.4 | — |
| *(sprint 3)* Repair cell design | Observe-decide loop, budget ceiling, playbook integration | — |

**Only market signals needs a new design spec.** Approval, publishing, the copilot, the eval
workbench and the asset library are all specified or scoped already — V2's job for those five is to
build, widen, restore, or measure what was decided months ago and never finished.

That is the honest shape of this version: **one new subsystem, and a lot of finishing.**

---

## 12. Sizing note

Six themes across two sprints, one of which carries a 2–6 week external clock that starts only at
submission. The ordering in §5.1 exists so that if capacity turns out tighter than planned, what
drops is decided in advance rather than argued at day eight — and so the two items whose cost grows
with delay (**Meta submission**, **moodboard thumbnail capture**) are never the ones that drop.
