# PRD: Market Signals V1

**Product:** CreativeOS
**Date:** 2026-08-27
**Status:** Final for V1 build. Supersedes `2026-08-17-market-signals-prd.md` (and its
share copy) — see that file's banner for what changed.
**Primary users:** Market Research Team, Senior Designers, Designers
**Scope:** Detailed V1, brief V1.x and V2 roadmap
**Design spec:** `2026-08-27-market-signals-v1-design.md` (the *how*; decisions D184–D189)

---

## 1. Summary

Market Signals gives designers a persistent view of **what is happening around a client**,
alongside the existing Brand KB.

The system creates a shared knowledge loop:

```
MR collects market references
        ↓
References live under the client
        ↓
Designers see them before creating
        ↓
Designers group useful patterns
        ↓
Groups become Market Signals
        ↓
Signals become shared client knowledge
        ↓
Any designer can use them as creative inputs
```

V1 is intentionally manual. The purpose of V1 is to learn:

> **What market information is actually useful enough to influence creative work?**

---

## 2. Problem

Today, market references are fragmented across research documents, saved posts, chats and
individual memory.

Designers therefore begin work with strong **brand context**, but without a shared view of:

* what competitors are doing
* what interesting adjacent brands are doing
* what creative patterns the team has already noticed
* what previous designers considered worth responding to

There is also an ownership problem.

The MR team can find relevant market evidence, but they are not necessarily social-media or
creative experts. Asking them to create Signals from day one would require them to decide:

> What is the creative pattern here?
> Why do these references belong together?
> Which part of the pattern is reusable?
> Is this useful enough to influence creative?

We do not yet know the answers ourselves. Designers are closer to these decisions.

Therefore:

> **MR captures evidence. Designers teach the system what should become intelligence.**

---

## 3. Product Hypothesis

> If MR continuously maintains relevant Direct and Adjacent references for each client,
> designers will be able to identify useful patterns from that evidence and turn them into
> reusable Market Signals that improve the starting context for the wider creative team.

V1 should prove this human workflow before we automate it.

---

## 4. V1 Goals

V1 must:

1. Give MR a low-effort way to add relevant references.
2. Store market evidence persistently under each client.
3. Make that evidence visible to designers before they start creative work.
4. Allow a designer to select and group related references.
5. Allow that group to be named, tagged and described as a Market Signal.
6. Make the Signal available to every designer working on that client.
7. Allow designers to use existing Signals as inputs when deciding what to make.

---

## 5. V1 Non-goals

V1 does **not** include:

* AI-generated Signals
* AI grouping or clustering
* AI-written tags or descriptions
* AI ideation from Signals
* AI script augmentation
* automated market research

All interpretation remains human.

---

## 6. Users and Responsibilities

| User | V1 responsibility |
| :--- | :--- |
| **MR Team** | Find and add relevant market references |
| **Designers (all)** | Identify patterns and create Signals; consume references and existing Signals while creating |

The mental model is:

> **MR:** "This is worth looking at."
> **Designer:** "These examples represent the same useful pattern." / "This is something I
> want to respond to."

Signal creation is open to **every designer**, not gated to seniors (D188). The original
draft assigned distilling to senior designers; the team is small enough that the gate would
cost more than it protects, and `created_by` records who actually distills — which is itself
a V1 learning.

---

## 7. Information Architecture

Market knowledge belongs at the **client level**.

```
CLIENT
│
├── Brand KB
│
├── Market
│   ├── Direct
│   ├── Adjacent
│   └── Signals
│
└── Canvases
```

A Signal must not disappear with one canvas. Once created, it becomes reusable knowledge
for that client.

---

## 8. Core Objects

### Market Reference

A single piece of market evidence. **A reference is a URL of any kind** — an Instagram
reel, a TikTok, a YouTube video, a GIF, an image, or any web page. It contains:

* URL/reference
* visual preview (thumbnail in the grid; **watchable/playable on open**)
* source bucket (Direct / Adjacent)
* optional MR note
* who added it, and when

#### Direct

Creative from direct competitors, the same category or comparable products.

> **What is our category doing?**

#### Adjacent

Interesting creative outside the direct category that may contain transferable ideas.

> **What else might be useful to learn from?**

### Market Signal

A Signal is a **designer-created interpretation of a group of references**.

Example:

> #### Tactile product opening
> `[Ref] [Ref] [Ref] [Ref]`
> **Tags:** `Hook` `Product demo`
> **Description:** These examples open with pouring, touching or applying the product
> before moving into ingredients or benefits.

A Signal contains:

* grouped references (links to evidence — the references also remain in their buckets)
* name
* tags
* description
* client association

The supporting references must remain visible so other designers can understand where the
Signal came from.

---

## 9. V1 Flow A: MR Adds Evidence

Two capture paths, both low-effort:

**Browser extension (primary).** MR is browsing Instagram/YouTube/TikTok; right-click →
"Add to CreativeOS" → pick client + bucket (Direct/Adjacent) → optional note → saved.
MR never opens the app.

**In-app (secondary).** Open client → Market → paste URL → pick bucket → optional note →
Add.

Either way:

* MR is **not** asked to identify a trend, hook or recommendation.
* Any URL is accepted. If the platform preview can't be fetched (private account, deleted
  post, unrecognized site), the reference is saved anyway as a link tile carrying the note
  and source link — capture never fails (D185).

---

## 10. V1 Flow B: Designer Sees the Market

