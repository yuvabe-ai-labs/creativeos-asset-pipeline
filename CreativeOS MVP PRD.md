# CreativeOS MVP PRD

## Canvas-based asset generation for reel production

[Figma board](https://www.figma.com/board/90dIUhXohYzzp0QKEYMUIq/Creative-OS---PRD-and-Mental-Model?node-id=0-1&p=f&t=LXtWkwPy3Rh0qzSA-0)

> **Document version: v2 (Script-node revision).** The first input node *shipped* is a
> **Script node** — it parses a *finished reel script* into structured, editable,
> asset-ready fields. The original **Brief node** (parsing an upstream brief into
> structured context) is **retained for later** — not built yet, not removed; it remains
> a defined MVP node type. See the **Changelog** below for what changed and why; build
> sequencing lives in `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md`.

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

Everything below the changelog is the full PRD with these changes applied. Sections
not touched by the Script-node revision (problem, principles, downstream Prompt/Image/
Video nodes, archive, scope) are unchanged in intent.

---

## 1. Product summary

CreativeOS is an internal canvas-based asset generation tool for a creative/marketing studio.

The studio creates many types of marketing assets, including reels, posts, brochures, campaign visuals, and product creatives. The long-term platform can support multiple asset workflows, but the MVP starts with a focused wedge:

**Help designers create the prompt, image, and video assets needed for a reel without switching between multiple AI tools.**

Today, designers step in and out of GPT, Claude, Gemini, OpenArt, and similar tools to generate prompts, image references, image outputs, and short video assets. This creates friction, repeated manual work, inconsistent output quality, and lost learning.

The MVP brings this workflow into one canvas:

Reel script / context / references
→ Prompt generation
→ Image generation
→ Video generation
→ Review, approval, archive

The MVP does **not** create full reels, stitch scenes together, handle timelines, or edit final videos. It focuses on producing the individual image/video assets needed for a piece of a reel.

The product keeps the original **Clients → Canvases → Nodes** foundation from the working CreativeOS direction, but simplifies the MVP by removing automated branching, auto-rewiring, and separate output nodes.

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

---

## 6. Information architecture

```
Client
├── KB (Brand KB — versioned)
├── Files
└── Canvases
    └── Canvas
        └── Nodes
```

### Client level

A client is the top-level workspace.

It contains:

* **Client Brand KB** (built early — see D17): a versioned, structured brand profile
  (tone of voice, personality, positioning) + a **compliance** module (words/claims/tone
  to avoid, preferred verbs/phrases, disclaimers), derived from uploaded documents and
  vision-analyzed brand images. The KB has an append-only version log, an active-version
  pointer, and a readiness gate (`pending → in_review → ready`).
* Client files
* Client references
* Canvases

Client-level context is reusable across canvases. A canvas (and its Script node) is only
reachable once the client's KB is **ready**.

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
**N** Note, **P** Prompt, **D** Draw, **I** Image Gen, **V** Video Prompt, **G** Video
Gen. Keyboard shortcuts are suppressed while a node's text field is focused, so typing
into a node never spawns a node. Other canvas shortcuts: **⌘/Ctrl + D** duplicates the
selection, **Backspace / Delete** removes it. When the clipboard holds an image, the
palette also offers **Paste image** (creates a File node at the cursor).

### Node level

A node is a working block inside the canvas.

Each node is understood by:

Inputs → Action → Output → History (if needed)

---

## 7. MVP node types

```
Input nodes
├── Script node      (shipped)
├── Brief node       (planned — retained for later)
├── Text node
├── Shot node        (created by "fan out shots" from a parsed Script — D21)
├── File node
└── Draw node        (experimental — in-canvas sketch → image)

Prompt nodes
├── Prompt node          (image/text prompts)
└── Video Prompt node    (motion prompts for Veo — D24)

Generate nodes
├── Image Gen node
└── Video Gen node
```

### 7.1 Input nodes

| Node | Purpose | Output |
| :---- | :---- | :---- |
| **Script node** *(shipped)* | Parses a **finished reel script** into structured, editable, asset-ready fields | Raw script text + structured reel-script JSON |
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
| **Video Prompt node** *(D24)* | Writes a **Veo motion prompt** for image-to-video: *vision-reads the approved Image Gen still* + shot action context + Brand KB, steered by **camera/motion master controls** structured from the Veo 3.1 guide (camera as a standalone clause, no scene re-description — the frame carries the visuals). Synchronous LLM; versioned like the Prompt node | Text (motion prompt) |

> The **Video Prompt node** is to *video* what the Prompt node is to *images*. It is a separate
> node (not a mode of the Prompt node) for canvas legibility and because a motion prompt has its
> own controls and grounds itself by **looking at the approved frame**. It feeds the Video Gen
> node. Inline motion text typed on the Video Gen node remains a quick-test fallback (D24).

### 7.3 Generate nodes

| Node | Purpose | Output |
| :---- | :---- | :---- |
| **Image Gen node** | Generates images from prompt text, image references, and selected controls — and **edits an existing image** (remove / replace / add an element) as a new attempt (D27) | Generated image attempts (incl. edits) |
| **Video Gen node** | Generates videos (image-to-video) from a **Video Prompt node's motion prompt** + the **approved Image Gen still** (start frame) + selected controls. Long-running async job (D25) | Generated video attempts |

---

## 8. What is not a node in MVP

These are not separate node types:

* Image node
* Video node
* Generated Image node
* Generated Video node
* Output node
* Archive node
* KB node *(the Brand KB is a **client-level** surface, not a canvas node — see D17)*

Important rules:

* Uploaded `.txt` or image reference = **File node**
* A finished reel script (pasted or `.md`/`.txt`) = **Script node**
* Generated image = output inside **Image Gen node**
* Generated video = output inside **Video Gen node**
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
* Image Gen output → Video Prompt node *(vision reference for the motion prompt — D24)*
* Image Gen output → Video Gen node *(start frame)*
* Video Prompt node → Video Gen node *(motion prompt)*

### 9.3 Inline files

Files attached directly to a Prompt node.

For MVP, inline files are limited to:

* `.txt` files
* Image files

Inline files are local to that Prompt node. They are not automatically added to the client KB or canvas.

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
| Prompt node | Video Gen node | Use text as video generation prompt *(fallback path; the default is via a Video Prompt node — D24)* |
| Shot node | Video Prompt node | Use the shot's **action / strategic objective** as the motion context (`renderShotForVideo`, D24) |
| Text node | Video Prompt node | Add motion notes or constraints |
| File node: image | Video Prompt node | Use an image as a style reference for the motion prompt |
| Draw node | Video Prompt node | Use a sketch as a style reference for the motion prompt |
| Image Gen output | Prompt node | Use generated image for prompt refinement |
| Image Gen output | Video Prompt node | **Vision-read** the approved still to ground the motion prompt (D24) |
| Image Gen output | Video Gen node | Use generated image as the **start frame** for image-to-video |
| Video Prompt node | Video Gen node | Use the generated **motion prompt** for the Veo job (D24) |
| Video Gen output | Archive action | Archive approved final output |

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

---

### 11.7 Video Gen node

#### Purpose

The Video Gen node generates videos.

Base prompt text + image input + selected video control values
→ Final compiled prompt → Video model → Generated video attempts

#### Inputs

* Prompt text from Prompt node
* Image reference from File node
* Generated image output from Image Gen node
* Selected video control values

No uploaded video reference input in MVP.

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

The master video control schema is shared. Each Video Gen node stores the selected values
for that node. Example master video controls: motion preset, camera move, duration,
lighting continuity, pace.

Each video generation attempt stores: master-controls schema version used, selected control
values, base prompt used, image input used, final compiled prompt sent to model,
model/provider, generated video output, error (if any), approval/rejection decision.

Video generation is **long-running and asynchronous**: an attempt is submitted, tracked as an
**in-flight job**, and resolves to output-or-error later (the provider is polled — no callback). Its
state is durable and survives a page refresh, so the operator can leave and come back to a finished
clip. (How generation executes: §20.)

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
Script node
→ (fan out shots) → Shot node ×N
   each Shot node
   → Prompt node: image prompt
   → Image Gen node
   → Prompt node: video prompt / refinement
   → Video Gen node
→ Archive project action  (assembles the N approved clips, in shot order)
```

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

* Client workspace
* Client **Brand KB** (versioned; documents + brand-image analysis; readiness gate)
* Canvas/project workspace
* **Script node** for parsing finished reel scripts (`.md`/`.txt`/paste)
* **Brief node** for parsing upstream briefs *(planned — defined node type, retained for later; not built in Stage 1)*
* Text node
* **Shot node** (created by **"fan out shots"** from a parsed Script — D21; incl. **Compose variations** — role-aware divergent idea generation per shot, capture-only — D28)
* File node for `.txt` and image references (incl. **paste image from clipboard** onto the canvas)
* Prompt node
* Image Gen node (incl. **image editing** — targeted remove / replace / add on a generated or reference image, as a new attempt — D27)
* Video Gen node
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
* Multi-model picker
* Vector DB/RAG (the context "% slider" is parked until a KB outgrows the window)
* Automated taxonomy mining
* Client-facing access *(→ §21 F1)*
* Multi-tenant auth *(→ §21 F1)*
* Advanced graph intelligence
* Automatic prompt improvement from history

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

---

## 21. Future / Backlog

Items deliberately **not** in the MVP build, captured here so they can be turned into
project epics/tasks. Each lists current state, the backlog scope, and the trigger to pick
it up. These are *additive* to the MVP — none block the Stage 1–5 pipeline.

### F1 — Multi-user & access control

* **Now:** single shared internal workspace, no login (D14); multi-tenant auth is out of
  scope for the MVP (§18). `node_versions.operator` is generic/empty.
* **Backlog:**
  * Supabase Auth (login / sessions).
  * Per-user / owner identity on clients & canvases.
  * Row-Level Security (RLS) once identities exist.
  * Stamp the real operator on every `node_versions` row.
* **To decide when picked up:** scope (separate accounts + per-user ownership vs. just a
  shared internal app with named operators) and timing.
  * *Cheapest-safe path:* keep the `operator` field and reserve an owner / `user_id` hook
    now, so adding accounts later is not a painful data migration.
* **Revisit when:** external / client-facing access is needed, or multiple designers need
  separate ownership / audit trails.

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

* **Now:** approval is a **single-operator, single-state** decision — an attempt is
  approved/rejected by whoever is using the canvas (§11.6–11.7), with no reviewer role,
  no request-for-review step, and no discussion thread. There is no commenting anywhere on
  the canvas.
* **Backlog:**
  * **Approval flow** — a real review lifecycle on a node/attempt: `draft → submitted for
    review → approved | changes requested`, with a distinct **reviewer** role separate from
    the operator who produced the attempt. Surfaced as node-level status badges on the canvas.
  * **Per-node commenting** — a comment thread anchored to a node (and ideally to a specific
    attempt/version), with author, timestamp, resolve/unresolve, and `@mention`. The "where a
    designer changed the model output" diff (§4.4) and the comment thread together become the
    review record.
  * Notifications (in-app, later email/Slack) when review is requested or a comment mentions you.
* **Depends on:** **F1** (real user identities) — a reviewer role, comment authorship, and
  `@mention` all require login + per-user identity. Build F1 first or in lockstep.
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
  cross-canvas, cross-client way to **find** a past asset.
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
* **Depends on:** consistent metadata on every attempt (already required by §13) and durable
  object-storage paths (D13). Keyword/metadata search is the cheap first cut; vector/semantic
  search is a later layer (note the §18 RAG deferral still applies).
* **Revisit when:** the studio has enough accumulated assets that re-finding past work (or
  reusing an approved asset across projects) becomes a real friction — this is the payoff of
  the "learn from every attempt" capture (§4.4).
