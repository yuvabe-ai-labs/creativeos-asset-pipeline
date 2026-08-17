# CreativeOS V2 — Product Requirements

**Date:** 2026-08-16
**Status:** Draft, pending review. Scope agreed 2026-08-16.
**Owner:** Cyril Varghese
**Size:** Two sprints — §5.1 has the order, and what gets dropped first if we run short.

> **How this fits with our other docs.** The MVP PRD describes the product as it stands today. This
> doc covers one version. When V2 ships, it gets folded into the MVP PRD's changelog — same as we did
> for multi-tenancy and for Posts. Client approval and publishing were already written up in the
> **Post PRD** (§6.8–§6.10); we're scheduling that work here, not redesigning it.


---

## 1. What V2 is for

**V2 takes the work of V1 further — adding the key things that set us apart, and solidifying what
we already have.** In practice that means five moves:

* **Improve reels with feedback** — real designers on real client work, with evals telling us what's
  actually working.
* **Harden the posting flow with integration** — client approval, then publishing to live accounts.
* **Improve the daily workflow** — approval links and a searchable asset library.
* **Figure out our agentic patterns** — the copilot back on now, the self-checking retry loop next.
* **Evals for continuous improvement** — so every change we make is measured, not assumed.

And one new differentiating piece — **market signals**: what's changing in the client's market,
usable at the moment we generate. All of it serves the line already on our own website:

> **"Your next D2C creative should not start from zero."**

The six workstreams:

| | What | Why now |
|---|---|---|
| **1. Market signals** | A list, kept per client, of what's changing in their market — usable when we generate | We already sell this on the pricing page. Nothing is behind it. |
| **2. Post + reel validation** | Real designers using it on real client work, and measuring what happens | Both are built and unproven. The Post PRD already says what would tell us we're wrong. |
| **3. Post integration + publish** | Client approval links, then publishing to live accounts | Two-thirds of the Post spec isn't built. It's also the thing no competitor offers. |
| **4. Evals** | Bring back the test harness, finish the analysis, watch for sameness | Items 1 and 5 change what we send the model. This is how we notice if quality slips. |
| **5. Agentic** | Turn the copilot back on | It's finished code sitting behind a layout bug. |
| **6. Asset library** | Let people find past work across canvases, not just the one they're in | Sold at every price tier. The data is already there — only the search is missing. |

> **Also explored: Shopify.** We looked at a Shopify integration alongside this plan. Verdict:
> **worth doing as a data source** — a client's store can feed product names, prices and
> photography straight into their brand workspace, a few days of work with no review process — but
> **closed to us as a sales channel**: Shopify's App Store rules bar tools that connect merchants
> to agencies, and everything there is billed per store, not per agency. Nothing is scheduled in
> V2; the likely future bridge is *past-performance signals* fed by store sales data. Full
> write-up: [Shopify integration research](2026-08-16-shopify-integration-research.md).

---

## 2. The problems we're solving

Same order as the moves in §1 — each one exists because of a specific problem we have today.

| What we're doing | The problem it fixes |
|---|---|
| **Improve reels with feedback** | **Reels are built but unproven.** No designer has run the pipeline on real client work with anyone measuring — and the finished work never reaches the client. It ends as a zip file we keep. Posts get a client; reels get a folder. |
| **Harden the posting flow** | **Only a third of Posts exists.** Composing works; approval and publishing don't. Client sign-off happens on WhatsApp, where nothing records what they saw or said — and **we can't even apply to Meta** until their reviewers can click through a working publish flow. |
| **Improve the daily workflow** | **Past work has no home.** Finding an approved still means reopening old canvases one by one. The asset library is sold at every price tier, and the data behind it is already being recorded — only the search is missing. |
| **Figure out our agentic patterns** | **The copilot is switched off.** Fully built, merged, then commented out of the canvas over a layout bug. Our biggest single feature can't be reached by anyone. |
| **Evals for continuous improvement** | **We need to see more data and improve our prompts with it.** The one time we looked, 20 shots all came out looking the same — a real prompt problem, found by looking. Then the analysis was dropped and the test deleted. Evals make that looking routine: more outputs seen, patterns spotted, prompts improved with evidence instead of guessing. |
| **Market signals** | **The product knows the brand, but it's blind to the market.** It carries tone, compliance and visual identity — nothing about what's trending, what competitors are running, which formats are working, how the audience is shifting, or what a season demands. Reading the market and turning it into creative is the half of the job agencies are actually hired for, and today it lives only in designers' heads — and we already sell the fix: "market signals" is on our pricing page with nothing behind it. |

