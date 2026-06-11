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
* Output generated
* Approval/rejection decision

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
└── File node

Prompt nodes
└── Prompt node

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
| **File node** | Holds `.txt` or image references | File reference, image reference, optional extracted output |

> The **Script node** is *added alongside* the Brief node, not a replacement. A **brief** is
> upstream creative direction the system summarizes; a **reel script** is a near-final spec
> the system **extracts structure from**, so downstream nodes can address concrete fields
> (shots, on-screen text, voiceover, caption, CTA) directly. Stage 1 shipped the Script node
> first because the most concrete spec designers already hold is a finished script; the Brief
> node is retained for projects that start upstream (brief → generate script → parse).

### 7.2 Prompt node

| Node | Purpose | Output |
| :---- | :---- | :---- |
| **Prompt node** | Combines client context (Brand KB), connected inputs (incl. parsed script fields), inline files, and operator instruction into generated text | Text |

### 7.3 Generate nodes

| Node | Purpose | Output |
| :---- | :---- | :---- |
| **Image Gen node** | Generates images using prompt text, image references, and selected controls | Generated image attempts |
| **Video Gen node** | Generates videos using prompt text, image input, and selected controls | Generated video attempts |

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
* Image Gen output → Video Gen node

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
| Text node | Prompt node | Add notes, constraints, or instructions |
| File node: `.txt` | Prompt node | Use reference text |
| File node: image | Prompt node | Use visual reference for prompt generation |
| File node: image | Image Gen node | Use image as generation reference |
| Prompt node | Prompt node | Refine or transform text |
| Prompt node | Image Gen node | Use text as image generation prompt |
| Prompt node | Video Gen node | Use text as video generation prompt |
| Image Gen output | Prompt node | Use generated image for prompt refinement |
| Image Gen output | Video Gen node | Use generated image for image-to-video |
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
* `.txt` selected from client files
* Image selected from client files

#### Actions

* Upload/select file
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

The Prompt node creates the **base prompt text**. It does not own image/video generation
controls. Each Generate version stores the standard envelope (client context used,
connected inputs used, inline files used, operator + system instruction, model/provider,
generated text, timestamp, operator, optional note).

---

### 11.6 Image Gen node

#### Purpose

The Image Gen node generates images.

Base prompt text + image references + selected image control values
→ Final compiled prompt → Image model → Generated image attempts

#### Inputs

* Prompt text from Prompt node
* Optional image reference from File node
* Optional image output from another Image Gen node
* Selected image control values

#### Actions

* Connect prompt input
* Connect optional image references
* Edit selected control values
* View final compiled prompt
* Generate image
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
- generation attempts
- active output
- approval / rejection decision per attempt
```

#### Controls

The master image control schema is shared. Each Image Gen node stores the selected values
for that node. Example master image controls: aspect ratio, zoom, lighting, background,
position, palette, macro/detail direction.

Each image generation attempt stores: master-controls schema version used, selected control
values, base prompt used, reference inputs used, final compiled prompt sent to model,
model/provider, generated image output, error (if any), approval/rejection decision.

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

---

## 12. Master controls and final compiled prompt

Controls are a standard learned control set. They are not dynamically invented by the Prompt node.

The correct model is:

* Master controls = shared schema / allowed fields
* Generate node controls = selected values for this node
* Generation attempt = snapshot of values actually used

### Rule

* Prompt node owns the base prompt text.
* Master controls define the shared control schema.
* Generate node owns selected control values.
* Generation attempt stores the exact selected values used.

The Generate node combines:

Base prompt + selected control values + references + model settings
→ Final compiled prompt → Model call

The final compiled prompt must be visible in the Generate node before generation.

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
→ Generate image prompt (from parsed script fields + KB)
→ Generate image
→ Approve image attempt
→ Generate or refine video prompt
→ Generate video
→ Approve video attempt
→ Archive project

Canvas view:

```
Script node
→ Prompt node: image prompt
→ Image Gen node
→ Prompt node: video prompt / refinement
→ Video Gen node
→ Archive project action
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
* File node for `.txt` and image references
* Prompt node
* Image Gen node
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