Before starting or while preparing creative work, the designer opens the client's Market
section:

```
DIRECT     [ref] [ref] [ref] [ref]
ADJACENT   [ref] [ref] [ref] [ref]
```

The experience is primarily visual. The designer can browse, open references (video plays
in-app), compare examples, and select multiple references.

The question being answered is: **What is happening around this client?**

This is the **SEE** stage. It is available both on the client's Market page and inside the
canvas (the gallery drawer shows the same boards).

---

## 11. V1 Flow C: Designer Creates a Signal

A designer notices that several references share something meaningful. They multi-select
them (selection can span Direct and Adjacent), choose **Group as Signal**, and manually
provide:

* **Name** — e.g. *Tactile product opening*
* **Tags** — e.g. *Hook, Product demo*
* **Description** — e.g. *These examples introduce the product through touch, pouring or
  application immediately.*

The transformation:

```
Market evidence
        ↓
Designer selects related examples
        ↓
Groups them
        ↓
Names + tags + describes the pattern
        ↓
MARKET SIGNAL
```

This is the **DISTILL** stage. Grouping **links** references into the Signal — it never
removes them from their bucket, and one reference can back multiple Signals (D187).

---

## 12. Signals Become Shared Client Knowledge

Once saved, the Signal appears under **Client → Market → Signals**:

```
PRAKRITI SATTVA — Signals
  Tactile product opening
  Short ritual storytelling
  Ingredient-led visual storytelling
```

> **A Signal created by one designer becomes available to every other designer working on
> the client.**

A future designer should not have to rediscover the same pattern from scratch. Over time
the client accumulates: MR evidence → designer interpretation → reusable Signals → shared
creative knowledge.

---

## 13. V1 Flow D: Designer Uses a Signal

When beginning creative work, the designer has access to Brand KB + Market References +
existing Market Signals. They can inspect a Signal and its underlying references (which
remain live evidence, never stale copies).

Example: seeing *Tactile product opening* against a current script, the designer may
decide "Move the product application into Shot 1." That decision is manual in V1.

This is the **IDEATE** stage.

---

## 14. V1 Flow E: Make

The designer manually creates or modifies the script; it continues through the existing
CreativeOS production flow.

```
SEE — browse evidence
  ↓
DISTILL — create / select Signal
  ↓
IDEATE — designer decides how to respond
  ↓
MAKE — designer creates or changes script
  ↓
Existing CreativeOS production
```

---

## 15. Functional Requirements

### Market References

* Market exists under every client (Direct + Adjacent, auto-provisioned).
* MR can add a reference via the browser extension or in-app; every reference is Direct
  or Adjacent.
* A reference is any URL: video (Instagram/TikTok/YouTube), GIF, image, or page.
* References have a visual preview; video references are watchable in-app on open.
* Unrecognized/unfetchable URLs are still saved (degraded link tile).
* MR can add an optional note; the reference records who added it and when.
* Designers with access to the client can see these references — on the Market page and
  in the canvas gallery drawer.

### Signal Creation

* Any designer can multi-select references (across buckets) and group them.
* A group becomes a Signal with a manual name, tags, and description.
* A Signal links its references; references remain in their buckets and can belong to
  multiple Signals.
* Removing a reference removes it from every Signal that links it (visibly); a Signal
  whose last reference is removed survives as an empty card.
* Signals are stored under the client.

### Signal Consumption

* All designers working on the client can view saved Signals and inspect the evidence
  behind each one.
* Signals are available before and during creative work (V1: the Market page; in-canvas
  signal browsing is deferred to V1.x).
* Signals are inputs to the designer's manual creative process.

---

## 16. Success Criteria

V1 should answer four questions:

1. **Does MR maintain the shelf?** Are relevant Direct and Adjacent references added
   consistently? (`added_by` makes this measurable.)
2. **Do designers look at it?** Is Market used before or during creative work?
3. **Do designers create Signals?** Do designers naturally group references into reusable
   patterns?
4. **Do those Signals affect creative?** Can we observe different creative decisions
   because a Signal existed?

The most important V1 learning:

> **What references do designers group together, how do they describe the resulting
> patterns, and which Signals are useful enough to reuse?**

---

## 17. V1.x Roadmap

V1.x progressively adds AI assistance to the human workflow established in V1.

* **V1.1 — Assist DISTILL.** Designer selects the references; AI suggests Signal name,
  tags, description. Designer confirms or edits.
* **V1.2 — Assist IDEATE.** CreativeOS uses Signal + Brand KB + current script/work to
  propose multiple creative directions. Designer chooses.
* **V1.3 — Assist MAKE.** CreativeOS proposes script changes based on the selected
  direction. Designer accepts, modifies or rejects.

The principle remains: **AI proposes. Designer decides.**

---

## 18. V2 Broad Direction

V2 moves AI one step earlier. By then CreativeOS has accumulated references, groups and
Signals; the system can begin exploring: accumulated evidence → AI suggests groups → AI
proposes Signals → human reviews → approved Signal.

V2 does not need to be specified further until V1 teaches us what a genuinely useful
Signal looks like.

---

## 19. Product Principle

The sequencing is deliberate:

> **Do not ask MR to define Signals before designers have shown us what useful Signals
> are. Do not automate Signal discovery before humans have established the patterns worth
> automating.**

The V1 loop is therefore:

# **MR COLLECTS → DESIGNERS DISTILL → TEAM REUSES → CREATIVE GETS MADE**