---

## 3. Who this is for

Designers, seniors and owners as before — plus, with item 3, **the client**, who reviews and approves
without needing an account.

V2 raises one people question rather than adding a user: **whose job is it to add market signals?**
See §10.

---

## 4. The rule we're holding ourselves to

**A signal is only worth keeping if it changes what we generate.**

Left alone, a market-signals feature turns into a marketing dashboard — trend feeds, competitor
galleries, charts — none of which touch a prompt. If something on a signal can't be traced to a
difference in the actual asset, it doesn't ship.

Our own website says it well: *"from 'this format is trending' to 'here is how it works for this
brand.'"* **The second half is the product.** Noticing a trend is the easy part. Saying what this
brand should do about it is the useful part.

For Posts, the Post PRD's rule still stands: **anything that only makes the editor nicer is out.**

---

## 5. What's in, what's later

| Area | **V2** | **Later** |
|---|---|---|
| **Adding signals** | Added by a person, kept per client. Five kinds — one of them waits for publishing. | The copilot researching signals for a human to approve; automatic trend feeds. |
| **Using signals** | On automatically through the client, plus a Signal node when you want it visible on the canvas. | Signals that suggest themselves per shot. |
| **Validation** | Posts **and reels**, with real designers on real client work. | — |
| **Approval** | Client approval links, built so stills and clips can use them too. | Comments pinned to a spot on the image; email notifications. |
| **Publishing** | Connect and publish, and **the Meta application submitted**. Going live depends on Meta. | Scheduling, carousels, Stories, analytics. |
| **Evals** | Test harness back, analysis finished, second run measured, sameness tracked. | Automatic grouping of failures; AI scoring; learning from corrections. |
| **Agentic** | Copilot switched back on. | The self-checking retry loop; running many shots in parallel. |
| **Asset library** | Search past work across a whole client. Start saving moodboard thumbnails. | Search by what an image looks like; searching across clients. |

### 5.1 The plan — two sprints

Priority order:

1. **Market signals first** — the one genuinely new thing in this version.
2. **Then improving reels and hardening posts** — reels get their feedback loop (evals +
   validation); posts get approval, publishing, and the Meta application.
3. **Then the rest** — the asset library and the copilot, as capacity allows.

So **sprint 1 is signals** — with the eval harness back first, because that's how we check signals
actually change the output. **Sprint 2 is the posting flow**: approval, then publishing, then the
Meta application (approval first, because nothing publishes without a current client approval —
Post PRD R9.2). Validation of reels and posts runs through both sprints, since it costs calendar
time, not build time.

One thing to be aware of: Meta's **2–6 week review** only starts once their reviewer can click
through a working publish flow. Doing signals first means we submit at the end of sprint 2, so
publishing goes live about two weeks later than if we'd done it the other way round. We know, and
that's fine — signals matter more right now.

> **Caveat — the signals PRD is bigger than one sprint.** Sprint 1 delivers its **foundation plus
> one usable slice**: MR enters a signal, a designer toggles it onto a script or prompt, the
> output changes, and we can measure it. The browsing shelf, the Signal node, downstream toggles
> and the review queue come in sprint 3 and phase 2. Whether even the slice fully fits is flagged
> as an open question in the
> [Market Signals PRD](superpowers/specs/2026-08-17-market-signals-prd.md) (§12), with a
> recommendation on what to protect.

**Sprint 1 — market signals, measured**

