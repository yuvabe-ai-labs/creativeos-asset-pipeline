# Rough Cut Editor: design

*2026-10-20 · branch `feat/rough-cut-editor` · **approved by the user 2026-10-20** · ADRs
**D388–D394** in the roadmap's ADR log (§7): node and full page D388, TypeScript Premiere export
D389, generation lock D390, edit record under the canvas lock D391, server-side media facts and the
export task D392, caption titles and fonts D393, spike never merged D394*

- Handoff (state, how to resume): [../plans/2026-10-20-rough-cut-editor-HANDOFF.md](../plans/2026-10-20-rough-cut-editor-HANDOFF.md)
- Implementation plan: [../plans/2026-10-20-rough-cut-editor.md](../plans/2026-10-20-rough-cut-editor.md)
- Architecture + feasibility page: https://claude.ai/artifact/88wWK2tgPUk3o2tHYKQPEn
- Screen mockups (design canvas, 5 artboards): https://claude.ai/artifact/SseUKVaihCKMsHZscoQDCR

## 1. What this is, and why

CreativeOS makes many short video clips on a canvas. Today they leave the canvas one by one
and get assembled somewhere else. The Rough Cut Editor lets a team **assemble those clips into
a reel inside CreativeOS**: order them, trim them, split them, add captions, choose dubbed
picture or sound. Then they **hand the editable rough cut to Adobe Premiere Pro**, where final
editing and polish happen.

It replaces an external prototype (a standalone web page plus a local Python service). A
throwaway spike (`/spike/rough-cut`, on branch `spike/rough-cut-editor`, commit `216ed101`,
**never merged**) rebuilt that prototype inside the app and proved the Premiere hand-off works
end to end without the Python service (section 11). Its writers, timeline maths and tests are
reused by porting files. The handoff (§3) has the file map and commands.

**Positioning:** the editor makes the *rough cut*. Premiere makes the *final cut*. The final cut
comes back into CreativeOS the way it does today, by uploading it to a Review node.

## 2. Goals, non-goals, anti-goals

**Goals**
- Turn the clips connected to one Editor node into a timed sequence, without leaving CreativeOS.
- Hand that sequence to Premiere as something an editor can open and keep working on:
  - the same order and the same trims
  - linked sound
  - captions as a separate layer
  - dubbed sound as a separate layer
- Never change a source clip.

**Non-goals (this phase)**
- Rendering a video (MP4 or otherwise). The editor outputs a Premiere package only.
- Generating anything from inside the editor: no lip sync, dubbing or regeneration there.
- Automatic captions (speech-to-text), caption animation, transitions, music, audio mixing.
- Importing files from the user's computer.
- Any editor other than Premiere Pro.
- Connecting the Editor onward (for example into Review).

**Anti-goals (would be a failure even if it "worked")**
- A package that opens in Premiere with wrong timing: clips off by frames, sound out of sync,
  trims not where they were set.
- A reel that silently changes under the user, for example a clip regenerated after it was cut.
- Caption styling that looks right in CreativeOS and arrives unstyled or misplaced in Premiere,
  with nothing telling the user.

## 3. The Editor node

- A new node type, **Editor**. **One per canvas**: adding a second one is refused with a plain
  explanation. That includes copy/paste, duplicate and the copilot.
- **Inputs:** Video Gen nodes and Dubbing nodes, at **any status** (pending, approved, …).
- **No output.** Nothing connects onward.
- **On the canvas**, the card shows its title, its sources and pieces (count and total length),
  a small strip of the cut, and an **Open editor** action. It does not edit anything itself.
- Opening it goes to a **full page** for that canvas's editor (the canvas URL plus `/edit`),
  with **Back to canvas**. It is not the slide-up focus view other nodes use, because the editor
  needs the whole screen. *(User's call. It departs from the focus-view convention on purpose, so
  it gets an ADR.)*

## 4. Clips: what goes in, and which version

