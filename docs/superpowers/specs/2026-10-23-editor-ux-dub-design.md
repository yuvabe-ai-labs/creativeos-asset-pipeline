# Rough Cut Editor: editing UX, dub and lip sync, Premiere export — design

*Decisions D402–D409 in the roadmap's ADR log (§7). Builds on the Rough Cut Editor (D388–D394)
and Auto captions (D411, D396–D401).*

**UX reference:** https://claude.ai/artifact/Axi8g4L6YMZbwEjyB9kVSE ("Editor UX v1"), approved by
the user on 2026-10-23 ("looks good, we can iterate further later"). Where this spec and the mock
disagree, this spec wins.

## 0. Why

The user's own pass over the editor found: actions unreachable on a laptop; playback stopping at
every cut; clip dragging that sticks at the timeline's edge; quiet sections hidden in a list;
nothing to do with a selected clip beyond trims; dubbing only possible on the canvas; no
right-click; fixed panels. Our audit added: empty thumbnails, no waveform, two time formats, no
zoom, a timeline that doesn't follow the playhead, no snapping. Premiere is where the user's
editors finish the cut, so the export must carry what they need to keep working.

Three parts, built and shipped in order: **A** editing UX, **B** dub and lip sync from the
editor, **C** Premiere export.

## Part A — editing UX

### A1. Playback plays through cuts (D402)
- An animation-frame loop drives the clock, as before Task 9 of Auto captions. The video frame
  callback only *reports* the presented frame's time (kept in a ref with the file it belongs to);
  the loop uses it when it is for the current file, else `currentTime`.
- Root cause fixed: the frame callback never fires on an ended (paused) element, so a clock that
  depended on it stopped at the first cut.
- The clock maths moves to a pure, tested `advanceClock` (current piece, file time, ended → next
  reel time, and whether to cross into the next piece).

### A2. Layout (D403)
- The page fills the viewport and never scrolls. Rows: header; top area (Sources | Stage |
  Inspector); a **divider**; the timeline.
- **Divider:** drag to resize the timeline (160 px to viewport − 260 px). The timeline body scrolls
  inside itself, so its header actions are always reachable.
- **Sources** and **Inspector** collapse to 34 px rails (chevron on the panel, the rail itself,
  **View** menu, Ctrl/⌘+1 and Ctrl/⌘+2). The stage takes the room.
- The View menu also has Bigger timeline, Bigger preview, Fit the reel.
- Panel and timeline sizes are remembered per browser (`localStorage`, wrapped in try/catch).

### A3. Timeline view
- **Zoom** 10–220 px per second: slider, −/+, Ctrl/⌘+wheel, Ctrl/⌘ +/−. **Fit** (Shift+Z) fits the
  reel. Zooming keeps the playhead where it is on screen.
- **Follows the playhead** while playing: when it leaves the view, the view pages to it.
- **Ruler:** click or drag to scrub. Clicking an empty spot on a lane seeks there and clears the
  selection.
- **One time format** everywhere: `MM:SS.ss` (`formatTime`). The Captions panel's `0:03.4` goes.

### A4. Dragging (D404)
- Clips move by **pointer dragging**, not the browser's drag-and-drop: a ghost follows the
  pointer, a drop marker shows where the clip lands, and the timeline **scrolls by itself** while
  the pointer is within 50 px of either edge.
- **Trims snap** to the playhead and to clip edges within 8 px (an orange line shows the snap), with
  a **Snap** toggle. A tooltip shows In/Out and length while dragging. Caption blocks get the same
  edge auto-scroll.
- Every drag is one undo step (D400).

### A5. Lanes
- **Video:** each clip shows a filmstrip of its own frames and badges (**DUB · Hindi**, **LIP**).
- **Audio:** a waveform per clip; **quiet stretches** are shaded on it. Click one to jump to it;
  right-click → Split around it.
- **Dub:** a segment per dubbed clip (dimmed when the clip plays its original sound); a moving
  stripe with "Dubbing…" / "Lip-syncing…" while one runs.
- **Captions:** as today.
- **Media reads:** frames are drawn from a hidden `<video>` per source into a canvas we only display
  (never read back), so no CORS is needed; loaded one source at a time, after the reel is on screen,
  and kept for the visit. The waveform and quiet stretches reuse the existing loudness read through
  the same-origin proxy (`useQuietWindows`), now fetched for every sound file on screen, two at a
  time, cached for the visit. Clips are under a minute, so each read is one small file once.

### A6. Inspector (D405)
- Nothing selected: the Captions panel (Text | Style), as today.
- A clip selected: tabs **Clip | Captions | Dub & lip sync**.
  - **Clip:** In / Out / Length; Picture (Original | Lip-synced); Sound (Original | Dubbed · lang);
    quiet stretches as seek chips; "Nothing is cut automatically."
  - **Captions:** that clip's lines (click to jump, click the words to fix them), and "Redo captions
    for this clip".
  - **Dub & lip sync:** Part B.
- A caption selected: the Captions panel on Text, as today.

### A7. Right-click menus
- **Clip:** Split at playhead (S) · Duplicate · Dub this clip… · Lip sync · Play the dub / original
  sound · Show lip-synced / original picture · Redo captions for this clip · Show on canvas ·
  Delete (Del).