| | Days | What |
|---|---|---|
| 1 | 1 | **Bring back the eval harness.** It's still in git history, and the helper script never left. It comes first because it's how we prove signals change the output. |
| 2 | 1–2 | **Read through the 20 test outputs** and write up what's wrong with them. A person reading, alongside the build. |
| 3 | 1–5 | **Signals** — the record, applying them automatically, and recording which ones were used. |
| 4 | 5–7 | **The Signal node**, and showing applied signals in the prompt before you generate. |
| 5 | 8–10 | **Test signals on and off** against the same 20 shots — quality and variety, both. |
| — | 1–10 | **Validation starts now and runs through both sprints.** Real designers on real reels and posts — it costs calendar days, not build days. |

**Sprint 2 — harden the posting flow**

| | Days | What |
|---|---|---|
| 6 | 1–6 | **Client approval links** (Post PRD §6.8) — built for a general "thing to approve", not just a post, so stills and clips can reuse it. |
| 7 | 6–9 | **Connect and publish** (§6.9) — Meta and LinkedIn connections, publishing with a locked caption, a record of every publish, and the copy-and-download fallback. |
| 8 | 9–10 | **Submit to Meta** — test instructions, screencast, a reason for each permission. Privacy Policy and Terms are already live on the website. |
| — | alongside | **Asset library and the copilot re-enable** — "the rest", slotted in as capacity allows. If they don't fit, they open sprint 3 rather than squeezing this one. |

**The self-checking retry loop stays in sprint 3.** It needs the evals to tell it what "good
enough" means, and by then sprint 1 will have produced exactly that.

**If sprint 1 runs late,** drop in this order: the read-through of test outputs, then the Signal
node. **Never drop:** the harness, the signal record with automatic application, or the on/off
comparison — those three are the sprint.

**If sprint 2 runs late,** drop in this order: the library and copilot (to sprint 3), then
**LinkedIn** (ship Meta first — the Post PRD already treats LinkedIn as its own step).
**Never drop:** approval, or submitting to Meta.

---

## 6. What we're building

Tagged **[V2]** or **[Later]**.

### 6.1 Signals — what one is

| | | |
|---|---|---|
| R1.1 | A **signal** belongs to a client and can be used on any of their canvases — same as the Brand KB and moodboards. | V2 |
| R1.2 | Five kinds: **trending format**, **competitor pattern**, **seasonal moment**, **audience shift**, **past performance**. Past performance **waits** — it needs data we only get once publishing works. | V2 |
| R1.3 | A signal says **what's happening and what this brand should do about it**. Without the second half it's useless to a generation, so we shouldn't quietly accept one. | V2 |
| R1.4 | A signal can carry reference images or a link to where it came from. We store the link, not the image — same approach as moodboards. | V2 |
| R1.5 | A signal has **dates it's valid between**, and can go out of date. A Diwali angle in March is worse than no signal at all. Out-of-date signals stop being used, and are shown as expired rather than quietly disappearing. | V2 |
| R1.6 | **A person adds signals.** Nothing is scraped or pulled in automatically. | V2 |
| R1.7 | The AI can **help write** the "what this brand should do" part, which a person then accepts or edits. It never adds a signal on its own. | V2 |
| R1.8 | The copilot proposing signals; automatic trend feeds. | Later |

> **Footnote — where "past performance" could come from later.** We looked at whether Shopify is
> worth integrating, and one finding lands directly on R1.2: **Shopify has sales data.** *"This
> product is moving"* is a market signal with a proper source behind it, which is more than we can
> say for the other four kinds. It's parked, not planned — past performance still waits on
> publishing — but it's the most likely way that signal kind eventually gets filled.
>
> The same research says integrating with Shopify is worth doing **as a source of product data,
> not as a place to sell.** Their App Store rules bar tools that connect merchants to agencies, so
> listing isn't open to us. Full write-up:
> **[Shopify integration research](2026-08-16-shopify-integration-research.md)**.

### 6.2 Signals — how they reach the work

