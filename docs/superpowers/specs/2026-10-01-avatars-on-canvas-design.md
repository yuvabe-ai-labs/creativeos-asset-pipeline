# Avatars on the canvas — part 1: the presenter of a script

**Status:** design approved 2026-10-01, revised the same day · **ADR:** D298 · **Builds on:** `2026-09-29-client-avatars-design.md` (the avatar itself, D287–D297) · **Continues in:** `2026-10-01-avatars-in-videos-design.md` (part 2, D299)

## 1. What this is

A client's avatars are made and kept in the Avatar Studio. This puts them on the canvas: an
**Avatars tab** in the gallery, an **Avatar node** dragged from it, and an **Avatar → Script**
connection that makes the avatar the script's **presenter**. Clicking the node opens a read-only
**focus view** with the avatar's preview clip and references.

**The presenter does not change the script.** The usual order is: write and parse the script,
then cast it. So connecting an avatar leaves the parse, its prompt and its versions exactly as
they are. The presenter is used when the script's shots are made into stills and videos — part 2.

### 1.1 Two parts, built back to back

| Part | Delivers | Spec |
|---|---|---|
| **1 — this spec** | Gallery tab, Avatar node + focus view, Avatar → Script, the presenter shown on the Script | This file |
| 2 | The presenter in the stills and videos: the face as a reference, the voice as Seedance's audio reference, Edit voice pre-selected, the model list limited | `2026-10-01-avatars-in-videos-design.md` |

Part 1 on its own shows a presenter that nothing uses yet, so the two are built back to back and
released together. Part 1 copies nothing onto shots: part 2 reaches the presenter through the
script that created each shot (`seededFrom.scriptNodeId` → that script's avatar edge), so the
graph stays the one source of truth. This matches the client-avatars spec §1: one avatar per
reel, attached to the Script node. The `feat/character-node` branch (per-shot Character nodes,
Kling elements) is still not the route.

### 1.2 Decisions taken in review (2026-10-01)

| Question | Answer |
|---|---|
| Scope | Two parts, designed now, built back to back |
| What the node connects to | Script only |
| Avatars per script | One presenter |
| What the node stores | The avatar's id only, read live (§3.1) |
| Focus view | Yes — read-only, preview clip and references (§3.3) |
| Effect on parsing | None. The script is usually parsed before it is cast (§5) |

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
- **Connect mode.** Opened from a Script's **+ Presenter** or **Change** (§5), the tab works as
  the image tabs do with `connectToNodeId`: choosing an avatar places it beside that script and
  connects it, then the drawer closes.
- **Empty.** "No avatars yet. Create one in Brand settings → Avatars", with a button that opens
  the client's avatar library in a new tab. With avatars, a footer link reads **Manage avatars**.

## 3. The Avatar node

### 3.1 What it stores: the id, read live

`type: "avatar"`, `data: { avatarId: string }`. Nothing else about the avatar is copied into
the node. `nodes.type` is plain text, so **no migration**.

The canvas reads the client's avatars through TanStack Query (D300, `src/hooks/queries/avatars.ts`)
— one cached list, the same the gallery tab shows — and every Avatar node renders from it. An avatar that is not in that list (archived since it was placed,
or never this client's) is fetched by id from `GET /api/clients/[id]/avatars/[avatarId]`, which
returns archived avatars and answers 404 for another client's. So a name, face or voice changed
in the Studio shows on the canvas without re-dropping.

*Rejected:* a snapshot of name, face and voice copied into the node on drop (like the KB node's
brand name) — Studio edits would never reach the canvas, and the two copies would drift. A
"Presenter" picker inside the Script node instead of a node — not what was asked, and it would
hide the presenter from the graph part 2 reads.

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
  edge, in the store's `onConnect` and `connectNodes` — beside the multishot rule already there —
  with one toast: "The new avatar is now this script's presenter, replacing the previous one." (As
  built: the store holds only avatar ids, not names, so the toast names neither; announcing it in
  the store means it is said once whichever path made the connection.) The gallery's drop and
  connect mode go through the same path. Connecting the avatar a script already has is a no-op.
- Wherever the presenter is read (§5 here, and part 2), if a script somehow has several avatar
  edges — older data, another path — the **newest** is the presenter.

## 5. The presenter on the Script

The presenter is read from the edge every time; nothing is written to the Script node.

**On the Script card.** The card is small — a header and "Open ↗". One row is added under it:

- **With a presenter:** a small round face, the name, and a muted "Presenter" label. Clicking it
  opens the Avatar node's focus view.
- **Without one, once the script is parsed:** a dashed primary **+ Presenter** chip — the house
  style for "add" actions. It opens the gallery on the Avatars tab in connect mode for this
  script (§2). Before the script is parsed the chip is not shown: casting comes after the script.

**In the Script's focus view,** a **Presenter** block near the top:

- **With one:** the avatar's face, name and voice line, and one line: "On-camera shots from this
  script use Riya's face and voice when they're made into stills and videos." **Change** opens
  the gallery in connect mode; **Remove** deletes the edge and leaves the Avatar node on the canvas.
- **Change** and **+ Add a presenter** close the focus view first, through its own close path (so
  its "Discard unsaved changes?" guard still applies), then open the gallery: the drawer cannot
  sit over a modal sheet.
- **Without one:** the **+ Add a presenter** chip and "Optional. The avatar whose face and voice
  this script's stills and videos use."

**Parsing is untouched.** Connecting, changing or removing the presenter does not re-parse, does
not change the parse prompt, and is not recorded on the parse's versions.

## 6. Failures

| Case | Behaviour |
|---|---|
| The avatar was archived after being placed | Still the presenter; the node, the card row and the focus views say "Archived — still works here" |
| The avatar is gone, or its id is not this client's | Not a presenter: the Script shows **+ Presenter** again, and the node shows "This avatar is no longer available" |
| The client's avatar list fails to load | The tab shows its error with a retry; nodes fall back to fetching by id |
| A second avatar is connected to a script | It replaces the first, with the toast (§4) |

## 7. Testing

- **Pure:** `canConnect("avatar", "script")` and its refusals; "the presenter of a script" — the
  newest avatar edge into it, none, several; the drag payload parsing, a malformed one ignored.
- **Store:** `onConnect` replaces an existing avatar edge into the same script and leaves other
  scripts' presenters alone.
- **Browser:** the checklist in the plan.

## 8. Out of scope

Everything in part 2. Avatars connecting to anything but a Script. Several presenters per script.
Editing an avatar from the canvas. Any effect on the parse.