- **Connecting a clip is refused while it is still generating, or while it has no finished
  take.** The message says to connect it once it finishes. Without this, a job that finishes
  later would become the current take and change a reel that was already cut.
- Every node connected to the Editor is a **source**. Each new source appears **once on the
  timeline**, full length.
- **Default order is shot order**, meaning the order of the script shots the clips came from.
  Clips without a shot go after the ordered ones, in the order they were connected *(my call)*.
  The user can **drag to reorder** freely, and their order then wins.
- A source can be split into several **pieces**, each trimmed on its own. Two pieces of the same
  source never affect each other.
- **The editor uses each source's current version.** Switching a node to another version from
  its History **is allowed** while it is connected, and the reel follows the switch. If the new
  version is shorter than a trim, the trim is pulled in to fit, and the user is told *(my call)*.
- **Disconnect and reconnect:** disconnecting a source removes its pieces from the timeline.
  Reconnecting brings it back as a fresh, full-length piece at its shot position. The old trims
  are never applied to what may now be a different take.
- **Picture and sound choices per piece** (Dubbing sources only):
  - **Picture:** *Original* by default. If the Dubbing node's current version has a lip-synced
    video, the piece can switch to **Lip-synced**.
  - **Sound:** *Original* by default. If the version has a dub, the piece can switch to **Dubbed**.
  - Lip sync only exists after a dub, so a lip-synced picture never appears without a dub.
  - If a version switch removes the chosen option, the piece falls back to Original and the user
    is told *(my call)*.
  - Trims are kept **by time**, so switching to a lip-synced file with a different frame rate or
    length still lines up.

## 5. Generation is locked while connected

- While a node feeds the Editor, generation is turned off on:
  - **the connected node itself:** no regenerate on a Video Gen; no dub, lip sync or voice change
    on a Dubbing node;
  - **the Video Gen feeding a connected Dubbing node.**
- **Nothing further upstream is locked.** Prompts, images, composites and scripts stay usable,
  because they also feed clips that aren't in the reel.
- **Switching versions stays allowed** (section 4).
- The node says why, in place of the action: *"In use by the Editor · Disconnect to generate"*.
  The Video Gen behind a dub says *"Locked by its dub · feeds the Editor"*.
- The lock holds whoever tries: another tab, a teammate or the copilot. **CreativeOS enforces
  it**; the UI does more than hide a button.
- Removing the connection lifts the lock.

## 6. The editor page

Layout, from the user's sketch and shown in the mockups:

- **Stage:** the preview, shaped like the reel, **9:16 or 16:9**. It defaults to the first
  clip's shape and the user can switch. A clip of the other shape fits inside the frame rather
  than being cropped.
- **Props panel:** the properties of the current selection.
  - *Clip piece:* source and version, trim summary, Picture choice, Sound choice, quiet sections.
  - *Caption:* text, timing, font, size, colour.
- **Sources panel:** the connected sources with their current version, so a source can be
  added to the timeline again.
- **Timeline**, full width under the stage. Its scale doesn't depend on the clips: adding or
  trimming never rescales the rest, and long reels scroll. How wide a window it shows by default,
  and whether to add zoom, is left to the builder: the spike's 60 s window leaves a short reel
  looking mostly empty, and the mockups use 20 s.
  - **Lanes**, top to bottom: **Video**, **Audio**, **Dub**, **Captions**.
  - **Trim** by dragging a piece's edges; the stage shows the frame being cut on.
  - **Split** at the playhead (button or `S`), **delete** the selection (`⌫`), **reorder** by
    dragging, **play/pause** with `Space`, scrub on the ruler.
  - Audio and dub move with their piece; they aren't edited separately.
- **The preview plays what will be exported:** the order, the trims, the chosen picture and the
  chosen sound. *(The spike played the original sound only. The product must not.)*
- **Quiet-section detection** lists quiet stretches in a piece for review, with seek to each.
  Nothing is removed automatically.

## 7. Captions