| | | |
|---|---|---|
| R2.1 | Signals are available through the client automatically, and each node picks which ones it wants with toggles — the same way Brand KB slices already work. | V2 |
| R2.2 | A **Signal node** exists for when a designer wants to see a signal's influence on the canvas instead of it being invisible. | V2 |
| R2.3 | Both routes give exactly the same result. One piece of code, two ways in — a signal arriving automatically and the same signal arriving by a connection must be identical downstream. | V2 |
| R2.4 | Signals are **off by default** everywhere. Turning one on is a deliberate choice, per node. | V2 |
| R2.5 | **The prompt shows which signals were applied** before you press Generate — we already do this for everything else that goes into a prompt. | V2 |
| R2.6 | Every generation **records which signals it used**. Without this we can't tell whether signals made any difference. | V2 |

### 6.3 Client approval *(already written up in Post PRD §6.8 — scheduled here, not redesigned)*

| | | |
|---|---|---|
| R3.1 | Build Post PRD **R8.1–R8.6**: share by link; the client reviews with no account; they see the artwork **and** the caption; they approve or comment; approval applies to **that exact version** and any edit cancels it; a senior can record an approval that happened offline, **clearly marked as recorded**; every round is kept. | V2 |
| R3.2 | What gets shared is **a thing to approve**, not specifically a post. Costs the same now, and it's what lets an approved still or a finished clip use the same screen later — which is how the reel finally gets an ending. | V2 |
| R3.3 | **One gate, not two.** Sending work to a client is normal client contact and needs no internal sign-off. The step that needs permission is publishing. Don't build an approval in front of sharing. | V2 |
| R3.4 | Comments pinned to a spot on the image; email notifications. | Later |

### 6.4 Publishing *(Post PRD §6.9)*

| | | |
|---|---|---|
| R4.1 | Build **R9.1–R9.6**: publish to a connected Instagram, Facebook Page and LinkedIn page; **nothing publishes without a current client approval**; the caption is **locked** at publish so we can't send something the client never saw; every publish is recorded; a permanent **copy caption and download** fallback that also gets recorded; and you can see whether a connection is healthy. | V2 |
| R4.2 | **We submit to Meta within this version.** Going live depends on their 2–6 week review, so what we can commit to is applying — not being live. | V2 |
| R4.3 | **LinkedIn ships separately** once its own verification clears. Meta first. | V2 |
| R4.4 | If platform approval is slow, **the copy-and-download fallback carries the pilot.** That's the plan, not a scramble. | V2 |
| R4.5 | Scheduling, carousels, video, Stories, analytics. | Later |

### 6.5 Post + reel validation

This produces **evidence, not features.** Nothing new gets built in the editor.

| | | |
|---|---|---|
| R5.1 | Real designers, real client work — not demo content. | V2 |
| R5.2 | Measure **posts finished in CreativeOS versus finished in Canva.** That's the whole idea in one number. | V2 |
| R5.3 | Measure **how long a post takes**, **how long from script to first approved still**, and **how complete each client's brand kit is** — an empty brand kit makes the whole thing look pointless on first use. | V2 |
| R5.4 | Measure **compliance problems caught** before work leaves the tool. | V2 |
| R5.5 | Once approval ships: **how many rounds before a client approves**, and **how long from approved image to approved post.** We can measure these for the first time. | V2 |
| R5.6 | Fix the bugs we find. **Write down feature requests; don't build them.** | V2 |

### 6.6 Evals

| | | |
|---|---|---|
| R6.1 | Bring the test harness back, and **keep it in the repo this time** instead of deleting it when we're done. | V2 |
| R6.2 | **Finish the analysis** on the 20 test outputs: someone reads them and writes notes, then those notes get grouped into a ranked list of what's going wrong. A person reads first; AI can help group them after the first 30–50 are done by hand. | V2 |
| R6.3 | **Measure the second run** — whether trimming shot context actually helped. We decided it, shipped it, built the switch to test it, and never ran the test. | V2 |
| R6.4 | **Measure how varied the output is**, not just whether it's good. Approval going up while variety goes down is exactly the failure we can't afford. | V2 |
| R6.5 | Compare **signals on versus signals off** against the same 20 shots. | V2 |
| R6.6 | **Nothing that changes what we send the model gets closed without being measured.** We've now done that three times. This is the rule that stops a fourth. | V2 |

