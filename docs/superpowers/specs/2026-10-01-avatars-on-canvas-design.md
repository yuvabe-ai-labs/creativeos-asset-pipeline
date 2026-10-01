# Avatars on the canvas — part 1: the presenter of a script

**Status:** design approved 2026-10-01 · **ADR:** D298 · **Builds on:** `2026-09-29-client-avatars-design.md` (the avatar itself, D287–D297)

## 1. What this is

A client's avatars are made and kept in the Avatar Studio. This puts them on the canvas: an
**Avatars tab** in the gallery, an **Avatar node** dragged from it, an **Avatar → Script**
connection, and a script **parsed for that presenter** — its on-camera lines given to the
avatar by name, its visuals describing that person rather than an invented one. Clicking the
node opens a read-only **focus view** with the avatar's preview clip and references.

### 1.1 Two parts

| Part | Delivers | Spec |
|---|---|---|
| **1 — this spec** | Gallery tab, Avatar node + focus view, Avatar → Script, the parse using the presenter | This file |
| 2 — next | Shots and video nodes using the presenter: the face as the reference, the voice applied (re-voice for a named voice, `reference_audio` for the engine's own), the model list limited to what the avatar works with | Written once part 1 has been tried |

Part 1 copies nothing onto shots. Part 2 reaches the presenter through the script that created
each shot (`seededFrom.scriptNodeId` → that script's avatar edge), so the graph stays the one
source of truth. This matches the client-avatars spec §1: one avatar per reel, attached to the
Script node before shots are grouped. The `feat/character-node` branch (per-shot Character
nodes, Kling elements) is still not the route.

### 1.2 Decisions taken in review (2026-10-01)

| Question | Answer |
|---|---|
| Scope | Two parts, script first |
| What the node connects to | Script only, in part 1 |
| Avatars per script | One presenter |
| What the node stores | The avatar's id only, read live (§3.1) |
| Focus view | Yes — read-only, preview clip and references (§3.3) |

## 2. The gallery's Avatars tab

A fifth tab, after Signals: **References · Assets · Moodboards · Signals · Avatars**.

- **What it lists.** The client's avatars **in the library** (`status = ready`, not archived),
  newest first — the list `GET /api/clients/[id]/avatars` already returns, filtered to ready.
  Drafts are left out: an avatar is offered for use once it has been saved.
- **A tile.** The front image (3:4), the name, and the voice line — the named voice's name,
  "Engine's own voice", or "No voice". An add button on the tile places the avatar at the centre
  of the view, the same placement the image tabs use for their commit button.
- **Dragging.** A tile drags with its own payload type, `application/x-creativeos-gallery-avatar`,
  carrying `{ avatarId }` — separate from the image payload, so image drops are untouched.
  - Dropped on **empty canvas**: an Avatar node at the drop point.
  - Dropped on a **Script node**: an Avatar node placed beside the script, already connected to
    it (§4 — replacing any presenter it had). The script registers a node-level drop target for
    this payload, as image-taking nodes do for images (`useGalleryNodeDrop`).
  - Dropped on **any other node**: nothing is created; the node shows no drop affordance for it.
- **Empty.** "No avatars yet. Create one in Brand settings → Avatars", with a button that opens
  the client's avatar library in a new tab. With avatars, a footer link reads **Manage avatars**.

## 3. The Avatar node

### 3.1 What it stores: the id, read live

`type: "avatar"`, `data: { avatarId: string }`. Nothing else about the avatar is copied into
the node. `nodes.type` is plain text, so **no migration**.

The canvas loads the client's avatars once — the same list the gallery tab shows — and every
Avatar node renders from it. An avatar that is not in that list (archived since it was placed,
or never this client's) is fetched by id from `GET /api/clients/[id]/avatars/[avatarId]`, which
returns archived avatars and answers 404 for another client's. So a name, face or voice changed
in the Studio shows on the canvas without re-dropping, and the parse reads the same truth from
the database (§5).

*Rejected:* a snapshot of name, face and voice copied into the node on drop (like the KB node's
brand name) — Studio edits would never reach the canvas, and the two copies would drift. A
"Presenter" picker inside the Script node instead of a node — not what was asked, and it would
hide the presenter from the graph part 2 needs to read.

### 3.2 The card

A compact card in the node style the canvas already uses: the front image, the name, the voice
line, and one **output handle** on the right (it is a source only). The header menu carries
**Open in Studio** (new tab). States:

| State | Shows |
|---|---|
| Loading | A placeholder of the card's size |
| In the library | The card as above |
| Archived | The card, plus "Archived — still works here" (D287: what already uses an avatar keeps working) |
| Gone | "This avatar is no longer available" — deleted, or an id that is not this client's |

The node is **not in Quick Add**: it only makes sense with a chosen avatar, which the gallery
supplies. Copying, deleting and moving it work as for any node.

### 3.3 The focus view

Clicking the node opens its focus view, the full-screen `Sheet` every node's focus view uses.
**Read-only:** editing stays in the Studio, so consent, credits, staleness and the voice rules
are never duplicated on the canvas.

- **Header:** a back arrow, the avatar's name, its status ("In the library", or "Archived — still
  works here"), and **Edit in Studio** (new tab).
- **Left — the preview.** The avatar's latest voice-preview clip (D294, D296), playable, with the
  line it says and the voice it used; an **Out of date** badge when the face or the voice has
  changed since (`isVoicePreviewStale`). Without one: "No preview yet" and a link to make one in
  the Studio. A preview still generating shows the labelled placeholder the Studio uses.
- **Right — the references.**
  - The **front image** and, when there is one, the **profile sheet** — each opens in the shared
    full-screen zoom viewer (`FullScreenImageZoom`).
  - The **voice:** a named voice's name and labels with a play button for its ElevenLabs sample;
    or "Engine's own voice" with the saved **voice reference** audio (D296) when it exists; or
    "No voice".
  - The **background story**, when there is one.
  - **Works with** — the model names (`avatarWorksWith`, D297).

It reads the avatar as the card does, plus the latest preview from the existing
`GET …/avatars/[avatarId]/voice-preview`. **No new API.**

## 4. Connecting: one presenter per script

- `VALID_CONNECTIONS` gains `avatar: ["script"]` and nothing else: every caller of `canConnect`
  (manual drag, drag affordance, copilot, focus-view add) learns it at once.
- **One presenter.** Connecting an avatar to a script that already has one **replaces** the old
  edge, in the store's `onConnect` — beside the multishot rule already there — with a toast:
  "Riya is now this script's presenter, replacing Arjun." The gallery drop onto a script (§2)
  goes through the same path.
- The parse defends against older data or other paths: if a script somehow has several avatar
  edges, the **newest** is the presenter.

## 5. The script, parsed for its presenter

### 5.1 The presenter brief

`POST /api/nodes/[id]/parse` finds the script's connected avatar (the newest avatar edge into
it), loads it with `getAvatar(clientId, avatarId)` — archived avatars included — and builds a
short **presenter brief** with a pure function:

```
On-screen presenter (the avatar connected to this script):
- Name: Riya
- About them: Runs a small design studio in Bengaluru. Speaks warmly and quickly…
- Voice: female, Hindi, warm and conversational
```

- **Name:** the avatar's name.
- **About them:** the background story, omitted when empty.
- **Voice:** a named voice's labels (gender, language, accent, description) in plain words; for
  the engine's own voice, "the video engine's own voice"; omitted with no voice.

### 5.2 Where it goes, and what it asks

`compileScript` takes the brief as a new argument. It sits in the **system** message — it is
an instruction about the cast, not data to extract — in this order:

1. the extraction prompt
2. the client's brand and compliance context
3. **the presenter brief, with its instruction**
4. COMPLIANCE FIRST — still outranking everything below the client context, the presenter included
5. the market signal's mode instruction

The instruction, in `src/prompts/script-parse.ts`:

- A line the script puts **in the presenter's mouth on camera** gets `speaker: "{name}"`.
  Narration stays `"narrator"`, exactly as today.
- An on-camera shot's visuals describe **this presenter** — by name — rather than inventing a
  person.

The prompt's **version is bumped**. With no avatar connected, the system message is exactly what
it is today.

### 5.3 What is recorded, and what is not automatic

- The parse version's `inputsUsed` records `avatarId` and `avatarName` (null without one).
- The Script's focus view lists **Presenter: {name}** with its connected inputs, so the operator
  can see a re-parse will use it.
- Connecting, changing or removing the avatar **does not re-parse**. Parsing stays the
  operator's action, as it is for KB and signal changes.

## 6. Failures

| Case | Behaviour |
|---|---|
| The avatar was archived after being placed | Still the presenter; the node and focus view say "Archived — still works here" |
| The avatar is gone, or its id is not this client's | Left out of the parse; `inputsUsed` records no avatar; the node shows "This avatar is no longer available" |
| The avatar has no story or no voice | Those lines are omitted from the brief |
| The client's avatar list fails to load | The tab shows its error with a retry; nodes fall back to fetching by id |
| A second avatar is connected to a script | It replaces the first, with the toast (§4) |

## 7. Testing

- **Pure:** `canConnect("avatar", "script")` and its refusals; the presenter-brief builder (name
  only, with story, each voice kind); `compileScript` with and without a presenter, including
  the order of the system message's sections.
- **Store:** `onConnect` replaces an existing avatar edge into the same script and leaves other
  scripts' presenters alone.
- **Route:** the parse with no avatar (system message unchanged), with one (brief included,
  `inputsUsed` records it), with an archived one (still used), with a foreign id (ignored).
- **Payload:** the avatar drag payload parses, and a malformed one is ignored.
- **Browser:** the checklist in the plan.

## 8. Out of scope

Part 2 (§1.1). Avatars connecting to anything but a Script. Several presenters per script.
Editing an avatar from the canvas. Re-parsing automatically when the presenter changes.