- Captions are added at the playhead. They are **timed on the timeline** (drag to move, drag an
  edge to change the start or end) and **placed on the stage by dragging**, like motion-graphics
  text. Each caption has its own position.
- **A caption belongs to the piece it starts in and moves with it.** Trimming or reordering an
  earlier piece doesn't knock later captions out of sync with the speech. Deleting a piece
  deletes its captions *(my call)*. An imported SRT line attaches to the piece under its start.
- **No background box.** A soft shadow keeps the text readable.
- **Fonts come from a fixed list of open Google Fonts.** The exact list is left to the plan; the
  mockups show Montserrat, Poppins, Bebas Neue, Anton and Playfair Display. The stage renders the
  real font, so what the user sees is what Premiere shows. These are **reel content, not
  interface**, so they are an intended exception to the app's two-UI-fonts rule (ADR).
- Captions can be imported from, and exported to, **SRT** (text and timing only).

## 8. Saving, reopening, and who can edit

- The edit is **saved automatically** and reopens exactly as it was left: order, trims, splits,
  picture and sound choices, captions with their positions and style, and the reel shape.
- **Editing the reel uses the canvas's existing one-editor-at-a-time lock.**
  - Opening the editor in the same tab hands the lock from the canvas to the editor.
  - While the editor is open, the canvas is read-only in other tabs and for teammates, exactly as
    when someone else is editing the canvas today.
  - So nothing can change under an open editor.
- Someone who opens the editor without the lock sees it **read-only**.
- Deleting the Editor node deletes its edit, with the canvas's usual undo and confirm behaviour.

## 9. Export to Premiere

- **Export to Premiere** prepares one zip in the background, shows its progress, then offers the
  download. The zip holds:
  - the Premiere sequence file
  - an OpenTimelineIO file
  - the captions as SRT
  - a manifest and a README
  - the caption font files
  - a `media/` folder with exactly the files the reel uses: clips, lip-synced videos, dub audio
- What the user sees in Premiere:
  - **V1:** the pieces in order, with their trims, frame-accurate.
  - **A1/A2:** each piece's own sound, linked to its picture (stereo).
  - **A3/A4:** the dubbed sound for pieces set to *Dubbed*, linked to the picture. The original
    sound for those pieces is present but switched off, so it can be brought back.
  - **V2:** the captions as editable Premiere text (Graphic clips), with the chosen font, size,
    colour and position.
- The export dialog and the README say exactly **how to open it**:
  1. Unzip somewhere permanent.
  2. **Drag `creativeos-premiere.xml` into Premiere's Project panel.** Premiere's Import screen
     ignores it.
  3. Open the *CreativeOS Rough Cut* sequence, and link the media to the `media/` folder once if
     Premiere asks.