### 6.7 Agentic

| | | |
|---|---|---|
| R7.1 | **The copilot works again** — fix the overlap with the gallery drawer properly rather than leaving it switched off. | V2 |
| R7.2 | Generating still **waits for a person** to press the button. The copilot sets things up; a human decides. | V2 |
| R7.3 | The copilot can **apply signals** to a node, under the safety rules it already follows. Depends on items 3 and 4 in §5.1. | V2 |
| R7.4 | The **self-checking retry loop** — asks "is this image good enough?", tries again with something changed, with a hard limit on tries and spend, and every attempt visible in history. **Moved to sprint 3**, because it needs the evals to tell it what "good enough" means. | Later |
| R7.5 | Running many shots in parallel. | Later |

### 6.8 Asset library

| | | |
|---|---|---|
| R8.1 | The gallery's **Assets** tab shows **everything for that client**, not just the canvas you have open. That single change turns a panel into a library. | V2 |
| R8.2 | **Filter by what we already record**: node type, model, approval state, date. No new tracking needed — we've been storing this all along. | V2 |
| R8.3 | Drag something you found **back onto a canvas** as a reference. *"Find the approved still I made for this client"* without reopening the canvas that made it. | V2 |
| R8.4 | **Start saving a thumbnail** when someone adds a moodboard image. | V2 |
| R8.5 | Search by what an image looks like; search across clients; search prompt text. | Later |

> **R8.4 is the one thing here that gets more expensive the longer we wait.** A moodboard item can
> only be saved while the original link still works. Anything we collected with just a link, whose
> link later breaks, **can never be recovered.** Every other item on the "later" list stays the same
> size while it waits. This one quietly loses value every week. It's a small change, and that alone
> is why it's in V2 — not because image search is coming soon.

---

## 7. How we'll know it worked

| Sign | Why it matters |
|---|---|
| **A client approves work through a link** | Both reels and posts finally have an ending — and none of the tools we compete with do this. |
| **We've submitted to Meta** | The only thing in V2 that gets worse the longer we wait. |
| **A signal visibly changes what gets generated** | Our own rule (§4) in one measurement. If it doesn't, signals are a dashboard. |
| **Output stays as varied, or gets more varied, with signals on** | Proof we haven't made our worst problem worse. |
| **The sameness problem moves versus the first test** | The first time in this product's life we'd have proof a change did what it was meant to. |
| **Posts finished here rather than in Canva** | The post idea in one number. |
| **Fewer rounds before a client approves** | Whether the approval loop actually got shorter — measurable only once item 3 ships. |

**Signs we're wrong.**

* If turning a signal on changes nothing in the output, **signals are a dashboard.** Stop building
  and take the claim off the pricing page.
* If designers keep going to Canva, **the answer isn't more editor features.** The idea is wrong.
* If clients won't use the link and keep replying on WhatsApp, the sharing screen is wrong and the
  copy-and-download fallback is the real product.

---

## 8. What we depend on

| | Why it matters |
|---|---|
| **Meta app review — 2–6 weeks, usually several rounds, and only test accounts can connect until it clears.** | **The longest pole in the whole version.** Submitting needs to be a task with a date on it. Everything else is built so it doesn't wait on Meta. |
| **LinkedIn verification** | Its own step when it clears. Never a reason to hold up Meta. |
| **Publishing needs approval first** — nothing publishes without a current client approval. | Settles the build order. Approval before publish, no way round it. |
| **The eval harness has to come back before signals ship.** | It's the only way to compare signals on versus off. A day or two of work, and it gates the measuring half of V2. |
| **Past-performance signals need publishing data.** | Waits until item 3 is live. The only signal kind with something in front of it. |
| **Someone has to actually add signals.** | If nobody does, the feature is dead however good it is. §10 Q1 needs answering before we build, and empty states need to carry the action. |
| **We need a brand-icon set** for posts with a contact strip — our current icon set has no social logos and won't add them, for trademark reasons. | Carried over from the Post PRD. Real dependency, not optional. |
| **Client brand KBs need to be in decent shape.** | Signals can't say anything useful about a brand we barely know. Pick pilot clients accordingly. |

