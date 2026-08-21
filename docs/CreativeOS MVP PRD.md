# CreativeOS MVP PRD

## Canvas-based asset generation for reels and posts

[Figma board](https://www.figma.com/board/90dIUhXohYzzp0QKEYMUIq/Creative-OS---PRD-and-Mental-Model?node-id=0-1&p=f&t=LXtWkwPy3Rh0qzSA-0)

> **Document version: v3 (Production-platform revision, 2026-08-16).** CreativeOS is no longer a
> single-tenant internal tool that makes reel assets. It is a **multi-tenant product** that
> external agencies log into (**Organizations + Supabase Auth**, D42–D53), it produces a **second
> asset type** end-to-end (**Post node** — compose, approve, publish, D116–D136), it meters what
> it spends (**credit ledger + pre-generation estimates**, D77/D92/D93), and it generates video
> across **three providers** (Veo · Sora · Kling, D78–D81/D90/D99–D102). See **§0.1** for the full
> v2 → v3 changelog.
>
> The v2 spine is unchanged: the first input node shipped is the **Script node** (parses a
> finished reel script into asset-ready fields), and the **Brief node** remains defined-but-unbuilt.
> Build sequencing and the authoritative *why* for every decision live in the ADR log,
> `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7 (now **D1–D148**).

---

## 0. Changelog — v1 (Brief node) → v2 (Script node)

| # | Change | Where | Decision |
|---|---|---|---|
| 1 | **Script node added *alongside* the Brief node.** The first input node *shipped* is the **Script node** (parses a finished reel script into asset-ready fields). The **Brief node** (parses an upstream brief into structured context) is **retained for later** — not built, not removed. | §7.1, §10, §11.1–11.2, §13, §14 | D16 |
| 2 | **Client KB pulled forward.** The reusable client context (originally a Stage-5 concern) shipped early as a versioned **Brand KB** (document uploads + vision-analyzed brand images), exposed to script parsing as selectable **slices**. | §6, §9.1, §11.1 | D17 |
| 3 | **Versioning refined.** A version row is created **only when the model runs** (parse / re-extract). A manual edit + Save folds into the **active version's output in place** — it does not append a row. | §11.1, §13 | D18 |
| 4 | **Single-source output.** A node's output has one source of truth: the active version's `output`. No separate display cache on the node. | §11.1, §20 | D19 |
| 5 | **Input formats.** MVP script input is pasted text + `.md`/`.txt` upload. `.docx`/`.pdf` extraction is deferred. | §11.1 | D15 |
| 6 | **Edit at the source.** A node's output is edited only where it is produced; downstream consumers get read-only mirrors, never per-consumer overrides. | §9.2 | D20 |
| 7 | **Shot fan-out.** A reel is `1 script → N shots → N images → N clips → 1 reel`. A human-triggered **"fan out shots"** materializes each shot of a parsed script into its own first-class **Shot node** (seed-and-fork; mark, don't block). | §7, §10, §14, §15 | D21 |
| 8 | **Shot → image context trimmed.** A Shot still *carries* its full narrowed script (D21), but when it feeds an image prompt only the **visual description + production medium** are passed — reel-level copy (objective, on-screen text, voiceover, caption, CTA, …) is dropped to cut homogeneity and baked-in-text risk. Grounded in the Run-01 eval. | §7.1, §10, §12 | D23 |
| 9 | **Video Prompt node added.** Stage 4 splits into a **Video Prompt node** (a dedicated prompt node that *vision-reads the approved still* and writes a **Veo motion prompt** with camera/motion master controls) → **Video Gen node**. Supersedes the single-Prompt-feeds-both model for the default path (inline text on the Video Gen node stays as a fallback). | §7, §9.2, §10, §11.5–11.6 | D24 |
| 10 | **Async video jobs.** A long-running Veo job is tracked in a disposable **`generations`** table that *graduates* into a `node_versions` row on completion; reconciled by a Vercel Cron (Veo is poll-based), pushed to the canvas via Realtime. | §11.6, §15 | D25 |
| 11 | **One generation substrate (image + video).** Generation execution is chosen by **duration, not modality**: **synchronous** in-request when the model returns in time (image today), **async** submit→reconcile→graduate when long-running (video). Both share the one `generations` job row — image is the sync fast path, not a different mechanism. | §11.6, §20 | D26 |
| 12 | **Image editing is a new *attempt*, not a node.** A targeted **remove / replace / add** edit on the Image Gen node's current image is a new **generation attempt** in that node's version log (not a separate Edit node, not an in-place overwrite — an edit runs the model, so by D18 it is an attempt). Surfaced as Remove/Replace/Add quick-action chips; a deterministic preservation prompt goes to an editing-capable model (Gemini default). Lineage breadcrumbs in `inputs_used`; no schema change. | §7.3, §11.6, §17 | D27 |
| 13 | **Shot Composer.** A capture-only **"Compose variations"** action on the Shot node turns one thin shot seed into **4 role-aware, divergent ideas** (designer-picked role + KB compliance/tone + optional vision-read reference image on a new Shot image handle). Pick one to rewrite the shot's description, or multi-select to **promote** extras into sibling Shot nodes. Runs are captured in `node_versions` (frozen `generated_output`, **never made active** — Shot output stays its own `data.script`, D19/D20); no schema change. | §7.1, §10, §14 | D28 |
| 14 | **Quick-add node palette + keyboard shortcuts.** Adding a node is now keyboard-first: `/` (or right-click) opens a type-to-filter command palette **at the cursor**; single-letter mnemonics (S/F/N/P/D/I/V/G) create a node instantly at the cursor without opening the palette. The palette is the single "add node" surface (`/` and right-click open the same thing), replacing the plain right-click context menu, and still offers **Paste image** when the clipboard holds one. Shortcuts are suppressed while editing a node's text. | §6 | spec: `docs/superpowers/specs/2026-06-28-quick-add-node-palette-design.md` |
| 15 | **Soft identity + maker-checker approval.** A "who are you?" gate captures a spoofable **name + role** (senior / designer) at app start (stamped as the *maker* on generations). Each LLM attempt carries an **approval flag** (`pending → approved / changes_requested`) set by a senior in the node focus view and shown as an on-canvas badge — distinct from the pass/fail eval signal. **Flag only** (no gating/RBAC). Promotes parts of backlog F1/F4 into the build. | §5, §11.6, §13, §22 | D29 |
| 16 | **Single-writer canvas lock (multi-user safety).** A canvas is edited by **one session at a time** — a second opener is **strict read-only** with a "{name} is editing" banner and a **take-over-when-stale** button. Per-tab session key + heartbeat/TTL; **server-enforced** so concurrent tabs can't corrupt the canvas. Replaces an earlier optimistic-merge autosave that let two sessions fight. | §5, §22 | D33 (supersedes D32) |
| 17 | **Generation Tray added.** A flat, canvas-scoped shelf floating over the canvas lists long-running **image + video** generation jobs (**Running / Ready / Failed**); clicking an item flies the canvas to that generation node and opens its focus view — **navigation only**, no tray-level actions. **Derived on read** from the `generations` job table (no new table); **image gen now also writes a `generations` row** so it appears alongside video (completing D26 — image stays synchronous). A Ready item persists **until approved**. The **guided next-node flow** (auto-create/connect the next node) is split into a separate later spec. | §11.6–11.7, §14, §17 | D35 |
| 18 | **Guided next-node flow added.** A contextual **"Create next"** action on each pipeline node **saves → creates → connects → places → opens** the next node down the chain (Shot → image prompt → Image Gen → video prompt → Video Gen), wiring the extra parents each step needs (shot + still → Video Prompt; motion prompt + still → Video Gen). It **never runs a model** — the designer sets controls, verifies inputs, and clicks Generate (D11). **Idempotent** (navigates to an existing next node, never duplicates); the Image Gen → video CTA is enabled once a still exists, with a *"not approved yet"* nudge (approval guides, never gates — D29). Reuses the D35 seams (`focusedNodeId`, ancestor edge-walk). | §14, §17 | D36 |
| 19 | **Client Moodboards added.** A **client-level** collection of reference images ("Face cream", "Mother's Day"), reusable across every canvas for that client — filled by a small **browser capture extension** (right-click any image on the web → "Add to moodboard") and by in-app **add-by-URL**, browsed as a **Moodboards tab** in the Gallery drawer. Stored **URL-first**: an item is a row holding the image URL + the page it came from; **nothing is fetched at add time**, and full bytes are re-hosted to storage **only when the item is dragged onto a canvas** and becomes an ordinary **File node** — the moment durability starts to matter (generation + archive). | §6, §9, §11.4, §17, §18, §21 F6 | D92 |

---

## 0.1 Changelog — v2 (Script node) → v3 (Production platform)

Where v2 was one revision (the Script node), v3 absorbs roughly a hundred decisions recorded
between 2026-07-05 and 2026-08-16. The through-line: **CreativeOS stopped being an internal
single-tenant reel-asset tool and became a multi-tenant product with a second asset type.**

Only **product-level** shifts are listed. Implementation-level ADRs (z-index rules, context vs
props, listener collisions) stay in the ADR log where they belong.

| # | Change | Where | Decision |
|---|---|---|---|
| 20 | **Organizations + real auth.** An **Organization** (agency) is now the tenant and isolation boundary above `clients`; users **log in** (Supabase Auth, invite-only), and no row/file/realtime event crosses the org boundary. Soft identity (D29) is superseded as the *source* of identity — `useIdentity()` kept its API, its internals swapped. Default-deny **RLS** on every table; **impersonation** with an audit log and a read-only default. Own PRD: `CreativeOS Multi-Tenancy Pilot PRD.md` | §5, §6, §17, §18, §21 F1, §22 | D42–D53, D77–D89, D139–D141 |
| 21 | **Post node — a second asset type, end to end.** Image Gen makes a *plate*; what ships to a client is a **post**: that plate with a headline, CTA, logo and colour band. A **Post node** composes text/shapes/images/icons over a connected image in a Canva-shaped editor (icon rail + shared flyout, fixed right inspector, 14 templates across three aspect bands), then carries client approval and publishing. Positioning: *"they don't have to switch tools to generate on-brand images."* | §1, §7, §10, §11.8, §14, §17 | D116–D128 |
| 22 | **Brand Kit — client-level design material.** A `client_brand_assets` table (logos / backgrounds / products) + `clients.brand_details` (phone, email, website, socials) + colours **derived from the active KB at read time**. Deliberately distinct from `client_brand_images`, which is the KB's vision-analysis *corpus*, not material anyone chose to design with. Fonts excluded on purpose | §6, §9.1 | D129–D135 |
| 23 | **Cost is visible and metered.** A **pre-generation credit estimate** renders before Generate on Prompt, Image Gen and Video Gen; spend is recorded in an append-only **`credit_transactions` ledger** (reservation → consumption → refund) with atomic row-locked reservation against a monthly org cap. The estimate is a **static derived formula / client-side computation**, never a live vendor call | §11.5–11.7, §25 | D47→D77, D92, D93 |
| 24 | **Video generation is multi-provider.** Veo 3.1 (Lite/Fast/Quality) + Sora 2 + Kling (3.0, O1). A **Target selector** on the Motion Prompt node shapes the prompt for its provider and locks to a connected Video Gen node. Camera is **uniform text-in-prompt for every provider** (Kling's `camera_control` path was built and then removed). The motion prompt is **preservation-first** — it restates fixed subject identity so branded products hold. Per-model capability descriptors; Veo gains a resolution param | §7.2, §11.7, §12 | D78–D81, D90, D99–D102 |
| 25 | **Start + end frame is the default shape of a video generation.** The video focus view leads with a **shot spine** — Start → End \| Reference in narrative order — reporting which roles are filled and what duration results. A missing end frame is an **empty slot at rest**, never a block. Rationale is economic: an image costs ~$0.067 against $0.40–$4.20 for a video re-roll, so composing an end frame is 6–63× cheaper than re-rolling until the motion is right. The API route **rejects** rule violations rather than auto-correcting | §10, §11.7 | D95–D98 |
| 26 | **Image editing matured into a composer.** A `Generate \| Edit` tab pair; the edit region travels in the **selected model's native channel** (OpenAI alpha mask painted by the user; Gemini text-only) — the burned-in annotation composite was retired because it reproduced the scribble into the output. The edit base is an **explicit pinned choice**, and edit references are **explicit**: an empty selection sends no extras | §11.6 | D37–D39, D101 |
| 27 | **Eval workbench — the learning loop got its surface.** `/eval/[canvasId]` lists every generated node grouped by action; the detail shows input → output, the **exact request sent**, and a **Δ that names what the human changed** between versions (structured field comparison, no LLM). Open coding only (Good/Bad + note). The quality axis stays distinct from the sign-off axis | §4.4, §13, §21 F4 | D94 |
| 28 | **The reference picker became a working surface.** The gallery is a **right drawer** (not a modal) that stays open across canvas interactions, with References (Drive, flat by recency) · Assets (canvas generations) · **Moodboards** tabs, infinite scroll, and **drag-and-drop onto a node** (auto-connects). The Prompt focus view became a **left-rail master–detail** | §9.3, §11.4, §11.5 | D40, D41 |
| 29 | **In-app onboarding is pull-not-push.** No tours, no first-view modals, no seen-state tables. Two surfaces only: **list empty states** carrying one CTA, and a global **Help ▾** menu of chaptered, video-led explainers — each chapter one two-pane screen (step rail beside the clip). Clips are committed to `public/`, re-encoded | §24 | D143–D148 |
| 30 | **"Video Prompt" is now "Motion Prompt."** Label + mnemonic only (`M`; Video Gen takes `V`; bare `g` belongs to the Gallery drawer). The persisted `nodes.type` slug stays `"video-prompt"` | §6, §7.2 | D137 |
| 31 | **A KB node exists on the canvas.** Every new canvas is seeded with a **KB node + a connected Script node**, so the canvas opens with its context already wired. This **reverses v2's "KB node is not a node"** rule (§8) — the client-level Brand KB surface still exists; the canvas node is a *reader* of it | §7.1, §8 | seeded per D143 |
| 32 | **Copilot — ⚠ BUILT BUT NOT RELEASED.** A docked panel that drives the canvas by language: server thinks / client acts / human gates, three stateless calls per turn, uuid-derived node ref handles, @-mention grounding, and a playbook runner whose generation steps always pause at a human gate. Merged to `main`, then **commented out** because the panel overlaps the Gallery drawer (YUV-233). **No operator can reach any of it today** | §23, §21 F1b | D54–D76 |

### Status honesty

Two entries deserve more than a table row, because the ADR log's confident present tense makes
both read as shipped when neither is reachable by a user:

* **Copilot (D54–D76) is built but switched off.** The full stack shipped — three stateless calls
  per turn, node ref handles (`TYPE-XXXX`), @-mention grounding, playbook runner with HITL gates —
  and is then **commented out of the canvas** (`canvas.tsx`, YUV-233: the panel overlaps the Gallery
  drawer). It is code on `staging` that no operator can reach. Treated here as **built, unreleased**.
* **The canvas-level Review surface (D34) is still an approved design with no implementation.**
  Approval itself works per-node and per-version; what does not exist is the list→detail queue at
  `…/canvases/[cid]/review`. Unchanged since v2 — flagged because the ADR log's confident tone
  reads as shipped.

### A note on ADR numbering

The ADR log now carries **duplicate D-numbers from parallel branch work** — two D78/D79/D80/D81
(auth/RLS vs. video-provider), two D92/D93 (token estimate vs. moodboards), two D101 (edit
references vs. `withAction()`), two D139 (impersonation banner vs. File-node retitling). The log
annotates each collision in place. **Cite D-numbers with their subject**, not the number alone,
until a renumbering pass lands. Next genuinely free number: **D149**.

---

Everything below the changelog is the full PRD with these changes applied. Sections
not touched by a revision (problem, principles, archive) are unchanged in intent.

---

## 1. Product summary

CreativeOS is a canvas-based asset generation platform for creative/marketing agencies.

> **v3 note.** The original framing — *"an internal tool for a studio"* — no longer holds. External
> agencies log in to their own **Organization**, which owns its client brands end to end with zero
> visibility into any other org's data (D42–D53). The product is still used *by agency staff*; what
> changed is that "the studio" is now one tenant among several.

The studio creates many types of marketing assets, including reels, posts, brochures, campaign visuals, and product creatives. The long-term platform can support multiple asset workflows, but the MVP started with a focused wedge:

**Help designers create the prompt, image, and video assets needed for a reel without switching between multiple AI tools.**

Today, designers step in and out of GPT, Claude, Gemini, OpenArt, and similar tools to generate prompts, image references, image outputs, and short video assets. This creates friction, repeated manual work, inconsistent output quality, and lost learning.

The MVP brings this workflow into one canvas:

Reel script / context / references
→ Prompt generation
→ Image generation
→ Video generation
→ Review, approval, archive

The MVP does **not** create full reels, stitch scenes together, handle timelines, or edit final videos. It focuses on producing the individual image/video assets needed for a piece of a reel.

**A second wedge shipped in v3 — the post.** Image Gen produces a *plate* (a photographic
background); what actually ships to a client is a **post** — that plate with a headline, body copy,
a CTA, a logo, and usually a colour band over it. That step used to happen in Canva. The **Post
node** (§11.8) brings it in-canvas, on the same positioning as the reel wedge:

> **"They don't have to switch tools to generate on-brand images."**

The Post editor deliberately does **not** compete with Canva on editing quality — that race is
unwinnable. It competes on not making you leave, and on everything either side of the editing: the
plate is already here, the brand is already here, approval and publishing are attached.

The product keeps the original **Organizations → Clients → Canvases → Nodes** foundation, but
simplifies by removing automated branching, auto-rewiring, and separate output nodes.

---

## 2. Problem

Designers currently produce reel assets through a fragmented workflow:

Read script / brief
→ Use GPT / Claude / Gemini to create prompts
→ Move between tools to refine prompts
→ Generate or collect image references
→ Generate images
→ Move to OpenArt or another video tool
→ Generate video assets
→ Manually track what worked
→ Repeat

This creates several problems:

| Problem | Impact |
| :---- | :---- |
| Designers switch between too many platforms | Slower production and more context loss |
| Prompt, reference, image, and video attempts are scattered | Hard to reproduce good outputs |
| Iteration depends heavily on manual prompting skill | First attempts are inconsistent |
| Controls are hidden inside prompts or external tools | Hard to systematically improve quality |
| Failed attempts increase cost | More wasted generation runs |
| Learning is lost after each project | The studio cannot reuse patterns effectively |
| A finished script is re-keyed by hand into every tool | The most concrete spec the designer has gets retyped, lossily, again and again |

---

## 3. MVP goal

The MVP goal is to help designers produce the assets needed for a reel:

Faster
+ with fewer tool switches
+ with better first attempts
+ with structured iteration
+ with reusable learning over time

The MVP should allow a designer to:

1. Bring in client context (Brand KB), a **reel script**, and references.
2. Parse the script into structured, editable, asset-ready fields.
3. Generate better image/video prompts inside the canvas from those fields.
4. Use standard master controls to guide generation.
5. Generate image assets.
6. Use generated or reference images as inputs for video generation.
7. Generate video assets for a reel.
8. Review, approve, reject, and compare attempts.
9. Preserve the journey of scripts, prompts, controls, references, and outputs.

The success of the MVP is not just output generation. It is reducing platform switching while improving quality and learning.

---

## 4. Product principles

### 4.1 Reduce platform switching

Designers should not have to move repeatedly between ChatGPT, Claude, Gemini, OpenArt, and file folders just to produce one reel asset.

### 4.2 Improve first attempts

The platform should improve first-attempt quality through:

* Client context (Brand KB)
* Structured **script** parsing into editable fields
* Reusable prompt patterns
* Master image/video controls
* Reference files
* Final compiled prompts

### 4.3 Make iteration faster

The platform should support faster iteration through:

* Canvas-based node duplication
* Interface-based controls
* Prompt history
* Generation attempts
* Approval/rejection states
* Clear input/output visibility

### 4.4 Learn from every attempt

CreativeOS should not just generate assets. It should help the studio learn what works.

Each meaningful AI-assisted attempt should capture:

* Inputs used
* Controls used
* Prompt used
* Final compiled prompt
* Model/provider used
* **The model's raw output _and_ the human-edited final** — kept distinctly, so the
  *correction* (what the designer changed) survives. The diff between them is the single
  strongest signal of where a prompt falls short.
* Approval/rejection decision

This capture is the foundation of a deliberate **prompt-improvement loop** (an "eval
flywheel"): *capture → accumulate real usage → error-analysis (read the corrections, label
pass/fail, cluster failure modes) → encode the top failures as bespoke pass/fail evals →
re-measure*. Each turn tightens prompt quality with evidence instead of vibe-checking.
Method and rationale: `docs/evals/2026-06-14-eval-flywheel-rationale.md`;
the raw-output capture (Step 1) is built per **D22**.

**The loop got its microscope in v3 — the eval workbench (D94).** `/eval/[canvasId]` is a
list+detail surface over **every generated node, grouped by action**, across **all versions**:

* The detail focuses on **input → output**, and shows the **exact request sent** — the real
  system prompt, compiled user input and attachments, not a reconstruction.
* Walking a node's versions produces a **Δ that names what the human changed** — `controls`,
  `instruction`, `kbSlices`, upstream `reference`, `promptVersion` — by **structured field
  comparison, with no LLM**. Naming the changed knob (rather than diffing a blob) is only possible
  because inputs are captured as *structured fields* in the first place; this is the payoff of the
  §13 capture discipline.
* When nothing structured changed but the output moved, it is flagged a **re-roll** — i.e. model
  nondeterminism, not a human improvement.
* **Open coding only** (Good / Bad + a note on the viewed version). Failure tags and axial
  clustering are deliberately deferred: you cluster *after* reading, by hand, first.

**The two axes never cross.** The quality/learning signal (`decision`) is written and read
separately from the sign-off signal (`approval_status`, §22.2). An output can be *good but not
signed off*, or *approved but instructive*; collapsing them would destroy both.

---

## 5. Users

### Primary user: Designer / Operator

The designer runs a canvas end to end.

They can:

* Create/open a client
* Create a canvas
* Add or parse a **reel script**
* Add text/image references
* Generate prompts
* Generate images
* Generate videos
* Review attempts
* Approve/reject attempts
* Archive the final project

### Secondary user: Admin

The admin manages reusable setup.

They can:

* Manage client Brand KB / files
* Maintain master controls
* Review archived outputs
* Learn from version history

For MVP, the same person may act as both designer and admin.

### Third user: Client *(external, no account — v3)*

With the Post node (§11.8), the **client** enters the picture for the first time — and only as an
approver. They receive a shared link, see exactly what will publish (artwork + caption), and reply
with an approval or a comment. **The client never composes.**

That single fact is what licenses a deliberately small editor: a skilled designer with a
constrained toolset and no tool-switching is well served, where a brand-side marketer handed the
same thing would find it missing features. We build for the first.

### Identity & concurrent access *(v3 — see §22)*

**Real authentication shipped.** Users **log in** (Supabase Auth, invite-only) and belong to an
**Organization**; every access check reduces to "is this row in my org?" (D42–D53). The v2 soft
identity (a spoofable localStorage name) is superseded as the *source* of identity — `useIdentity()`
kept its API and swapped its internals, exactly as the D29 seam intended.

Two role axes: `platform_role` in the JWT (is this a Yuvabe super-admin?) and `org_role` on the
membership (owner / member). A super-admin's normal app view is scoped to **their own org**;
cross-org visibility lives only in `/admin` and in **impersonation**, which is audited and
**read-only by default** — writes require explicitly entering elevated mode (D139–D141).

Multiple people (or tabs) can open the same canvas, but **only one session edits at a
time**: the first holds a **single-writer lock**; everyone else is **read-only** until they
take it over. Details in **§22**.

---

## 6. Information architecture

```
Organization (agency — the tenant & isolation boundary)   ← v3, D42
├── Users / memberships          (Supabase Auth; platform_role + org_role — D49, D50)
├── Credit ledger                (append-only; monthly cap — D77)
└── Clients
    └── Client
        ├── KB (Brand KB — versioned)
        ├── Brand Kit            (logos · backgrounds · products · details · colours — D129–D135)
        ├── Files
        ├── Moodboards           (named reference-image collections — D92)
        └── Canvases
            └── Canvas
                └── Nodes
```

**Nothing below the Organization moved.** Every table already FKs up to `clients`, so every row
inherits its org through the tree — adding the tenant layer meant one `org_id` column on `clients`,
not a schema rewrite (D42).

### Organization level *(v3)*

An organization is one agency. It owns its clients end to end, and it is the boundary every access
check reduces to. It also carries the **credit ledger** (§25): an append-only
`credit_transactions` log (reservation → consumption → refund) with a monthly hard cap, so a pilot
agency's spend can be monitored, capped, and invoiced from real numbers rather than one mutable
counter (D77, supersedes D47).

### Client level

A client is the top-level workspace.

It contains:

* **Client Brand KB** (built early — see D17): a versioned, structured brand profile
  (tone of voice, personality, positioning) + a **compliance** module (words/claims/tone
  to avoid, preferred verbs/phrases, disclaimers), derived from uploaded documents and
  vision-analyzed brand images. The KB has an append-only version log, an active-version
  pointer, and a readiness gate (`pending → in_review → ready`).
* **Client Brand Kit** (D129–D135) — the design material an operator actually reaches for
* Client files
* Client references
* **Client Moodboards** (D92)
* Canvases

Client-level context is reusable across canvases. A canvas (and its Script node) is only
reachable once the client's KB is **ready**.

#### Brand Kit *(D129–D135)*

Where the **Brand KB** is *model-extracted knowledge about* the brand, the **Brand Kit** is the
*material you design with*: **logos**, **backgrounds**, **products**, **contact details**, and
**colours**. It is what the Post editor (§11.8) reaches into so a designer never looks up a hex
code or hunts for a logo file.

The two are deliberately separate tables. `client_brand_images` — the KB's corpus — holds every
reference photo uploaded to *teach* the extraction model what the brand looks like; those are
pipeline inputs, not material anyone chose to design with. Surfacing them in a Brand panel would
bury three usable logos among forty analysis photos with nothing distinguishing them (D129).

Three storage decisions worth knowing, because each resists an obvious-looking shortcut:

* **Details are typed, not extracted.** Phone, email, website, address and socials live in
  `clients.brand_details` (JSONB). They are facts an operator types and expects to stay exactly as
  typed — putting them in the versioned KB means a re-extraction could silently rewrite a phone
  number (D130).
* **Colours are derived, never stored.** The Colours section parses hex codes out of the active KB's
  palette fields on each load. The palette already exists where brand facts belong; copying it in
  would create a second copy to keep in sync. Accepted trade-off: a KB re-extraction changes the
  swatches — *current* beats *stable* here (D132).
* **Fonts are excluded on purpose.** The KB's `typography_style` is prose ("clean geometric sans,
  generous tracking"). Mapping that to a real font means guessing, and guessing wrong **silently
  restyles a design** — a failure the operator would never attribute to the Brand Kit (D135).

#### Moodboards *(D92)*

A **moodboard** is a named, reusable collection of **reference images** owned by a client —
"Face cream", "Ayurvedic hair oil", "Mother's Day". Like the Brand KB, one board is reused
across every reel for that client rather than rebuilt per canvas.

* **Collect.** A small browser **capture extension** adds a right-click **"Add to moodboard"**
  on any image anywhere on the web (Pinterest and elsewhere), posting it to a remembered target
  board. In-app, an **add-by-URL** field does the same thing without the extension.
* **Browse.** Boards appear as a **Moodboards** tab in the Gallery drawer — a two-level
  drill-down (board list → board contents) mirroring how the References tab drills into Drive
  folders.
* **Use.** Dragging an item onto the canvas turns it into an ordinary **File node** reference,
  wired like any other gallery add (§11.4) — and from there it feeds Prompt / Shot / Image Gen
  inputs exactly like an uploaded image (§10).

**Storage is URL-first.** A moodboard item is a row holding the **image URL + the page it came
from** (provenance); nothing is fetched or stored when it is collected, and boards render by
hotlinking. **Full-res bytes are re-hosted to storage only when an item is actually used** —
dragged onto a canvas — which is the moment durability starts to matter, because the image now
feeds generation and lands in the archive bundle (§16). The accepted trade-off is **link rot**:
a source URL can rotate, so a long-idle board can show a broken tile and a drag-to-use can fail
(the File node surfaces its normal upload-error state and the item can be re-added). Boards are
a **staging shelf**, not durable storage — the canvas is where an image becomes durable.

> **Why not store the bytes at collect time?** It is more work at both ends (fetch + purge) and
> buys nothing for the eventual semantic search, which needs small **embeddings**, not hoarded
> images (§21 F6). The v1 schema is a strict *subset* of the durable model, so thumbnail caching
> and embeddings are additive columns later — nothing collected now has to be migrated or thrown
> away. Pinterest itself **cannot be embedded** in-app (it refuses framing via
> `x-frame-options` / CSP) and its API exposes only a user's own boards, so browsing stays in the
> real browser by necessity; what the moodboard fixes is the path from *found a reference* to
> *usable in the canvas*.

Examples of client context:

* Brand guidelines
* Tone of voice
* Compliance / words to avoid
* Product notes
* Past approved assets
* Campaign notes

### Canvas level

A canvas is one creative project.

It contains nodes.

Operators manually create, duplicate, connect, and arrange nodes.

**Adding nodes.** Open the quick-add palette at the cursor by pressing `/` or
right-clicking the canvas, then type to filter and press Enter (or click) to drop the
node where the cursor sits. Power users can skip the palette entirely — a single-letter
mnemonic creates that node type instantly at the cursor: **S** Script, **F** File,
**N** Note, **P** Prompt, **D** Draw, **I** Image Gen, **M** Motion Prompt, **V** Video
Gen. Keyboard shortcuts are suppressed while a node's text field is focused, so typing
into a node never spawns a node. Other canvas shortcuts: **⌘/Ctrl + D** duplicates the
selection, **Backspace / Delete** removes it, and bare **g** opens the **Gallery drawer**.
When the clipboard holds an image, the palette also offers **Paste image** (creates a File
node at the cursor).

> **Why `M` and `V` (D137).** These were `V` (Video Prompt) and `G` (Video Gen) until two
> independent document-level `keydown` listeners — the canvas mnemonic dispatch and the Gallery
> drawer toggle — **both claimed bare `g`**, so one press spawned a node *and* opened the drawer.
> Sibling listeners on the same target cannot cancel one another, so the collision had to be
> resolved in the key assignment rather than in handler ordering. `M` follows the node's new name,
> which frees the shorter, more guessable `V` for the node operators actually reach for more often.
> A test asserts no option ever re-takes `g`.

### Node level

A node is a working block inside the canvas.

Each node is understood by:

Inputs → Action → Output → History (if needed)

---

## 7. MVP node types

```
Input nodes
├── Script node      (shipped)
├── KB node          (canvas-side reader of the client's active Brand KB — seeded per canvas)
├── Brief node       (planned — retained for later)
├── Text node
├── Shot node        (created by "fan out shots" from a parsed Script — D21)
├── File node
└── Draw node        (experimental — in-canvas sketch → image)

Prompt nodes
├── Prompt node          (image/text prompts)
└── Motion Prompt node   (motion prompts for Veo · Sora · Kling — D24, renamed D137)

Generate nodes
├── Image Gen node
└── Video Gen node

Compose nodes
└── Post node        (lays copy/brand over a generated plate; approval + publishing — D116–D128)
```

**Eleven node types are registered** (`script`, `kb`, `file`, `text`, `prompt`, `shot`, `draw`,
`image-gen`, `video-prompt`, `video-gen`, `post`). Note the persisted slug for the Motion Prompt
node is still `"video-prompt"` — only the human-facing label changed (D137), because renaming a
slug that lives in `nodes.type` would cost a data migration plus coordinated route/prompt-id/eval
changes for zero user-visible gain.

### 7.1 Input nodes

| Node | Purpose | Output |
| :---- | :---- | :---- |
| **Script node** *(shipped)* | Parses a **finished reel script** into structured, editable, asset-ready fields | Raw script text + structured reel-script JSON |
| **KB node** *(v3)* | A canvas-side **reader** of the client's active Brand KB, so the context a canvas runs on is visible in the graph rather than purely ambient. Seeded automatically on every new canvas alongside a connected Script node | Brand-KB context (read-only mirror of the client's active version) |
| **Brief node** *(planned — retained for later)* | Parses an upstream **project brief** into structured context | Raw text + structured brief |
| **Text node** | Holds manual notes, copy, constraints, or instructions | Text |
| **Shot node** *(D21)* | One shot of a reel, materialized from a parsed Script via **"fan out shots."** Carries the full parsed script **narrowed to its single shot** ("a Script node with one shot") — editable shot description + all the script metadata + order. Its content **is** its output (no version log on the output — like a Text node). It also offers a **"Compose variations"** action (**D28**) that runs the LLM to suggest role-aware shot ideas; those runs are **captured** as version rows but are **never made active**, so the output stays the editable `data.script` | For an image prompt, the shot's **visual description + production medium** only (**D23** — reel-level copy is dropped); the full carried script is retained for later/video use |
| **File node** | Holds `.txt` or image references | File reference, image reference, optional extracted output |
| **Draw node** *(experimental)* | An in-canvas sketch surface (pen in black/red/green, eraser, clear; frame 9:16 · 1:1 · 16:9) for storyboarding/reference framing — *"a File node whose image is drawn in-app."* Carries optional composition instructions. One-shot: a saved sketch shows as a read-only thumbnail reference when reopened | Flattened sketch **PNG** (vision image downstream) + **composition instructions** text |

> The **Draw node** is a special File node: instead of uploading an image it lets the designer
> *sketch one in-app* (the same move the Script node makes for reel scripts). On **Save** the
> drawing is flattened to a PNG stored via the File-node image pipeline, so downstream it is
> consumed exactly like a File image (vision attachment), while its composition-instructions
> text travels like a Note. Underlay/"draw on top of a reference" and re-editing a saved sketch
> are deferred refinements; v1 is one-shot. Grounded in designer feedback that storyboarding +
> sketching is how reference frames get made.

> **A reel is `1 script → N shots → N images → N clips → 1 reel`** (D21). The shot, not the whole
> script, is the unit of generation. **"Fan out shots"** is a human-triggered action on a parsed
> Script that copies each shot into its own independent **Shot node** (seed-and-fork): a one-time
> copy, not a live link — later script edits do not propagate. A **dashed Script→Shot lineage
> edge** shows provenance (visual only — resolution never traverses it). Each Shot carries the
> full script narrowed to one shot; for an **image prompt** only the visual description + production
> medium are passed downstream (D23 — reel-level copy is dropped), while the full carried script
> stays available for later/video use. The
> origin is also recorded (`seededFrom`) so a Shot can show a "script updated since fork" signal
> (mark, don't block — D9/D21). Each Shot is the **through-line** that feeds a Prompt→Image now and
> a Video clip later, and carries the duration/order the final reel assembly needs.

> **Compose variations (D28).** A Shot node also offers a **"Compose"** action: pick a **role**
> (hook / hero / texture / application / ingredient / tutorial / lifestyle / social-proof / bundle /
> closure) and the composer returns **4 distinct, role-aware, production-ready ideas** from the
> shot's own trimmed seed (D23) + KB compliance/tone + an optional **vision-read reference image**
> (a new image-grounding target handle accepts a File/Draw/Image-Gen image). **Pick one** to
> rewrite this shot's description (edit-at-source), or **multi-select** to **promote** extras into
> sibling Shot nodes for comparison (no edges — human wires each). A compose run is **captured**
> as a `node_versions` row (frozen `generated_output`, D22) but is **never made active**, so the
> Shot keeps rendering its own description (D19/D20). Role-awareness is divergent ideation, not
> generation — the model proposes; the human picks.

> The **Script node** is *added alongside* the Brief node, not a replacement. A **brief** is
> upstream creative direction the system summarizes; a **reel script** is a near-final spec
> the system **extracts structure from**, so downstream nodes can address concrete fields
> (shots, on-screen text, voiceover, caption, CTA) directly. Stage 1 shipped the Script node
> first because the most concrete spec designers already hold is a finished script; the Brief
> node is retained for projects that start upstream (brief → generate script → parse).

### 7.2 Prompt nodes

| Node | Purpose | Output |
| :---- | :---- | :---- |
| **Prompt node** | Combines client context (Brand KB), connected inputs (incl. parsed script fields), inline files, and operator instruction into generated **image/text** prompts | Text |
| **Motion Prompt node** *(D24; renamed D137)* | Writes a **motion prompt** for image-to-video: *vision-reads the approved Image Gen still* + shot action context + Brand KB, steered by **camera/motion controls**. **Provider-aware** — a Target selector shapes the prompt for Veo · Sora · Kling and locks to a connected Video Gen node's provider. Synchronous LLM; versioned like the Prompt node | Text (motion prompt) |

> The **Motion Prompt node** is to *video* what the Prompt node is to *images*. It is a separate
> node (not a mode of the Prompt node) for canvas legibility and because a motion prompt has its
> own controls and grounds itself by **looking at the approved frame**. It feeds the Video Gen
> node. Inline motion text typed on the Video Gen node remains a quick-test fallback (D24).

> **Provider-aware, but uniformly so (D78 → D79 → D80).** The node targets three providers, and the
> shape of that awareness was corrected twice — worth recording, because the correction is the
> lesson. D78 shipped Kling's camera through its native `camera_control` parameter with a curated
> visual grid. That was **wrong on the facts**: `camera_control` is Kling-1.5-only, and Kling 3.0+
> use a separate, un-integrated feature. D79 therefore **removed the entire native-camera path** and
> made camera a **uniform text-in-prompt control for every provider** — less code, consistent UX,
> and what both vendors' own prompt guides recommend anyway. The Target selector survives, switching
> only the *prompt variant* (a shared spine plus minimal per-provider deltas).
>
> D80 then made that shared spine **preservation-first**: it dropped the hard word cap and restates
> the fixed subject identity (product shape, label, logo, lettering, colours, props, lighting) so
> **branded products hold their identity through motion**. Veo's visual-defect suppression moved to
> its native `negativePrompt` parameter with a product-tuned default — deliberately *not* including
> bare `text`/`logo`, so a product's real label survives.

### 7.3 Generate nodes

| Node | Purpose | Output |
| :---- | :---- | :---- |
| **Image Gen node** | Generates images from prompt text, image references, and selected controls — and **edits an existing image** (remove / replace / add an element) as a new attempt (D27) | Generated image attempts (incl. edits) |
| **Video Gen node** | Generates videos (image-to-video) from a **Motion Prompt node's motion prompt** + a **shot spine** of images (start frame · end frame · references — D95) + selected controls, against a chosen provider (Veo · Sora · Kling). Long-running async job (D25) | Generated video attempts |

### 7.4 Compose nodes *(v3)*

| Node | Purpose | Output |
| :---- | :---- | :---- |
| **Post node** *(D116–D128)* | Composes a finished **social post** over a connected generated image: text, shapes, images and icons on a layered stage, with brand colours/logos pulled from the Brand Kit, an AI-written caption + hashtags, compliance warnings against the client's KB, client approval by shared link, and publishing | A composed post (layers + artwork) + caption/hashtags + approval state |

---

## 8. What is not a node in MVP

These are not separate node types:

* Image node
* Video node
* Generated Image node
* Generated Video node
* Output node
* Archive node

> **Reversed in v3: the KB node.** v2 stated flatly that the Brand KB is a client-level surface and
> *not* a canvas node. A **KB node now exists** and is seeded on every new canvas alongside a
> connected Script node, so a canvas opens with its context already wired and visible in the graph.
> The client-level KB surface is unchanged and still authoritative — the canvas node **reads** the
> active version, it does not own or edit it. Ambient resolution via the parent chain (§9.1, D6)
> also still works; the node makes that context *legible*, it does not replace the mechanism.

Important rules:

* Uploaded `.txt` or image reference = **File node**
* A finished reel script (pasted or `.md`/`.txt`) = **Script node**
* Generated image = output inside **Image Gen node**
* Generated video = output inside **Video Gen node**
* A finished social post = output inside **Post node** *(v3)*
* Archive = **canvas-level project action**

---

## 9. Three levels of input

A node can receive context from three levels.

### 9.1 Client-level context (Brand KB)

Reusable client context, served from the client's **active Brand KB version** (D17).

Examples:

* Brand profile (name, tagline, positioning, mission, industry)
* Tone of voice
* Personality
* Compliance: words/claims/tone to avoid, preferred verbs/phrases, disclaimers

This is reached ambiently via the node's parent chain (`node → canvas → client →
active KB`), **not** as a visible canvas edge (D6). Relevant nodes opt into specific
**slices** of it:

* The **Script node** injects selected KB slices (compliance, tone of voice, personality,
  brand profile) into the parse so extraction respects brand voice and never introduces
  avoided words. Compliance, tone, and personality are on by default; brand profile is off.
* **Prompt nodes** select client context the same way when compiling prompts.

### 9.2 Canvas node inputs

Visible connections between nodes.

Examples:

* Script node → Prompt node
* Text node → Prompt node
* File node → Prompt node
* Prompt node → Image Gen node
* Image Gen output → Motion Prompt node *(vision reference for the motion prompt — D24)*
* Image Gen output → Video Gen node *(start frame)*
* Motion Prompt node → Video Gen node *(motion prompt)*
* Image Gen output → Post node *(the plate a post composes over — v3)*

### 9.3 Inline files

Files attached directly to a Prompt node.

For MVP, inline files are limited to:

* `.txt` files
* Image files

Inline files are local to that Prompt node. They are not automatically added to the client KB or canvas.

> **A moodboard is not a fourth input level (D92).** Client moodboards (§6) are a *staging shelf*,
> not a context channel: nothing on a board reaches a node ambiently the way Brand-KB slices do
> (§9.1). An image only enters the graph when the designer **drags it onto the canvas**, at which
> point it is re-hosted and becomes an ordinary **File node** — i.e. a plain §9.2 canvas input from
> then on, indistinguishable from an uploaded reference.

---

## 10. Valid node connections

| From | To | Why |
| :---- | :---- | :---- |
| Brief node | Prompt node | Use parsed brief as context *(when a project starts from an upstream brief)* |
| Script node | Prompt node | Use parsed reel-script fields (shots, on-screen text, voiceover, caption) as prompt context |
| Script node | Shot nodes | **Dashed lineage edge** (provenance, not live data) drawn by "fan out shots" (seed-and-fork, D21); each shot becomes an independent Shot node carrying the full script narrowed to one shot |
| Shot node | Prompt node | Use the shot's **visual description + production medium** as the prompt context for that shot's image (one image per shot, D21; trimmed per D23) |
| File node: image | Shot node | **Image-ground** the Shot Composer — ideas echo the reference's palette/surface/props (D28; lands the Shot's image handle) |
| Draw node | Shot node | **Image-ground** the Shot Composer with an in-canvas sketch (D28) |
| Image Gen output | Shot node | **Image-ground** the Shot Composer with a generated still (D28) |
| Text node | Prompt node | Add notes, constraints, or instructions |
| File node: `.txt` | Prompt node | Use reference text |
| File node: image | Prompt node | Use visual reference for prompt generation |
| File node: image | Image Gen node | Use image as generation reference |
| Draw node | Prompt node | Use the in-canvas sketch as a visual reference + its composition instructions as prompt context |
| Draw node | Image Gen node | Use the sketch as a generation reference |
| Prompt node | Prompt node | Refine or transform text |
| Prompt node | Image Gen node | Use text as image generation prompt |
| Prompt node | Video Gen node | Use text as video generation prompt *(fallback path; the default is via a Motion Prompt node — D24)* |
| Shot node | Motion Prompt node | Use the shot's **action / strategic objective** as the motion context (`renderShotForVideo`, D24) |
| Text node | Motion Prompt node | Add motion notes or constraints |
| File node: image | Motion Prompt node | Use an image as a style reference for the motion prompt |
| Draw node | Motion Prompt node | Use a sketch as a style reference for the motion prompt |
| Image Gen output | Prompt node | Use generated image for prompt refinement |
| Image Gen output | Motion Prompt node | **Vision-read** the approved still to ground the motion prompt (D24) |
| Image Gen output | Video Gen node | Fill a **shot-spine role** — start frame, end frame, or reference (D95) |
| Image Gen output | **Post node** | Use the generated image as the **plate** the post composes over (D117) |
| File node: image | **Post node** | Use an uploaded image as the post's plate or as a placed layer |
| Motion Prompt node | Video Gen node | Use the generated **motion prompt** for the video job (D24) |
| Video Gen output | Archive action | Archive approved final output |
| Post node output | Archive action | Archive the approved composed post |

---

## 11. Functional requirements by node

### 11.1 Script node

#### Purpose

The Script node turns a **finished reel script** into structured, editable, asset-ready
project context. It is *extraction, not generation* — the model transcribes the structure
already present in a script the designer wrote; it does not invent content.

Source script + extraction schema (+ selected Brand-KB slices)
→ Parse
→ Structured reel-script output (editable)

#### Inputs

* Pasted reel-script text
* Uploaded `.md` / `.txt` (plain text, read as-is)
* Selected **Brand-KB slices** (ambient client context — §9.1)

> `.docx` / `.pdf` extraction is deferred (D15).

#### Actions

* Upload or paste the script
* Edit the title
* Select which Brand-KB slices are injected (toggles; recommended set on by default)
* **Extract / Parse**
* Edit the parsed output field-by-field
* **Save** edits (folds into the active version — see Behavior)
* **Re-extract** (re-run the parse, e.g. after changing slices or the source)
* **Replace script** (return to the empty state with a new source)
* **Show original** (view the raw source against the parsed result)
* Restore a previous parse version
* Mark reviewed
* Connect output downstream

#### Focus view (UI)

On the canvas the Script node is a compact **launcher** (title or "Untitled script" +
parsed/not status). Opening it launches a full-screen **focus view** that is a
three-state machine:

* **EMPTY** — upload `.md`/`.txt` or paste, a title field, and Brand-KB slice toggles.
* **SKELETON** — a document-shaped shimmer placeholder while the model runs.
* **PARSED** — the editable structured document with header actions (Save, Re-extract,
  Replace script, Show original).

#### Output

* Raw script text
* Structured reel-script JSON (the shape below)

#### Data shape (structured reel-script output)

The parse produces a strict-schema object. All fields are optional (a parse may
legitimately leave a field empty):

```
title
type                  // VISUAL | VO | TEXT | ""
duration
schedule              // { date, post_time, category, theme }
strategic_objective
ai_production_type
visual_script         // { shots: [{ description, duration }], execution_refinement }
on_screen_text        // { intro, body[], outro }
voiceover
music_sound
caption
cta
thumbnail_hook
qc_notes[]
product_links[]
```

Node-level data shape:

```
Script node
- source script (raw text)
- title
- selected KB slices
- active parsed output      (the active version's output — single source, D19)
- parse versions            (append-only log)
- reviewed / unreviewed
```

#### Behavior

The Brand-KB slice selection is available directly in the focus view's EMPTY state and on
the node; slice edits do **not** create versions by themselves.

**A version is an LLM attempt (D18).** A new parse version is created **only when the model
runs** — i.e. when the operator clicks **Extract** or **Re-extract** (and for failed
attempts). A version's `inputs_used` / `params_used` / `model_used` are **frozen** (the
provenance of that attempt). Its **`output` is human-refinable**: a manual edit + **Save**
updates the **active version's `output` in place** — it does **not** append a new row, and
calls no model.

**Output has a single source (D19).** Rendering the parsed document reads the active
version's `output` (joined on canvas load). There is no separate `data.parsed` cache on the
node. Restore = repoint the active-version pointer; the display follows automatically.

A Script node is a special **File node** with a built-in reel-script extraction schema and a
dedicated full-screen focus view.

Each parse version stores:

* Source script used
* Raw extracted text
* Extraction schema used
* Parse instruction / system prompt used
* Brand-KB slices used + active KB version id
* LLM / provider used
* Parsed structured output (refinable in place)
* Timestamp
* User / operator
* Optional note

---

### 11.2 Brief node  *(planned — retained for later; not built in Stage 1)*

#### Purpose

The Brief node turns a source **brief** into structured project context. Where the Script
node extracts the structure of a *finished* reel script, the Brief node parses *upstream*
creative direction — for projects that begin from a brief rather than a written script.

Source brief + extraction schema
→ Parse
→ Structured brief output

#### Inputs

* `.docx`
* `.pdf`
* Pasted text

> Rich-document (`.docx` / `.pdf`) extraction is deferred for the MVP (D15); when the Brief
> node is built, it inherits whatever extraction support exists at that point.

#### Actions

* Upload brief
* Paste brief
* Edit extraction schema
* Parse
* Edit parsed output
* Mark reviewed
* Restore previous parse version

#### Output

* Raw brief text
* Structured brief JSON

#### Data shape

```
Brief node
- source brief
- current extraction schema
- active parsed output
- parse versions
- reviewed / unreviewed
```

#### Behavior

The extraction schema is hidden by default but available in an advanced editor. Schema edits
do not create versions by themselves; a version is created only when the operator clicks
**Parse** (consistent with the versioning principle — §13, D18).

Like the Script node, a Brief node is a special **File node** with a built-in extraction
schema. Each parse version stores: source brief used, raw extracted text, extraction schema
used, parse system prompt used, LLM/provider, parsed structured output, timestamp, operator,
optional note.

---

### 11.3 Text node

#### Purpose

The Text node holds manual text inside the canvas.

#### Inputs

* Typed text
* Pasted text

#### Actions

* Create text node
* Edit text
* Duplicate node
* Delete node
* Connect downstream

#### Output

* Text

#### Data shape

```
Text node
- content
- updated time
- updated by
```

#### Behavior

No versioning is needed for MVP.

Use a Text node when text should be visible, reusable, and connectable on the canvas.

---

### 11.4 File node

#### Purpose

The File node holds a visible source file reference inside the canvas.

For MVP, File nodes support only:

* `.txt`
* Images: `.png`, `.jpg`, `.jpeg`, `.webp`

No uploaded video references in MVP.

#### Inputs

* Uploaded `.txt`
* Uploaded image
* Image **pasted from the clipboard** (quick-add palette — `/` or right-click → **Paste image**)
* `.txt` selected from client files
* Image selected from client files
* Image **dragged in from a client Moodboard** (D92) — the source URL is re-hosted to storage
  server-side on drop, so the resulting node is an ordinary stored-image File node

#### Actions

* Upload/select file
* Paste an image from the clipboard (quick-add palette — `/` or right-click → **Paste image** — creates a File node at the cursor; only offered when the clipboard holds an image)
* Replace file
* Toggle Use LLM
* Edit extraction schema/prompt
* Process
* Duplicate node
* Delete node
* Connect downstream

#### Modes

Reference-only mode: File → File reference

LLM processing mode: File + schema / extraction prompt + Use LLM → Processed output

#### Output

* File reference
* Raw extracted text, if `.txt`
* Image reference, if image
* Structured extracted output, if processed with LLM

#### Data shape

```
File node
- file reference
- file kind: text or image
- use LLM: true / false
- extraction schema or prompt, optional
- active processed output, optional
- processing versions, only if LLM processing is used
```

#### Behavior

The **Script node** is the special File node for reel scripts (built-in schema + focus
view); a generic File node is for arbitrary `.txt`/image references.

A **moodboard drop is just another way to create an image File node** (D92) — the difference is
only *where the bytes come from*. Because a board stores a URL rather than an image (§6), the
drop triggers a **server-side fetch of the source URL → storage**, then fills in the node's file
url, filename, and pixel dimensions; the node shows its normal uploading state while that runs
and its normal upload-error state if the source URL has died. Downstream, nothing distinguishes
it from an uploaded image.

A File node only needs versioning when LLM processing is used. Each Process version stores
the same envelope as a parse version (file used, raw text, schema/prompt, Use-LLM setting,
model/provider, extracted output, timestamp, operator, optional note).

---

### 11.5 Prompt node

#### Purpose

The Prompt node produces text.

Client context (Brand KB)
+ Connected canvas inputs (incl. parsed script fields)
+ Inline `.txt` / image files
+ Operator instruction
→ Prompt node
→ Generated text

#### Inputs

* Client context (Brand KB slices)
* Connected canvas nodes (e.g. parsed script fields from the Script node)
* Inline `.txt` files
* Inline image files
* Operator instruction

#### Actions

* Select client context
* Connect canvas inputs
* Attach inline `.txt` or image files
* Write/edit instruction
* Generate text
* Edit generated output
* Restore previous generated version
* Duplicate node
* Delete node
* Connect output downstream

#### Output

* Text

#### Data shape

```
Prompt node
- purpose
- client context selection
- connected inputs
- inline files
- operator instruction
- active generated text
- generation versions
```

#### Behavior

The Prompt node creates the **base prompt text** *and* owns the **descriptive master
controls** — the finer image aspects (lens / focal length, lighting style, colour palette &
brand-hex usage, film stock / medium, composition, mood) that the image model's API does
**not** accept as parameters and can therefore only be expressed as **words in the prompt**.
These are **set values, not invented by the LLM** (defaults derived from the shot type and
Brand KB, operator-overridable per node). It does **not** own API-native generation controls
(aspect ratio, image count, seed) — those live on the Image/Video Gen node (§11.6, §12).

#### Controls (descriptive)

The master *descriptive* control schema is shared; each Prompt node stores the selected
values for that node. Example descriptive controls: lens / focal length, lighting style,
colour palette & brand-hex usage, film stock / medium, shot composition, mood. The compiled
prompt is composed as:

```
LLM-written subject · action · scene · composition (per shot)
  +  descriptive control clauses (set values)
→ compiled prompt
```

so the controlled aspects are deterministic — consistent where the brand needs it, shot-
appropriate where it should vary — instead of left to the model to invent. The final
compiled prompt must be visible before generation.

Each Generate version stores the standard envelope (client context used, connected inputs
used, inline files used, operator + system instruction, model/provider, generated text,
timestamp, operator, optional note) **plus the descriptive master-controls schema version
and the selected values used**.

---

### 11.6 Image Gen node

#### Purpose

The Image Gen node generates images.

Compiled prompt text (from the Prompt node — already carries the descriptive controls)
+ image references + selected **API-native** control values
→ Final request → Image model → Generated image attempts

#### Inputs

* Prompt text from Prompt node
* Optional image reference from File node
* Optional image output from another Image Gen node
* Selected image control values
* Edit instruction + intent (remove / replace / add) — when editing the active image (D27)

#### Actions

* Connect prompt input
* Connect optional image references
* Edit selected control values
* View final compiled prompt
* Generate image
* **Edit the active image** — remove / replace / add an element (produces a new attempt, D27)
* Approve/reject attempt
* Set active attempt
* Duplicate node
* Delete node
* Connect output downstream

#### Output

* Generated image attempts stored inside the Image Gen node

#### Data shape

```
Image Gen node
- prompt input
- reference image inputs
- selected control values
- final compiled prompt
- edit instruction + intent (current working values, per node — D27)
- generation attempts (a fresh generation OR an edit of a prior attempt)
- per-attempt edit lineage: base attempt, instruction, intent, originating prompt version (D27)
- active output
- approval / rejection decision per attempt
```

#### Controls

The Image Gen node holds only **API-native** controls — those the image model accepts as
real parameters (e.g. aspect ratio, image count, seed, resolution). Descriptive aspects
(lens, lighting, palette, composition, mood) are **not** API parameters; they live on the
**Prompt node** as descriptive controls already baked into the prompt text (§11.5, §12).

Each image generation attempt stores: API-native control values used, prompt text used
(which already carries the descriptive controls), reference inputs used, final request sent
to model, model/provider, generated image output, error (if any), approval/rejection decision.

An image attempt typically resolves **synchronously** — the request returns the image directly —
but if a model is long-running it is tracked as an **in-flight job** that resolves to
output-or-error later; either way the attempt's state is durable and survives a page refresh. (How
generation executes: §20.)

**Editing (D27).** Beyond generating from a prompt, the Image Gen node can apply a **targeted
edit** to its current image — *remove*, *replace*, or *add* an element while preserving the rest.
An edit is a **new generation attempt in the same node's version log** — not a separate node, and
not an in-place overwrite (it runs the model, so by the versioning rule it is an attempt). The
base image is the active attempt (or a connected File/Draw reference when there is no attempt
yet); the operator types a short instruction (optionally via a Remove / Replace / Add
quick-action), and a deterministic preservation prompt is sent to an editing-capable model
(Gemini by default). Each edit records its base attempt, instruction, intent, and the originating
prompt version, so the whole refinement journey (generate → remove → add …) is one traceable,
restorable lineage — and each edit is independently approvable like any other attempt. Editing
reuses the same generate pipeline and execution substrate (§20); only the prompt is composed
differently. Full design: `docs/superpowers/specs/2026-06-28-image-editing-design.md`.

**Editing matured into a composer *(v3 — D37–D39, D101)*.** The focus view carries a
`Generate | Edit` tab pair. Three refinements are worth stating, because each reversed something
that looked reasonable:

* **The region travels in the model's native channel, not in pixels (D38).** OpenAI gets a real
  alpha **mask** that the operator paints, with the base image sent **clean**; Gemini gets **text
  only**. A `supportsMask` capability flag drives both the UI and the payload. The earlier approach
  — compositing the drawn marks into the base image — **reproduced the marks into the output**
  (a black scribble rendered onto the edited photo). That composite is retired.
* **The base is an explicit, persisted choice (D39).** It used to be `connectedImageNodes[0]` —
  the earliest node in the canvas list, which is roughly *creation* order, not connection order —
  so it reassigned invisibly as references were connected and could never be deliberately chosen.
  Now a hover **pin** sets it. A generated attempt always outranks a pinned reference; a pin only
  applies while its node is still connected, so the base is never dangling.
* **References are explicit: an empty selection sends nothing (D101).** Only ticked reference
  tiles are sent. Previously `[]` meant "unspecified → use everything", while the tiles rendered
  as *unselected* — so edits silently received references the operator never picked (observed as a
  product tin bleeding into an edit whose tile was visibly unticked), and "send no references" was
  literally unreachable. One value carried two contradictory meanings across the view/logic seam.
  **The Generate tab is unchanged** — there, all connected images remain references.

---

### 11.7 Video Gen node

#### Purpose

The Video Gen node generates videos.

Base prompt text + image input + selected video control values
→ Final compiled prompt → Video model → Generated video attempts

#### Inputs

* Motion prompt from the **Motion Prompt node** (or inline text as a quick-test fallback)
* **Shot spine images**, each connected image assigned a **role** — `start_frame`, `end_frame`, or
  `reference` (D95)
* Selected video control values, **per provider** (Veo · Sora · Kling)

No uploaded video reference input in MVP.

#### The shot spine *(D95 — the defining v3 change to this node)*

The focus view **leads** with the spine — **Start → End | Reference**, in narrative order — which
reports which roles are filled and what duration the combination yields.

* A missing end frame is an **empty slot at rest** — never an error, never a block on Generate.
* Slots the selected model **cannot** use are shown as `unsupported` rather than omitted, so
  absence stays legible.
* The spine is **read-only**: roles are assigned from the connected thumbnails, so its slots are
  status pips — deliberately *not* the dashed-primary + plus treatment this codebase reserves for
  Add affordances.

**Why lead with it.** The economics: an image costs ~$0.067 against **$0.40–$4.20 for a video
re-roll**, so composing an end frame is **6–63× cheaper** than re-rolling until the motion comes
out right — and it forces the operator to decide what the action actually *is*. That is an
opinion, so the layout **states** it rather than a rule enforcing it. Requiring an end frame, or
confirming on the way to Generate, were both rejected: they make an opinion feel like a defect.

An end frame is **derived by editing the start frame**, not generated fresh (D96) — interpolation
morphs in proportion to how far apart the two frames are, so a freshly generated "ending" is a
different scene and the model tweens between two strangers. An edit keeps scene, lighting and
subject, and moves only what should move. *(The one-click "Create end frame" button was removed
2026-08-02 pending a fuller treatment; the derivation path itself remains.)*

#### Actions

* Connect prompt input
* Connect image input
* Edit selected control values
* View final compiled prompt
* Generate video
* Approve/reject attempt
* Set active attempt
* Duplicate node
* Delete node
* Archive final output

#### Output

* Generated video attempts stored inside the Video Gen node

#### Data shape

```
Video Gen node
- prompt input
- image input
- selected control values
- final compiled prompt
- generation attempts
- active output
- approval / rejection decision per attempt
```

#### Controls

Controls are **per model, not shared across providers** (D99). Veo, Sora, Kling 3.0 and Kling O1
each declare their own capability descriptor — image inputs, parameter set, and rule list. There is
no single shared shape, because their reference mechanisms differ *in kind*: Kling 3.0 uses an
`element` registry while Kling O1 takes inline `refer_image` images, and one shape can only ever be
wrong for one of them.

Example controls: duration, resolution, aspect ratio, audio, multi-shot. Veo exposes a
**resolution** select (720p/1080p) priced per Google's own per-resolution rates (D102).

Two rules govern how those controls reach the model — both written after real generations were
wasted:

* **The API route rejects violations; it never auto-corrects (D97).** Constraint rules are checked
  in the UI *and* re-checked server-side as a **400-returning backstop**. The server's check is
  **stricter** — it counts references that actually resolved to URLs after upstream traversal, not
  roles merely assigned — and it runs **before** the generation row is inserted and before credits
  are reserved, so a rejected request records nothing and leaves the balance untouched. Auto-
  correcting silently changes both what the caller asked for and what they are billed. *13 Veo
  generations were spent on invalid reference/duration combinations before this existed.*
* **Locked values are written into params, not merely displayed (D98).** Rule-locked values are
  merged into the params that get **posted**, and every read — panel, cost estimate, request —
  goes through that one merged object. Previously the panel rendered the locked value while the
  posted params kept the stale one, so the UI showed a locked 8 and sent 6: **11 observed
  generation failures**, and a mis-quoted credit estimate alongside them.

Each video generation attempt stores: the model's capability descriptor + selected control
values, base prompt used, image inputs **and their spine roles**, final compiled prompt sent to
model, model/provider, generated video output, error (if any), approval/rejection decision.

> **Sourcing discipline for provider limits.** Kling's own docs return HTTP 446 to automated
> fetches, and third-party wrappers (fal.ai, WaveSpeed) publish *narrower* values than the live
> endpoints accept — sourcing O1's limits from a wrapper produced the wrong duration, audio and
> resolution sets. Provider parameters are pinned to **what the live endpoint actually accepts**,
> verified against official docs pasted in by hand (D81, D100).

Video generation is **long-running and asynchronous**: an attempt is submitted, tracked as an
**in-flight job**, and resolves to output-or-error later (the provider is polled — no callback). Its
state is durable and survives a page refresh, so the operator can leave and come back to a finished
clip. (How generation executes: §20.)

---

### 11.8 Post node  *(v3 — D116–D136)*

#### Purpose

The Post node lays copy and brand material over a generated plate, producing the thing that
actually ships to a client.

Connected image (the plate)
+ text / shape / image / icon layers
+ Brand Kit material + AI-written caption
→ Composed post → client approval → publish

Full product rationale: `docs/superpowers/specs/2026-08-03-post-prd.md`. Design specs for the
editor, components, approval and publishing sit alongside it.

#### The scope rule

> **Anything that only makes the *editor* better is out. Anything that makes the *pipeline*
> smarter is in.**

This is written down because the first feature request after launch will be a drop shadow, and the
one after that will be image filters, and each is individually reasonable. Canva wins that race;
every hour spent on it is an hour they already spent better. **Explicitly never:** stock libraries,
illustration packs, filters, effects, blend modes, freeform drawing, text-on-curve.

#### Inputs

* A connected **generated image** (Image Gen) or uploaded image — the plate
* **Brand Kit** material: colours, logos, backgrounds, products (§6)
* The client's **KB compliance rules** (banned words/claims, tone, disclaimers)
* Operator-typed on-image copy

#### Editor shape

* **Left chrome is one 56px icon rail** (Templates · Elements · Text · Connected · Layers) opening
  a **single shared 256px flyout**. One panel shell means one width, one scroll behaviour, one
  empty state — and it matches the mental model every designer already has from Canva. The panel
  **stays open** while working, so placing three icons in a row doesn't mean re-opening it three
  times (D116).
* **Layer properties live in a fixed right inspector**, normalised per layer kind (D119).
  Inspector controls are **visual, never raw values** (D125) — a designer picks a weight, not a
  number.
* **Four layer kinds:** text, shape (solid or gradient — a gradient shape is how a **scrim** is
  made, because light text over a busy plate is unreadable without one), image, icon.
* **A post opens on a clean canvas** (D117): the operator sees their own image first, with the
  Templates panel open but **no template ever applied without an explicit click**. The
  auto-opening template modal was deleted — it forced a template decision before anything was
  visible.
* **Templates: 14 compositions across three aspect bands** (D124), named by *composition* (Lower
  third, Inset card, Side column, Split half) and tagged by purpose. Composition is what decides
  whether a template fits the plate you have; purpose doesn't. Applying one **always confirms**
  and **always preserves connected images** (D118) — it is the one destructive action in the
  editor and it sits one click away.
* **Format is a Size rail panel with friendly labels only** (D122); font size is measured against
  the canvas's **shorter edge** (D123) so type holds its proportion across formats.
* **Undo covers format and template changes, not layers alone** (D127) — the operations most
  likely to be regretted are exactly the structural ones.
* Newly added layers **cascade instead of stacking** (D128), so three added icons are three
  visible icons rather than one apparent icon hiding two.
* The node **card previews at true aspect ratio** and reports real render state (D126).

#### Copy & compliance

* **Caption and hashtags live on the post**, not in a publish dialog — the client approves artwork
  and caption as **one thing**. An offer's terms, price and claims live in the caption.
* Caption + hashtags are **AI-generated one-shot** from brand tone, compliance rules, evergreen
  tags, the connected brief and the rendered artwork itself; hand-editable afterwards. Metered
  against credits like any other model call.
* **Compliance warns and never blocks** — not export, not publish, not even a banned word. *A tool
  designers are told to use, which also refuses to let them export, gets routed around. Warnings
  that are always right are worth more than a block that is occasionally wrong.* Text contrast is
  flagged advisory with "add a scrim" as a one-click fix.
* Post copy is the **only text in the pipeline a human writes by hand** — every other text is
  model-generated under brand compliance constraints — and it is the text that publishes at full
  size on the client's own account. That asymmetry is why compliance checking exists here at all.

#### Language

English and Tamil. Every font offers a **Tamil companion** with visible fallback, because a
brand's Latin font has **no Tamil glyphs at all**. *Accepted V1 risk: a missing glyph renders as
empty boxes in both preview and export, and V1 will not catch it.*

#### Output

* A rendered post image that **matches the preview exactly**, exportable at print resolution
  (A4 / 300 DPI), always reflecting the current composition rather than a stale render
* Caption + hashtags
* Approval state (client-facing shared link — approve or comment)
* The render is available to the rest of the canvas like any other image

---

## 12. Master controls and the final compiled prompt

Controls are a standard, learned set — **not** dynamically invented by the model. They split
by whether the generation **API** accepts them as parameters:

* **Descriptive controls** — finer image/video aspects the API does *not* accept as
  parameters (lens / focal length, lighting, colour palette & brand-hex, film stock,
  composition, mood). These can only be expressed as **prompt text**, so they live on the
  **Prompt node** and are baked into the compiled prompt. Set values, with defaults derived
  from shot type / Brand KB.
* **API-native controls** — those the model accepts as real parameters (image: aspect ratio,
  count, seed; video: motion preset, duration). These live on the **Generate node**
  (Image/Video Gen) and are passed to the API alongside the prompt.

For both kinds: **master schema** = shared allowed fields; **node** = selected values;
**attempt** = snapshot of the values actually used.

### Rule

* Prompt node owns the **base prompt text + descriptive controls** → composes the compiled
  prompt: `LLM(subject · scene · composition)  +  descriptive control clauses`.
* Generate node owns the **API-native control values** + references + model settings.
* The request to the model = compiled prompt (descriptive controls already inside) +
  API-native controls.
* Every attempt snapshots the exact schema versions + selected values used.

The final compiled prompt must be visible **before generation** — in the Prompt node (the
descriptive composition) and in the Generate node (the request actually sent).

> **Why this split** *(refines the earlier "all controls on the Generate node" model)*. The
> image API has no "lens" or "lighting" parameter — those affect the image only as words in
> the prompt, so descriptive aspects must be controlled where the prompt is authored (the
> Prompt node) or the model invents them and they homogenise. Evidenced by eval Run 01 (every
> prompt collapsed to one lens/lighting/palette template) —
> `docs/evals/2026-06-14-run-01-prakriti-image-prompt-bootstrap.md`.
>
> **Context, not just controls (D23).** Reading the same Run-01 traces showed a *second* homogeneity
> driver in the **input**: the Shot context fed the model the whole reel script, whose
> `strategic_objective` told every VISUAL shot, identically, to be "slow luxury cinematic" (and whose
> caption/title re-asserted the brand tone the KB block already carries). A Shot now passes only its
> **visual description + production medium** to an image prompt (D23); the reel's audio/marketing/
> overlay copy is dropped. This is orthogonal to the controls split above and is measured separately
> via the frozen eval harness (Run-02).

---

## 13. Versioning and learning principle

Versioning is part of the MVP because CreativeOS should help the studio learn how better
assets are created.

**Version meaningful AI-assisted attempts, not every edit (D18).** A version row is created
only when a model runs. A manual edit to an AI-produced output is saved **in place on the
active version** — it does not create a new row.

| Node | Version created when |
| :---- | :---- |
| Script node | User clicks **Extract** / **Re-extract** |
| Brief node *(when built)* | User clicks **Parse** |
| File node | User clicks **Process** with Use LLM on |
| Prompt node | User clicks **Generate** |
| Image Gen node | User clicks **Generate image** |
| Video Gen node | User clicks **Generate video** |
| Shot node *(Compose — D28)* | User clicks **Compose** — the run is captured as a version row (frozen `generated_output`) but is **never made active**; the Shot's output stays its own `data.script` |
| Post node *(v3)* | User clicks **Generate caption** — the copy run is an attempt like any other, metered against credits |
| Generation attempt | User approves or rejects a specific attempt |

#### What is not versioned separately

* Schema edits
* Control edits
* Input connection changes
* Inline file changes
* Brand-KB slice toggles
* Manual edits to an AI output (saved in place on the active version — D18)
* Keystrokes

These are captured inside the next versioned attempt, or (for manual output edits) folded
into the active version.

Example:

User edits slices/schema → User clicks Extract → the parse version stores the slices/schema used.

Example:

User edits controls → User clicks Generate image → the generation version stores the controls used.

Example:

User hand-edits a parsed field → User clicks Save → the **active version's output** is updated in place (no new row, no model call).

---

## 14. Default MVP flow

Create client (with a ready Brand KB)
→ Create canvas
→ Add or parse **reel script**
→ **Fan out shots** (one Shot node per shot — D21)
→ *(optional)* **Compose variations** on a shot → pick one / promote siblings (D28)
→ For each shot: Generate image prompt (from the shot + KB)
→ Generate image
→ Approve image attempt
→ Generate or refine video prompt
→ Generate video
→ Approve video attempt
→ Archive project

Canvas view:

```
KB node (seeded) ─┐
Script node ──────┴→ (fan out shots) → Shot node ×N
   each Shot node
   → Prompt node: image prompt
   → Image Gen node                    ← start frame
       ├─(edit)→ Image Gen node        ← end frame (D96)
       └────────→ Post node            ← the post branch (v3)
   → Motion Prompt node
   → Video Gen node  (spine: start · end · reference)
→ Archive project action  (assembles the N approved clips, in shot order)
```

**The post flow *(v3)*.** A canvas no longer has to end in a clip. From any approved still:

```
Image Gen (approved plate)
→ Post node        (pick format → optionally a template → compose copy + brand)
→ Generate caption + hashtags
→ Compliance check (warns, never blocks)
→ Share for client approval   (link; approve or comment)
→ Publish                     (Instagram · Facebook · LinkedIn)
```

Reels and posts are **siblings off the same plate**, not alternatives chosen up front — the same
generated image can feed a Video Gen node and a Post node from the same canvas.

---

## 15. Manual alternatives instead of branching

MVP does not include automated branching.

Not in MVP: branch action, auto-rewiring, automatic alternate state, branch labels, graph
intelligence deciding the active path.

Instead:

Duplicate node → change prompt, input, reference, or controls → generate again → compare
outputs → manually connect preferred output downstream.

This keeps the system predictable and gives designers full control.

**Shot fan-out (D21) is consistent with this.** "Fan out shots" is a **manual, human-triggered**
bulk action — the §15 "duplicate" philosophy applied to a script's shots. It creates Shot **nodes**
only (no edges, no auto-rewiring) on an explicit click; the designer still wires each `Shot →
Prompt → Image` themselves. The system never auto-branches or runs the graph — the human remains
the scheduler (D11).

---

## 16. Archive behavior

Archive is not a node in MVP. It is a canvas-level project action.

Approved final video + approved image + **parsed script** + prompts + controls + metadata
→ Archive / Complete project → Write project bundle

Archive bundle shape:

```
archive bundle
- parsed script data
- original script file
- approved image
- image generation attempts
- approved video
- video generation attempts
- prompt versions
- controls used
- final compiled prompts
- Brand-KB version(s) referenced
- metadata
```

---

## 17. In scope

The MVP includes:

**v3 additions** *(see §0.1 for the full changelog)*

* **Organizations + Supabase Auth** — invite-only login, org-scoped data with default-deny RLS,
  `/admin` surfaces, audited impersonation with a read-only default (D42–D53, D77–D89, D139–D141).
  Own PRD: `CreativeOS Multi-Tenancy Pilot PRD.md`
* **Post node** — compose copy/brand over a generated plate, AI caption + hashtags, compliance
  warnings, client approval by link, publishing (D116–D128)
* **Brand Kit** — client-level logos, backgrounds, products, details; colours derived from the KB
  (D129–D135)
* **Credits** — pre-generation estimates on Prompt / Image Gen / Video Gen + an append-only ledger
  with atomic reservation against a monthly org cap (D77, D92, D93)
* **Multi-provider video** — Veo 3.1 (Lite/Fast/Quality) · Sora 2 · Kling (3.0, O1), uniform
  text-camera, preservation-first motion prompt, per-model capability descriptors (D78–D81,
  D90, D99–D102)
* **Start + end frame shot spine** on Video Gen, with server-side rule rejection (D95–D98)
* **Eval workbench** at `/eval/[canvasId]` — per-node, all-version error analysis with a named Δ
  (D94)
* **Gallery drawer** — right-side, stays open, References / Assets / Moodboards, drag-onto-node
  (D41)
* **In-app Help** — pull-based chaptered video explainers + list empty states (D143–D148)
* **KB node** seeded on every canvas alongside a connected Script node

**From v1–v2**

* Client workspace
* Client **Brand KB** (versioned; documents + brand-image analysis; readiness gate)
* **Client Moodboards** — named, reusable reference-image collections per client, filled by a **browser capture extension** (right-click → "Add to moodboard") and by in-app add-by-URL, browsed in a **Moodboards tab** of the Gallery drawer, and **dragged onto the canvas as File nodes** (re-hosted to storage on use). Stored **URL-first** (D92)
* Canvas/project workspace
* **Script node** for parsing finished reel scripts (`.md`/`.txt`/paste)
* **Brief node** for parsing upstream briefs *(planned — defined node type, retained for later; not built in Stage 1)*
* Text node
* **Shot node** (created by **"fan out shots"** from a parsed Script — D21; incl. **Compose variations** — role-aware divergent idea generation per shot, capture-only — D28)
* File node for `.txt` and image references (incl. **paste image from clipboard** onto the canvas)
* Prompt node
* Image Gen node (incl. **image editing** — targeted remove / replace / add on a generated or reference image, as a new attempt — D27)
* Video Gen node
* **Generation Tray** — a flat, canvas-scoped, **navigation-only** shelf of long-running image/video generation jobs (**Running / Ready / Failed**); clicking an item flies the canvas to the generation node and opens its focus view. Derived on read from the `generations` job table; image gen joins the substrate (D35)
* **Guided next-node flow** — a contextual **"Create next"** CTA on each pipeline node that creates + connects + places + opens the next node (Shot → image prompt → Image Gen → video prompt → Video Gen); never auto-generates, idempotent (navigates to an existing next) (D36)
* Shared master controls for image and video generation
* Selected control values inside Generate nodes
* Final compiled prompt visible inside Generate nodes
* Version history for AI-assisted attempts
* Approval/rejection of generated attempts
* Archive/project completion action

---

## 18. Out of scope for MVP

The MVP does not include:

* Full reel editing
* Timeline stitching
* Multi-scene reel sequencing
* Audio syncing
* Captions/subtitles
* Social post scheduling
* Brochure generation
* Static post generation
* Automated branching
* Auto-rewiring
* Separate Image node
* Separate Video node
* Separate Generated Image node
* Separate Generated Video node
* Output/archive node
* KB node on canvas (the Brand KB is a client-level surface, not a canvas node)
* Uploaded video references
* `.docx` / `.pdf` script extraction (deferred — D15) *(PDF image extraction → §21 F3)*
* Vector DB/RAG (the context "% slider" is parked until a KB outgrows the window)
* Moodboard **thumbnail caching, add-time re-hosting, dedup, and shot→reference vector search** — deferred, each a clean additive column + write-path later (D92) *(→ §21 F6)*
* Moodboard **board sharing across clients**, curation/reordering beyond add/remove, and auto/shot-aware reference suggestions (D92)
* **Auth on the moodboard endpoints** — the extension-facing routes are open, consistent with the app's deferred-auth posture *(→ §21 F1)*
* Automated taxonomy mining
* Advanced graph intelligence
* Automatic prompt improvement from history

**Post node — deliberately deferred to V2** *(the scope rule, §11.8)*

* Campaign fan-out (one composition re-fitted across every format)
* Layout-aware round trip (picking a template regenerates the plate to fit its copy zone) — *the
  thing Canva structurally cannot do, because it doesn't own the generator*
* AI-generated **on-image** text (V1 generates caption + hashtags only)
* Org-authored templates; per-network captions; regenerate/compare copy variants
* Indian scripts beyond Tamil; glyph-coverage checking
* Pin-anchored approval comments + notifications; scheduling, carousels, video posts

**No longer out of scope** *(shipped in v3 — moved here from the v2 list)*

* ~~Client-facing access~~ — clients now approve posts via a shared link (§11.8)
* ~~Multi-tenant auth~~ — shipped (D42–D53); F1's auth half is closed
* ~~Multi-model picker~~ — video is multi-provider (Veo · Sora · Kling); image gen selects between
  editing-capable models

---

## 19. Success criteria

The MVP is successful if an internal designer can:

1. Create a client (with a ready Brand KB) and a canvas.
2. Add a **reel script** and parse it into structured, editable fields.
3. Add `.txt` or image references.
4. Generate an image prompt from the parsed script and client context.
5. Generate multiple image attempts from the Image Gen node.
6. Approve one image attempt.
7. Use the approved image to generate or refine a video prompt.
8. Generate multiple video attempts from the Video Gen node.
9. Approve one video attempt.
10. Archive the project with all relevant scripts, prompts, controls, attempts, and metadata.
11. Review the history of how each output was created.

The output should be at least comparable to the current manual process, while reducing tool
switching and making iteration history clearer.

### v3 additions to the bar

The MVP criteria above are necessary but no longer sufficient. v3 succeeds if:

12. **An external agency** signs in and works entirely inside its own Organization, with **zero
    visibility into any other org's data** — rows, files, or realtime events.
13. Yuvabe can **see and cap** what each org consumes, and invoice from real ledger numbers.
14. A designer takes an approved still to a **finished, on-brand post** — copy, brand colours,
    logo, caption, compliance check — **without opening Canva**.
15. A client **approves that post from a link**, seeing exactly what will publish, without an
    account and without learning a tool.
16. A reviewer opens the **eval workbench** and can answer *"what did the human change between
    v2 and v3, and did it help?"* without reading code or database rows.

---

## 20. Open technical questions

This PRD should lead into these engineering questions. Several are now **answered** by the
ADR log in the staging roadmap (referenced inline):

* How is the canvas JSON structured? *(nodes/edges as plain data arrays → Supabase tables — D1, D10)*
* How are nodes stored? *(uniform columns for machinery + JSONB `data` for per-type content — D10)*
* How are node connections stored? *(edges table: `source_node_id`/`target_node_id` + handles — D8; built in Stage 2)*
* Does a connection point to the active output or a specific version? *(follows the source node's active version by default — D8)*
* How do Generate nodes expose active outputs downstream? *(via the active-version pointer — D5)*
* How are parse/process/generate versions stored? *(one append-only `node_versions` table, uniform envelope — D4)*
* Where are files stored? *(object storage; DB stores only the path — D13)*
* How are client Brand KB and files selected inside nodes? *(ambient FK walk to the active KB version; selectable slices — D6, D17)*
* How is the final compiled prompt generated and displayed? *(pure `compile` step, visible before generation — D3)*
* How are master controls stored and versioned? *(shared schema; selected values on the node; snapshot per attempt — §12)*
* How do we detect stale downstream outputs when upstream inputs change? *(derived on read: compare upstream active-version id vs the id recorded in the downstream attempt's `inputs_used` — D9)*
* What is the minimum graph behavior needed for MVP? *(directed edges + cycle check + version-compare staleness; the human is the scheduler — D11)*
* Where does a node's output live? *(single source: the active version's `output`; no display cache — D19)*
* How is a generation executed — does the request block? *(two paths over one `generations` job row, chosen by **duration not modality**: **synchronous** when the model returns in-request (image today), **async** submit→reconcile→graduate when long-running (video); image & video share the substrate — D12/D25/**D26**. Full flows: `docs/architecture/2026-06-18-generation-execution-flows.md`)*

**Answered in v3:**

* How is tenant isolation enforced? *(layered: app-layer checks at the chokepoints **plus**
  default-deny RLS on every table; async workers re-validate a job's `org_id` before processing —
  D44/D78/D79/D88)*
* How is generation spend controlled? *(append-only ledger with atomic row-locked reservation
  before dispatch, settled on completion — D77)*
* How do provider differences reach the UI? *(per-model capability descriptors declaring image
  inputs, params and rules; no shared shape across providers — D99)*
* Where does a provider constraint get enforced? *(both ends — UI, then the API route as a
  400-returning backstop that never auto-corrects, running before the generation row and the
  credit reservation — D97)*

---

## 21. Future / Backlog

Items deliberately **not** in the MVP build, captured here so they can be turned into
project epics/tasks. Each lists current state, the backlog scope, and the trigger to pick
it up. These are *additive* to the MVP — none block the Stage 1–5 pipeline.

### F1 — Multi-user & access control  *(largely SHIPPED in v3)*

* **Now: shipped.** **Organizations** are the tenant boundary (D42), users **log in** via
  Supabase Auth (invite-only, D43), **default-deny RLS** covers every table (D88), two role axes
  exist (`platform_role` in the JWT, `org_role` on the membership — D50), memberships are a join
  table from day one (D49), and **impersonation** ships with an audit log and a read-only default
  (D139–D141). `useIdentity()` kept its API and swapped its internals exactly as D29 planned.
  Own PRD: `CreativeOS Multi-Tenancy Pilot PRD.md`.
* **Backlog (what genuinely remains):**
  * **Multi-seat orgs in practice.** The schema is membership-shaped and enforces one active org
    per user, but the pilot runs **one user per org** — multi-seat is untested in anger.
  * **RBAC with teeth.** `org_role` exists; almost nothing branches on it. Approval remains a
    *cosmetic* senior-only control (§22.2).
  * **Self-serve onboarding + billing.** Org/user creation is an admin UI (D82); invoicing is
    off-platform (D47/D77).
  * **Forced password change on first login** — deferred, not built (D84).
  * Promote the canvas lock's `editing_name` to a real `user_id`.
* **Revisit when:** a pilot agency needs more than one seat, or self-serve signup is on the table.

### F1b — Copilot: built, switched off

* **Now:** the copilot shipped in full (D54–D76) — server thinks / client acts / human gates
  (D54), three stateless calls per turn (D55), uuid-derived node ref handles (D56), @-mention
  grounding (D57), writes gated by blast radius (D63), and a **playbook runner** where human
  actions are first-class steps and generation steps always pause at an HITL gate (D67–D70).
  It is then **commented out of the canvas** (YUV-233) because the docked panel overlaps the
  Gallery drawer (D41) — so none of it is reachable by an operator today.
* **Backlog:** resolve the panel-vs-drawer layout collision and re-enable; then the deferred
  **parallel-run canvas matrix** (D62 — agreed direction, not built) and the per-shot
  "is this image good enough?" repair cell that D58 reserves as the *one* genuinely agentic loop.
* **Revisit when:** the layout conflict is worth an hour — this is the cheapest large capability
  in the backlog, because the work is already done and merged.

### F2 — Provenance for all analysis & parsing (quote/span-level)

* **Requirement:** every AI extraction / analysis must cite **where each field came from** —
  the source document/file **and the exact quoted text**, with page/section where available
  (*quote/span-level*, not just document-level).
* **Applies to:** the Client Brand KB, the Script node, the Brief node (when built), and
  File-node LLM processing — i.e. **any node whose output is model-derived from a source.**
* **Build on:** the existing `TraceableBrandKB` pattern — generalize it so *all* parse
  outputs are traceable. Store the provenance in the version envelope
  (`inputs_used` / `output`) so any field can be traced back to its source span on review.
* **Why:** trust, verifiability, and compliance — a reviewer (or an auditor) can confirm an
  extracted claim against the exact words it came from. Directly serves "learn from every
  attempt" (§4.4) and the compliance guardrails in the Brand KB.
* **Revisit when:** prioritised — the KB already has the traceable shape, so this is mostly
  *generalising an existing pattern* to the other parse nodes rather than net-new infra.

### F3 — Image extraction from PDFs

* **Now:** PDF analysis (Brand KB documents) is **text-only** — text is extracted from PDFs;
  images / figures embedded inside them are ignored.
* **Backlog:** also extract images / figures from PDFs (e.g. brand imagery inside a
  brand-guideline PDF) and route them into the same vision analysis used for uploaded brand
  images.
* **Relation to D15:** distinct from the `.docx`/`.pdf` *script-input* deferral (D15, §18) —
  this is about **enriching PDF document analysis with visuals**, not accepting PDFs as a
  Script/Brief input.
* **Revisit when:** brand context that only lives in PDF imagery (logos, colourways, layout
  references) is needed for generation quality.

### F4 — Collaboration: approval flow & per-node commenting

* **Now:** **maker-checker approval shipped as a flag (D29, §22.2)** — every attempt carries
  `pending → approved | changes_requested`, set by a senior in the focus view, shown as an
  on-canvas badge, with maker/checker attribution. **A canvas-level, read-only Review surface is
  now an approved design (D34; implementation pending)** — spec
  `docs/superpowers/specs/2026-07-02-production-review-mode-design.md`. It promotes the *fast
  review-workflow* half of this feature: a per-canvas **list→detail queue** at
  `…/canvases/[cid]/review` where a senior moves through a reel's prompts and generated outputs
  (Image Prompt · Motion Prompt · Image Gen · Video Gen), **approving / requesting changes inline**
  (reusing the D29 action) **without opening the editor** — decoupled from the D33 lock, and
  *mark-don't-block* (approval never triggers the next step; preserves D11). Still **not** built
  anywhere: gating, notifications, and **commenting**.
* **Backlog (still):**
  * **Review lifecycle that gates** — extend the D29 flag from "records sign-off" to a
    workflow (`submitted for review → …`) that can **block or flag** downstream wiring (lean
    *mark, don't block*, per D9/D21). The distinct reviewer role + badges already exist (D29).
    **D34 deliberately does not gate** (preserves D11); this is the deferred escalation.
  * **Cross-canvas / client-level review inbox** — D34 is per-canvas; a client-wide inbox that
    aggregates every reel is a later data-source swap on the *same* surface (`listReviewQueue(clientId)`).
  * **Submit-for-review lifecycle** — a `submitted_for_review` state + a junior "Submit" action so
    the queue shows only pushed items (D34 instead derives the queue from the existing D29 states).
  * **Per-node commenting** — a comment thread anchored to a node (and ideally to a specific
    attempt/version), with author, timestamp, resolve/unresolve, and `@mention`. The "where a
    designer changed the model output" diff (§4.4) and the comment thread together become the
    review record.
  * Notifications (in-app, later email/Slack) when review is requested or a comment mentions you.
* **⚠ Status correction (v3).** D34's review surface is **still not built** — no
  `…/canvases/[cid]/review` route exists. Approval works per-node and per-version; the list→detail
  queue does not. The ADR log's confident present tense reads as shipped; it is an approved design
  with no implementation, unchanged since it was recorded on 2026-07-02.
* **Partly answered by the eval workbench (D94).** A *different* axis of "review" did ship:
  `/eval/[canvasId]` lists every generated node grouped by action, shows the exact request sent,
  and names the **Δ between versions** by structured field comparison. That is the **quality /
  learning** axis (`decision` = Good/Bad + note); it is deliberately never written from the
  **sign-off** axis (`approval_status`), and it does not replace the review queue.
* **Depends on:** **F1 has now shipped**, so the blockers it named are cleared — comment
  authorship, `@mention`, and *enforced* reviewer roles are all buildable today. What is still
  cosmetic is the senior-only Approve control (§22.2): the role exists in the JWT, nothing gates
  on it yet.
* **To decide when picked up:** comment granularity (node vs. attempt/version), whether
  "changes requested" blocks downstream wiring or only flags it (lean **mark, don't block** —
  consistent with D9/D21), and notification channels.
* **Revisit when:** more than one person works a canvas, or an explicit sign-off trail is
  needed before assets ship to a client.

### F5 — Node grouping: colors & section containers

* **Now:** nodes live as a flat set on the canvas; the only structure is the edges between
  them. On a real reel (`1 script → N shots → N images → N clips`, D21) a fanned-out canvas
  gets crowded with no way to visually scope a shot's sub-graph.
* **Backlog:**
  * **Section containers** — a group/frame node that visually bounds a set of nodes (e.g. all
    nodes for one Shot), is labelled, and moves/collapses as a unit. React Flow supports this
    via parent/child nodes + a group node type (`reactflow.dev/learn` → sub-flows / grouping).
  * **Color tagging** — a per-node (and per-group) accent/label color for quick visual
    categorization (by shot, by status, by stage), within the Yuvabe palette — neutrals
    lead, accent used sparingly (AGENTS.md), so color is a *thin* tag, not a fill.
  * Collapse/expand a group to reduce visual load on large canvases.
* **To decide when picked up:** whether grouping is purely visual or also semantic (e.g. a
  Shot group that the archive bundle understands per-shot, §16), and how grouping interacts
  with the dashed Script→Shot lineage edges (D21).
* **Revisit when:** canvases routinely exceed a handful of shots and navigation/legibility
  starts costing the designer time.

### F6 — Searchable asset & file library

* **Now:** files and generated outputs are scoped to where they were made — client files,
  inline Prompt-node files (§9.3), and generated attempts living **inside** their Image/Video
  Gen node. Object storage holds the bytes, the DB holds the path (D13), but there is no
  cross-canvas, cross-client way to **find** a past asset. **Client Moodboards (D92, §6) are the
  first partial answer** for *inbound references*: a client's collected images are now findable in
  one place and reusable across canvases — but by **human browsing of a named board**, not search.
* **Backlog:**
  * A **library** surface that indexes every stored asset — uploaded references, parsed
    scripts, generated images, generated videos — across canvases and clients.
  * **Search & filter** by metadata already captured in the version envelope: client, canvas,
    node type, model/provider, approval state, date, and (later) tags. The capture discipline
    in §4.4 / §13 is what makes this index possible — this feature *surfaces* data already
    being stored.
  * **Reuse** — drag a found asset back onto a canvas as a File node / reference; "find the
    approved still I made for client X" without reopening the canvas.
  * Later: semantic / vision search over images (text-to-image-match), and prompt-text search.
  * **Shot → reference search over moodboards** (D92). The natural first target: **CLIP** is a
    *joint text–image space*, so a shot's visual description (text encoder) can retrieve moodboard
    images (image encoder) by cosine similarity — literally "find references for this shot."
    Readiness is already designed: nullable `embedding vector(D)` (`pgvector`, native to Supabase)
    with `embedding_model` + `embedded_at` so a model swap is a *versioned re-embed*, plus an HNSW
    index. The durable artifact is the **vector (~1–3 KB), not the bytes** — which is precisely why
    URL-first storage costs nothing here.
* **Depends on:** consistent metadata on every attempt (already required by §13) and durable
  object-storage paths (D13). Keyword/metadata search is the cheap first cut; vector/semantic
  search is a later layer (note the §18 RAG deferral still applies).
* **⚠ One time-sensitive caveat (D92).** A moodboard item can only be embedded **while its source
  URL is still live**. Items collected during the URL-only window whose URLs later rot are **not
  back-embeddable** — when F6 lands it can only embed going forward. The zero-loss mitigation is to
  switch on **add-time thumbnail capture** *before* the URL-only backlog grows large, so every item
  has a durable local copy to embed from later. This is the one deferral in D92 with a cost that
  grows with time rather than staying flat.
* **Revisit when:** the studio has enough accumulated assets that re-finding past work (or
  reusing an approved asset across projects) becomes a real friction — this is the payoff of
  the "learn from every attempt" capture (§4.4).

---

## 22. Identity, approval & multi-user editing *(shipped)*

Three capabilities were added after the original single-operator framing, promoting parts of
backlog **F1** (multi-user) and **F4** (approval flow) into the build.

> **v3: identity is no longer soft.** The 22.1 description below is kept because it explains the
> *seam*, but the seam has since been filled. Users **log in** (Supabase Auth, invite-only) and
> belong to an **Organization**; `useIdentity()` kept its API and swapped its internals — the
> single change D53 predicted. Approval and the canvas lock (22.2, 22.3) are unchanged in shape;
> they now sit on real identities.

### 22.1 Identity — from soft to real (D29 → D43/D53)

**What v2 shipped (superseded as the source of identity).** On first use the app asked
**"Who are you?"** — a name + role stored in `localStorage`, spoofable by design, an audit trail
rather than a login. Its purpose was to fill the `operator` / `approved_by` seam D14 reserved
without committing to auth.

**What v3 ships.**

* **Supabase Auth**, invite-only; "Keep me signed in" honoured on every request.
* **Organizations** own clients; every access check reduces to "is this row in my org?" (D42).
* **Two role axes** (D50): `platform_role` in the JWT (Yuvabe super-admin?) and `org_role` on the
  membership (owner / member). One active org per user, enforced by a unique index; **the last
  owner of an org cannot be removed or demoted** (D80).
* **The DAL owns identity** (D51) — middleware/proxy checks are optimistic-only and never the
  authority.
* **A super-admin's normal app view is scoped to their own org** (D85). Cross-org visibility
  exists only in `/admin` and in impersonation — so the everyday view can't accidentally leak
  another tenant.
* **Impersonation** (D139–D141) is sticky session chrome with two distinct visual states,
  **read-only by default**; writes require explicitly entering elevated mode, and everything is
  written to an audit log. Operators read *"Enable editing"* — never *"elevated mode"*.
* **Enforcement is layered, not single-point**: app-layer checks at the chokepoints *plus*
  **default-deny RLS on every table** (D88, superseding D44's "app-layer only" half). Async
  workers **re-validate a job's `org_id` against the resource's current `org_id`** before
  processing (D79), and the generation-completion webhook is authenticated with a shared secret
  (D89).

> **One lesson worth keeping.** Enabling org-isolation policies was not sufficient on its own —
> a **pre-existing `anon_read_generations` policy silently defeated** the new isolation policy
> (D86). RLS policies are additive (`OR`), so one forgotten permissive policy nullifies a correct
> restrictive one. Adding a policy is not the same as securing a table.

### 22.2 Maker-checker approval (D29)

* Every LLM attempt (a `node_versions` row) carries an **approval flag**:
  `pending → approved | changes_requested` (default `pending`).
* Set from an **approval control** in each generating node's focus view (**Approve** /
  **Request changes** + note / **Reset**), writing to the **active version**. Because approval
  attaches to the *version* (D18), a **re-generate resets it to `pending`** — old sign-off does
  not carry to a new attempt.
* **Distinct from the eval `decision`** (pass/fail — the D22 quality/learning signal). An
  output can be "good but not signed off." One is never written from the other.
* Surfaced **on-canvas** as an approval **badge** on the node header, and per-attempt in
  version history.
* **Flag only.** It records sign-off; it does **not** gate downstream wiring, trigger the
  graph, or enforce RBAC. Gating / notifications / commenting remain backlog (**F4**).

### 22.3 Single-writer editing lock (D33)

The MVP is a **shared** internal workspace, so two people (or two tabs) can land on the same
canvas. Rather than merge concurrent edits, the canvas is edited by **one session at a time**:

* **Pessimistic lock.** Opening a canvas **acquires** the lock; a second opener is **read-only**.
* **Per-tab session key** (not per-person): even the *same* designer's second tab is read-only.
  This is the point — the bug the lock fixes was two sessions' autosaves clobbering each other.
* **Heartbeat + take-over-when-stale.** The holder refreshes a heartbeat every ~15s; a lock
  idle > ~45s is **stale** and a waiting viewer can click **"Take over editing."** Closing the
  tab releases it (best-effort; the TTL is the backstop).
* **Server-enforced.** The save path rejects writes from non-holders, so a stale or buggy
  client **cannot corrupt** the canvas.
* **Strict read-only for viewers.** No drag / connect / delete, no inline edits, no generation,
  no approval — a banner names the current editor. To act, take over the lock.
* Lock state lives on the `canvases` row (`editing_session_id` / `editing_name` /
  `editing_heartbeat_at`); staleness is **derived on read** (D9).

**Why pessimistic (not merge).** An earlier optimistic-merge autosave (superseded) let two
sessions fight — node positions oscillated and deleted nodes were resurrected. Preventing
concurrency at the source is simpler and correct for an internal tool. **Live co-editing**
(real-time presence, CRDT same-field merge) is deliberately future work.

> Full designs: `docs/superpowers/specs/2026-06-29-approval-flag-design.md` (D29),
> `docs/superpowers/specs/2026-07-01-canvas-pessimistic-lock-design.md` (D33),
> `docs/superpowers/specs/2026-07-02-production-review-mode-design.md` (**D34** — canvas-level
> read-only review surface; *approved design, still unimplemented as of 2026-08-16*). Auth:
> `CreativeOS Multi-Tenancy Pilot PRD.md` + `2026-07-21-auth-staging-rollout-plan.md`. Decision
> log: staging-roadmap §7.

---

## 23. Copilot *(built — currently disabled)*

A docked chat panel that drives the canvas by language. **Merged to `main`, then commented out**
(`canvas.tsx`, YUV-233) because it overlaps the Gallery drawer. Documented here because it is real
code with settled architecture, not a proposal — see §21 F1b for the path to re-enabling it.

### 23.1 The shape

* **Server thinks, client acts, human gates (D54).** The model only ever returns decisions,
  proposals and references; **all graph mutation happens client-side** through the canvas store's
  recipes. A confused model can propose, never mutate — which keeps the security *and* undo
  boundary in one place.
* **Three stateless calls per turn (D55):** prose (streamed), references (`json_schema`), actions
  (`tools`). Zero partial-JSON parsing; each call has exactly one job.
* **Node ref handles (D56, D66):** every node carries a stable, human-visible `TYPE-XXXX` handle
  derived from its uuid by a pure function — referenceable identity with **zero storage** that can
  never re-point. Chat, tools, @-mentions and elicitation all speak handles. Shown in every node's
  header; badges flip size at a zoom threshold rather than counter-scaling (D76).
* **@-mention is human-directed grounding (D57):** the human names the nodes that matter;
  resolution is client-side with zero model calls. The copilot never volunteers candidate pickers.
* **The copilot is the run's command bar, driver and narrator (D60)** — not a container you work
  inside. Language drives the existing nodes; **the canvas holds the work**, so it stays visible
  and editable in the graph the rest of the product understands.

### 23.2 Why it is a workflow, not an agent

> **The test: in a workflow you can number the steps before running; in an agent you can only
> number the iterations.** (D58)

The script → shots → image run is a **deterministic workflow**. Its steps are enumerable in
advance, so an autonomous planner adds latency and cost without benefit. Genuine agency is
reserved for exactly one place — the per-shot *"is this image good enough?"* repair cell, where
outcomes really are unpredictable — budget-capped and plugged into a single playbook step. Speed
comes from **workflow techniques** (parallelism, a language entry point, model-filled control
defaults), not from agency (D61).

Complex commands are **routed playbooks, not agent plans** (D67). Slot-filling is frame-based with
authored elicitation (D68); **human actions are first-class playbook steps** completed by a store
predicate (D69); and **generation steps always pause** at a human gate (D70) — preserving D11's
rule that the human is the scheduler. One run at a time, session-scoped; cancelling keeps whatever
nodes were created (D71).

---

## 24. Onboarding & in-app help *(v3 — D143–D148)*

### 24.1 Pull, not push

> Every V1 user gets a personalised live demo and has active tech support, so **the job is recall,
> not teaching.**

That single observation decides the whole design. Pushed onboarding fires when the user has intent
to *act*, shows once, and is then gone — the worst possible property for a recall aid. Pull-based
help is available at **every future moment of hesitation** and needs no per-user state, which is
why this shipped with **no new tables and no new columns**.

Two surfaces only:

* **List empty states** — a concept line plus one CTA, carrying the action.
* **A global `Help ▾` menu** — chaptered, video-led explainers opened on demand.

Nothing is pushed, sequenced, or fired on first view.

**Rejected, with reasons worth keeping:** first-view modals per screen (they need seen-state
infrastructure costing more than the onboarding it delivers at this user count); product tours and
tooltip sequences (**completion collapses from ~72% at 3 steps to ~16% at 7**); one long overview
video (linear, so it cannot convey the *shape* of a multi-step flow, and it is the wrong content
6/7 of the time).

### 24.2 Chapter shape

A chapter is **one two-pane screen** — a step rail beside the clip (D147) — from authored data in
`src/lib/help/chapters.ts`, never derived from the pipeline definition (D144). Deriving from
`GUIDED_CHAIN` was rejected on two grounds: it isn't trusted as a dependency for user-facing
content, and it **structurally cannot cover client creation, KB build and KB review — where the
worst friction actually lives**.

Unrecorded chapters are **hidden** (`draft: true`), not shown as "coming soon": promising absent
help is worse than silence when a human support channel is the fallback. Clips are committed to
`public/` and re-encoded rather than hosted in object storage (D148); navigation is client-side
`history.pushState`, never `router.push` (D146).

---

## 25. Cost, credits & metering *(v3)*

Generation costs real money, and v3 made that visible at both ends.

### 25.1 Before you generate — the estimate

Every generating node (**Prompt · Image Gen · Video Gen**) renders an **estimated credit cost
before Generate**. The estimate is a **static derived formula**, never a live vendor
token-counting call (D92) — and for image gen it is computed **client-side with no API route at
all** (D93). A pre-flight network round trip to price a request the user may not even send is cost
and latency for information a formula already has.

### 25.2 After you generate — the ledger

Spend lands in an **append-only `credit_transactions` ledger** (`reservation` → `consumption` →
`refund` / `adjustment`), scoped per org, with the month boundary pinned to UTC (D77):

1. `reserveCredits()` **locks the org's row**, sums this month's reservations + consumption, and
   rejects if the estimate would breach the org's limit.
2. On success the reservation **settles to actual cost** via a consumption row.
3. On failure or cancellation it is **zeroed by a refund row**.

**Why a ledger and not a counter.** The original design (D47) summed `credits_consumed` on read.
That cannot stop two concurrent requests near the cap from both passing, because nothing is
reserved until *after* the job runs. A row lock at reservation time closes the race, and an
append-only log gives reconciliation and future billing a real audit trail instead of one mutable
number.

Ordering matters and is deliberate: **validation runs before both `insertGeneration` and
`reserveCredits`** (D97), so a request rejected for breaking a provider's rules records no
generation and leaves the balance untouched.

### 25.3 Pricing discipline

Provider prices are **sourced, not estimated**. Veo's per-resolution rates were confirmed against
Google's own pricing page and corroborated by two independent sources before being encoded (D102);
Kling's tables were verified from kling.ai directly. Cost tables use **strict lookup with no
fallback** — an unpriced combination fails loudly rather than quietly billing a guess. A
resolution tier that cannot be priced is **not exposed** (O1's 4k, D100).