- Failures say what went wrong in plain words (a source that can't be read, a step that failed).
  An export never produces a partial package that looks complete.

## 10. Architecture direction (agreed; details in the plan)

Full reasoning is on the architecture page linked at the top.

- **Heavy reads happen off the browser.** Our storage sends no cross-origin headers (D245): the
  browser can *play* clips but can't *read their bytes*.
  - Each take's media facts (frame rate, frame count, size, audio layout) are **measured once on
    the server** and kept with the take.
  - The **export package is assembled by a background task**, which reads storage directly.
    Downloading the finished zip is a plain link.
  - Quiet-section detection for one clip can read through the existing same-origin media proxy.
- **The edit has its own record, keyed to the Editor node**, saved through its own route under
  the canvas lock. It is not part of canvas autosave, which doesn't run on the editor page.
- **The spike's writers are reused:** the Premiere XML, the Premiere titles, OpenTimelineIO and
  SRT, plus the timeline maths and its tests. The browser-only probe and zip are replaced, and
  local import is dropped.
- **Call budget:** opening the editor is one read for the edit plus all its sources, and one lock,
  however many clips there are. Exporting is one start plus light polling. No media bytes pass
  through the browser or our server functions.

## 11. What the spike proved (constraints the build must respect)

- **Premiere accepts a package produced entirely in CreativeOS**, with no Python service and no
  OpenTimelineIO install anywhere. *(User's call: Premiere only, so no general format hub.)*
  Verified on the user's Windows Premiere on 2026-10-20.
- **Frame rates must come from the files.** CreativeOS clips are 24 fps (121 frames for 5.04 s).
  The prototype assumed 25 and asked Premiere for frames past the end of each clip.
- **OpenTimelineIO's Premiere writer loses linked audio.** It writes the audio copy of each clip
  as an empty stub that reuses the video clip's id, and it drops links. Our writer writes real
  linked audio, matching what Premiere itself exports: a stereo pair on A1 and A2 sharing a group.
- **Premiere's Import screen doesn't read sequence files**; only the Project panel does
  (section 9). Without that instruction, users conclude the export is broken.
- **Captions only arrive styled as Premiere titles.** An SRT arrives as a plain caption track with
  almost no styling. The title format is undocumented: it was decoded from a file Premiere
  exported. A future Premiere version could read it differently, so:
  - keep the SRT in the package as the fallback;
  - keep the caption-probe test file for re-checking new Premiere versions.
- **Media links need one relink at most.** A package built in the cloud can't know where it will
  be unzipped.
- **A finished generation always becomes the node's current take**, which is why connecting
  mid-generation is refused (section 4).

## 12. Decided, my calls, left to the builder

**Decided by the user (2026-10-19/20)**
- Premiere only. The Editor has no output.
- Video Gen and Dubbing inputs, at any status. One Editor per canvas.
- Full-page editor at the canvas URL plus `/edit`.
- Generation locked on the connected node and the Video Gen behind a connected dub; version
  switching allowed.
- Picture can switch to lip-synced, and sound to dubbed, when those exist.
- No local import.
- A fixed list of Google Fonts. Shot order by default, with drag to reorder.
- Captions as styled titles, no box, dragged into place, moving with their piece.
- Disconnecting removes a source's pieces; reconnecting brings it back fresh.
- The editor uses the canvas lock.
- Connecting is refused while a clip is generating.
- Acceptance is a manual check on the user's Windows Premiere (2025+).
- The architecture direction in section 10.

**My calls (check while reading)**
- Clips with no shot go last, in connection order.
- Trims shrink to fit a shorter version, with a notice.
- A picture or sound choice that disappears falls back to Original, with a notice.
- Deleting a piece deletes its captions.
- Caption font files ship in the package.

**Left to the builder**
- Exact storage and save mechanics.
- How media facts are measured and backfilled for older takes.
- How export progress reaches the page.
- The exact font list and each font's PostScript name.
- The default timeline window and zoom.
- How frame-rate mismatches between clips are handled (all current clips are 24 fps).
- How the second audio source plays in the preview.

## 13. Done when

- [ ] An Editor node can be added (one per canvas), and Video Gen / Dubbing nodes connected to it.
- [ ] Connecting a clip that is generating, or has no take, is refused with a reason.
- [ ] Connected nodes, and the Video Gen behind a connected dub, refuse to generate from any
      client and say why. Switching versions still works, and the reel follows.
- [ ] Opening the editor shows the connected clips in shot order. They can be reordered, trimmed,
      split and deleted, and the preview matches, including the chosen picture and sound.
- [ ] Disconnecting removes a source's pieces; reconnecting brings it back fresh.
- [ ] Dubbing pieces can switch to lip-synced picture and dubbed sound when those exist.
- [ ] Captions can be added, timed on the timeline, dragged into place and styled from the font
      list, and they move with their piece.
- [ ] The edit saves automatically and reopens exactly; the canvas is read-only elsewhere while
      the editor is open.
- [ ] Export produces a package that opens in the user's Windows Premiere (via the Project panel)
      with the right order, frame-accurate trims, linked stereo sound, the dub on its own tracks
      with the original sound off, and styled captions on V2.
- [ ] Original media is unchanged.