---

## 9. What could go wrong

| Risk | What we do about it |
|---|---|
| **The scope is bigger than two weeks.** Two of the six are new builds. | §5.1 splits it into two sprints in priority order, with the drop order agreed up front — so if we run short, what gets cut is already decided. |
| **Meta submission slips again.** It's already slipped from "day one". | Make it a task with a name and a date (R4.2), not background work. The copy-and-download fallback carries the pilot either way. |
| **Signals make everything look the same** — every asset chasing the same trending format, and the monotony comes back wearing a new outfit. | Exactly why R6.4 and R6.5 exist. We measure variety with signals on and off, against the same 20 shots, before calling signals done. |
| **Nobody adds signals.** | Treated as the main product risk, not a design detail. §10 Q1; empty states carry the action; the AI assist (R1.7) makes writing a good one cheap. |
| **Out-of-date signals spoil the work.** | Valid-between dates (R1.5); expired ones stop being used and are shown as expired. |
| **A shared link gets forwarded and the wrong person approves.** | Accepted, as the Post PRD already decided: it's the same trust as emailing a PDF, which is what it replaces — with expiry, the ability to revoke, one link per item, and the approver's name on the record. |
| **The retry loop burns credits.** | Scheduled last, once the evals give it something to stop on. Hard limit on tries and spend, every attempt in history, and a person still presses Generate. |
| **Two things on our pricing page stay unbuilt** — the self-learning agent, and fully automatic market signals. | Changing the words is the fast half. Move both to a clearly-labelled roadmap, or into the top tier as something we build with a pilot client, until the product catches up. Cheaper than losing trust. |

---

## 10. Still to decide

1. **Whose job is it to add signals, and when?** A designer mid-canvas, a senior once a week, or the
   owner per client? This decides where it lives and whether it gets used at all — the biggest risk
   in §9.
2. **How long is each kind of signal valid by default?** A seasonal moment and an audience shift
   don't expire on the same schedule.
3. **How long does a share link last?** The Post PRD suggests 30 days. Confirm before building.
4. **If a client asks for changes after approving, does that cancel the approval?** The Post PRD
   assumes yes. **And should they see previous rounds?** It assumes no for now.

---

## 11. Where the designs live

| Doc | Covers | Status |
|---|---|---|
| [`superpowers/specs/2026-08-17-market-signals-prd.md`](superpowers/specs/2026-08-17-market-signals-prd.md) | Market signals **PRD** — the record, scopes, the MR team's process, both consumption modes, the manual→agent path, sprint mapping. Its design spec follows once MR discovery closes | **PRD drafted — in review** |
| `2026-08-03-post-client-approval-design.md` | Share links, feedback, what approval attaches to, offline fallback | Written |
| `2026-08-03-post-publishing-design.md` | Connections, publish flow, staging around platform approval | Written |
| Copilot design, parts 1 and 2, plus the playbook runner | The copilot we're switching back on | Written |
| `2026-07-02-eval-viewer-error-analysis-design.md` | The screen where the analysis happens | Written |
| Self-checking retry loop | The loop, its limits, where it plugs in | Sprint 3 |
| [`2026-08-16-shopify-integration-research.md`](2026-08-16-shopify-integration-research.md) | Background reading — whether Shopify is worth integrating, and where "past performance" signals could come from | Research, no decision taken |

**Only market signals needs a new design.** Approval, publishing, the copilot, the eval screen and
the asset library are all already designed or already scoped. For those five, V2's job is to build,
widen, restore or measure something we decided months ago and never finished.

**Build order is §5.1.**

---

## 12. On size

Six things across two sprints, one of which has a 2–6 week wait attached that only starts when we
apply.

The order in §5.1 is written down so that if we run short, **what gets dropped was decided in advance
instead of argued about on day eight** — and so the two things that get more expensive the longer
they wait (**submitting to Meta**, **saving moodboard thumbnails**) are never the ones dropped.