- **Caption:** Edit text · Split at playhead · Delete.
- **Quiet stretch:** Jump to it · Split around it.
- **Ruler:** Fit the reel · Zoom in · Zoom out.
- Built on the shadcn context-menu primitive (added to `src/components/ui/` if missing).

### A8. Keys
Space play/pause · ←/→ one frame, Shift one second · Home/End · S split · Del delete · Ctrl/⌘+Z,
Shift+Z redo · Ctrl/⌘ +/− zoom · Shift+Z fit · Ctrl/⌘+1/2 panels · Esc deselect.

## Part B — dub and lip sync from the editor

### B1. A Dubbing node on the canvas, made by the editor (D406)
- "Dub this clip" on a clip whose source is a **Video Gen** node:
  1. The editor saves what it has (`flush`).
  2. `POST /api/canvases/[cid]/editor/dub-source { nodeId, sessionId, sourceNodeId }`: the caller
     must hold the canvas lock (`sessionId`), the Video Gen must feed this Editor. The route
     creates a **Dubbing node** on the canvas next to the Video Gen (to its right, between it and
     the Editor), wires **Video Gen → Dubbing → Editor**, removes **Video Gen → Editor**, and rewrites
     the saved edit: every piece of that Video Gen now belongs to the Dubbing node, with its trims,
     picture/sound choices and captions unchanged. Returns the editor state.
  3. The editor adopts the returned edit and sources (history is cleared: undo can't cross a canvas
     change), then starts the dub (B3).
- The Dubbing node is a normal node: visible on the canvas, with its versions and History. The user
  said it should be on the canvas, not hidden.
- A clip whose source is already a Dubbing node dubs that node (dub again, another language).

### B2. A Dubbing source plays its input until it has a dub (D407)
- `sourceDrafts`: a Dubbing node with no take yet is a source whose original file is its connected
  Video Gen's current take (no dub, no lip sync), with version id `input:<that version id>`. So the
  clips stay on the timeline, their transcripts (same file) still apply, and when the dub lands
  reconcile sees a version change and keeps the trims (D391).

### B3. Dub and lip sync may run from the editor (D408, refines D390)
- The dub and lip-sync routes take an optional `editorSessionId`. When the node feeds the Editor
  (the D390 lock), the start is allowed only if that session holds the canvas lock, i.e. it is the
  open editor itself. Every other client is still refused.
- **Dub tab:** step 1 **Dub**: Dub into (language), Translation style; "Dub clip · N credits"
  (`dubCredits`). Step 2 **Lip sync**: locked until there is a dub; "Lip sync · N credits"
  (`lipSyncCredits`). Voice, pace and presets stay on the canvas's Dubbing view (not needed here).
- While one runs, the Dub lane shows it, the tab shows progress, and editing continues. The editor
  polls the Dubbing node's generation status (the existing generation read) every 3 s while one is
  live, then re-reads the editor state once.
- When the dub lands, that source's pieces switch to **Dubbed** sound (one apply, with a toast
  "Use original"). When lip sync lands, they switch to **Lip-synced** picture.
- A note in the tab says: "Added a Dubbing node on the canvas, between VID-4BAA and the Editor."
- Failures show in the tab in plain words; credits are refunded by the existing tasks (D377).

## Part C — Premiere export (D409)
- **The choice not made stays in the sequence, switched off:**
  - picture: the lip-synced or original picture not chosen sits on its own video track above the
    captions, each clipitem `<enabled>FALSE</enabled>`;
  - sound: a clip that has a dub but plays its original gets the dub on A3/A4, switched off (today
    only dubbed clips carry the dub).
- **Markers:** each clip gets a clip marker naming what it is ("Dubbed · Hindi · lip-synced"); the
  sequence gets a marker for each pause longer than 0.6 s found in the clip's transcript ("Pause
  0.8 s"), so editors can find dead air. (Server-side quiet detection has no audio; transcripts
  are already stored per file, D411.)
- **README:** lists dubbed and lip-synced clips with their language, and which tracks hold the
  switched-off alternatives.

## Out of scope (later)
Disconnecting a dub from the editor (done on the canvas); voice/pace options in the editor; J/K/L
shuttle; multi-select; ripple-delete of quiet stretches; generating thumbnails on the server.

## Tests
- Unit: `advanceClock`; zoom/fit maths; snap targets; reorder index from a pointer position;
  `remapSource` (pieces and sources moved from the Video Gen to the Dubbing node); `sourceDrafts`
  for a Dubbing node without a take; the lock exception (session holds the lock / doesn't); Premiere
  alternates (disabled clipitems, track order) and markers; pauses from transcripts.
- Routes: dub-source (lock holder only; must feed the Editor; creates node and edges; rewrites the
  edit), dub and lip sync with and without `editorSessionId`.
- Manual (user's laptop): play Reel 2 through every cut; shrink the window; collapse panels; drag a
  clip past the edge; trim with snap; right-click everything; dub VID-4BAA into Hindi, then lip sync;
  see the Dubbing node on the canvas; export and open in Premiere: alternates switched off, markers
  present.
