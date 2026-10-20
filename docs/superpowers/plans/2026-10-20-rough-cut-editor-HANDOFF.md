# Rough Cut Editor · handoff: resume in a fresh conversation

**Written 20 October 2026**, at the end of the session that built the spike and agreed the design
(session `5035ae34-1b94-4d7b-a6a8-1542d33dd211`). **Read this first** in any new conversation
about the Rough Cut Editor, then the design doc. Start that conversation **in the build worktree**
(§2).

---

## 1. Where things stand

| Piece | State |
|---|---|
| Design doc | [../specs/2026-10-20-rough-cut-editor-design.md](../specs/2026-10-20-rough-cut-editor-design.md). **Approved by the user 2026-10-20**, with all six builder-check decisions settled (§12 there). |
| Spike | **Built and verified in the user's Windows Premiere.** The XML imports, captions land as styled titles on V2, the dub sits on its own tracks. Lives **only** on the spike branch (§2, §3) and is **never merged**. Its code is reused by porting files (§3). |
| Architecture + feasibility page | https://claude.ai/artifact/88wWK2tgPUk3o2tHYKQPEn |
| Screen mockups (design canvas) | https://claude.ai/artifact/SseUKVaihCKMsHZscoQDCR: canvas + Editor node, editor with a clip / caption / dubbed clip selected, export dialog |
| Implementation plan | **Not written.** Next step (§7). |
| ADRs | **Not written.** Proposed list in §8. Next free number: **D387** (origin/staging 26abaea5). |
| Migration | None yet. Next free number: **0059**. Staging has 0057 and 0058. |

Both artifacts are private to the user. Share them from the page's Share menu before sending
them to anyone.

## 2. Two worktrees, two branches

| | Build (work here) | Spike (reference only) |
|---|---|---|
| Path | `.claude/worktrees/rough-cut-build` | `.claude/worktrees/rough-cut-editor` |
| Branch | `feat/rough-cut-editor` | `spike/rough-cut-editor` |
| Base | origin/staging **26abaea5** (20 Oct) | staging fcb943d4 (19 Oct) + spike commit **216ed101** |
| Contains | this handoff + the design doc. **No spike code.** | the spike (`/spike/rough-cut`), its tests, the same two docs, `mediabunny` + `fflate` in package.json |
| Merges into staging? | Yes, when built | **Never** |
| Upstream | none (unset on purpose; it was tracking origin/staging). Push with `git push -u origin feat/rough-cut-editor`. | none, local only. **Not pushed.** Ask the user whether to push it as a backup. |

The full repo path prefix is `C:\Users\cyril varghese\code\canvas-apps\asset-pipleline\`. Both
worktrees have real `node_modules` (`npm install`, never a junction) and copies of `.env`,
`.env.local`, `.env.production`, `.env.staging`.

Left untracked in the spike worktree, never committed:
- `sample-code-gitignore/`: the user's prototype export, two MP4s, about 10 MB. Not gitignored
  despite its name.
- A `.env.example` change, `SARVAM_API_KEY` / `FAL_KEY` commented out. It was **not** made in
  that session.

The original prototype lives outside the repo at `C:\Users\cyril varghese\Desktop\creativeos-spike\`
(`index.html` + `server.py`), as history.

## 3. Reusing the spike: where the code is, and how to bring it over

All spike work is in commit **`216ed101`** on **`spike/rough-cut-editor`**: 31 files. It can be
read from any worktree of this repo, because branches are shared.

```bash
# list what the spike added
git show --stat 216ed101

# read a spike file without checking anything out
git show spike/rough-cut-editor:src/lib/rough-cut-spike/premiere-xml.ts

# copy a spike file into the build branch, then move it to its product home
git checkout spike/rough-cut-editor -- src/lib/rough-cut-spike/premiere-xml.ts
git mv src/lib/rough-cut-spike/premiere-xml.ts src/lib/editor/premiere-xml.ts

# or bring the whole spike library over as a starting point (it stays out of src/app)
git checkout spike/rough-cut-editor -- src/lib/rough-cut-spike
```

Never `git merge` or `git cherry-pick` 216ed101: that would bring `/spike/rough-cut` and the
spike UI into the product. Port files deliberately; the plan lists which.

### File map, and what happens to each in the product

| Spike file | Role | In the product |
|---|---|---|
| `src/lib/rough-cut-spike/premiere-xml.ts` | Sequence writer: V1, A1-A2 stereo pair, A3-A4 dub (original audio off), V2 titles, `<link>` blocks matching Premiere's own export, file elements, `rateParts`, `fileUrl` | **Port.** Picture and sound may come from different files (lip-synced picture + original or dubbed sound). |
| `src/lib/rough-cut-spike/premiere-title.ts` | Premiere Graphic title + "Source Text" encoder (reverse-engineered) | **Port** as is. Fonts come from the Google Fonts list (PostScript names). |
| `src/lib/rough-cut-spike/xml-node.ts` | Tiny XML tree, serializer, rate/timecode elements | **Port** |
| `src/lib/rough-cut-spike/otio.ts` | `.otio` JSON writer | **Port**, and add the dub track |
| `src/lib/rough-cut-spike/srt.ts` | SRT read/write | **Port**. An import attaches each line to the piece under its start. |
| `src/lib/rough-cut-spike/timeline.ts` | Pure locate / trim / split / move; a no-op returns the same array | **Port**, with trims by time (design §4) |
| `src/lib/rough-cut-spike/silence.ts` | Web Audio RMS quiet detection | **Port**; it reads through the same-origin media proxy |
| `src/lib/rough-cut-spike/types.ts` | Spike data model | **Rewrite**: pieces point at source nodes, with picture/sound choices and captions tied to pieces |
| `src/lib/rough-cut-spike/probe.ts` | mediabunny probe in the browser | **Replace** with server-side media facts per take |
| `src/lib/rough-cut-spike/export-package.ts` | fflate zip in the browser + README text | **Move the logic** into the Trigger.dev export task (fflate also runs in Node). Keep the README wording: "drag the XML into the Project panel". |
| `src/lib/rough-cut-spike/__tests__/premiere-xml.test.ts` | 9 tests: frames at the real rate, links, unique ids, title blob shape, dub tracks | **Port** with the writers |
| `src/lib/rough-cut-spike/__tests__/caption-probe.test.ts` | Manual: writes a media-free XML comparing our title with Premiere's own (§4) | **Port.** It is the re-test for new Premiere versions. |
| `src/components/rough-cut-spike/use-sequence-playback.ts` | One `<video>`; the clock follows `currentTime`; source swap at cuts | **Port and extend**: picture switch + dub audio playback |
| `src/components/rough-cut-spike/timeline-strip.tsx`, `timeline-clip.tsx`, `timeline-ruler.tsx`, `timeline-lanes.tsx` | Fixed-scale timeline, edge-drag trims, drag reorder, ruler scrub, Video/Audio/Dub/Captions lanes | **Rebuild to the mockups**, reusing the pointer interactions |
| `src/components/rough-cut-spike/caption-block.tsx`, `caption-overlay.tsx`, `use-captions.ts` | Caption timing on the lane (move / edge-trim, frame snap); drag on the stage with a grab offset; no-op-safe caption edits | **Port the interactions**; captions now belong to pieces |
| `src/components/rough-cut-spike/rough-cut-spike.tsx`, `media-panel.tsx`, `preview-player.tsx`, `clip-inspector.tsx`, `captions-panel.tsx`, `caption-style-fields.tsx`, `export-panel.tsx` | Spike page shell and panels | **Don't port.** Rebuild as the editor page per the mockups. |
| `src/app/spike/rough-cut/page.tsx` | Spike route | **Never port** |

**Dependencies:** the spike added `fflate@0.8.3` and `mediabunny@1.61.2`, both pinned exact. The
build adds `fflate` when the export task needs it. `mediabunny` is only needed if some probing
stays in the browser.

## 4. Running the spike (in the spike worktree)

```bash
cd ".claude/worktrees/rough-cut-editor"
npm run dev:next -- -p 3100        # Next only, no Trigger needed
# http://localhost:3100/spike/rough-cut  (behind login, like the rest of the app)
npx vitest run src/lib/rough-cut-spike
```

**Testing an export in Premiere:**
1. Import local MP4s; they land on the timeline.
2. Trim, split, add captions, attach a dub audio file.
3. Export tab → Export Premiere package. Unzip it.
4. **Drag `creativeos-premiere.xml` into Premiere's Project panel**, then open *CreativeOS Rough
   Cut*. Premiere's Import screen ignores XML. That cost a full debugging round in this session.

**Re-checking titles on a new Premiere version (the caption probe).** This writes a media-free
XML with two sequences: A is a title written by our code, B is Premiere's own title, copied
verbatim. Import it the same way and compare.

```powershell
# 1. get the Premiere-exported reference file (OpenTimelineIO test data) into some folder:
#    https://cdn.jsdelivr.net/gh/OpenTimelineIO/otio-fcp-adapter@main/tests/sample_data/premiere_generators.xml
# 2. generate (from the spike worktree, or wherever the probe test has been ported):
$env:SPIKE_PROBE_OUT = "<an existing output folder>"
$env:SPIKE_PREMIERE_SAMPLE = "<path to premiere_generators.xml>"
npx vitest run src/lib/rough-cut-spike/__tests__/caption-probe.test.ts
```

## 5. What the spike proved

The facts, with their sources.

- **No Python needed.** The prototype's `server.py` used OpenTimelineIO only for its `fcp_xml`
  adapter. FCP7 "xmeml" and `.otio` JSON are written directly in TypeScript.
- **The OTIO adapter's audio was broken.** It wrote the audio copy of each clip as a stub
  reusing the video clip's id, and dropped `<link>`. Our link block matches **Premiere's own
  export**:
  - each link holds linkclipref + mediatype + trackindex + clipindex, plus groupindex;
  - stereo is two clipitems on A1/A2 with `groupindex 1`;
  - the dub goes on A3/A4 with `groupindex 2`, and the original audio gets `enabled FALSE`.
- **Frame rate from the files:** CreativeOS clips are **24 fps, 121 frames**, AAC stereo 32 kHz.
  The prototype hard-coded 25.
- **Premiere titles:** a `<clipitem>` with `<mediaSource>GraphicAndType</mediaSource>` and a
  `GraphicAndType` filter.
  - Parameter 1, "Source Text", is base64 of: u32 LE byte length, 4 zero bytes, then UTF-16LE
    JSON (`mTextParam.mStyleSheet.mText`, `mFontName`, `mFontSize`, `mFillColor` as 0xRRGGBB
    runs `[charIndex, value]`).
  - Parameter 3, "Position", is `x:y` from 0 to 1.
  - Decoded from OpenTimelineIO's `tests/sample_data/premiere_generators.xml` (clipitem-6).
    **Undocumented**, so re-check on Premiere updates.
- **SRT** arrives as a plain caption track with almost no styling, which is why titles are needed.
- **Media paths:** relative `pathurl` works with one relink. Absolute paths link automatically
  only if you know the unzip folder.

## 6. Agreed decisions and architecture

All in the design doc (§3–§10 and §12). In short:

- **The node:** an Editor node takes Video Gen and Dubbing at any status, one per canvas, with no
  output. It opens a full-page editor at the canvas URL plus `/edit`.
- **The lock:** connecting locks generation on that node, and on the Video Gen behind a connected
  dub; nothing further upstream. Switching versions is allowed. Connecting is refused while a clip
  is generating or has no take.
- **The timeline:** disconnecting removes a source's pieces; reconnecting brings it back fresh.
  Shot order by default, with drag to reorder.
- **Picture and sound:** a piece can switch to the lip-synced picture or the dubbed sound when
  they exist.
- **Captions:** styled Premiere titles from a Google Fonts list, no box, dragged on the stage,
  moving with the piece they start in.
- **Editing:** uses the canvas's one-editor lock. Saved in its own record, keyed to the Editor
  node.
- **Off the browser:** storage has no CORS (D245), so each take's media facts are measured on the
  server and the **export runs as a Trigger.dev task** that builds the zip into storage and hands
  back a link.
- **Acceptance:** a manual check on the user's Windows Premiere (2025+, the version with the
  Import screen).

## 7. Next steps, in order

1. **Write the ADRs** (§8) into the single ADR log,
   `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7. Use the Decision / Why /
   Rejected / Refines / Originated format, and put the final numbers into the design doc header.
   Re-check the next free number first, because staging may have moved.
2. **Write the implementation plan** with `superpowers:writing-plans`, from the design doc. The
   plan owns the "how":
   - the edit's table and routes
   - media-facts measurement and backfill
   - the export task
   - the lock checks in each generate route and copilot tool
   - the connection-rule changes
   - the editor page's components
   - **which spike files are ported** (§3)

   Read `node_modules/next/dist/docs/` for routing and route-handler questions (Next 16:
   `proxy.ts`, not `middleware.ts`).
3. Execute the plan (subagent-driven or inline, the user's choice), then run the Premiere
   acceptance check by hand with the user.
4. Once the product ships, delete the spike worktree and branch, or keep the branch as an archive.
   Removing a worktree can hit Windows MAX_PATH; see the memory note on worktree removal.

## 8. Proposed ADRs (numbers from D387; confirm first)

1. **Rough Cut Editor node.**
   - Video Gen + Dubbing in, any status; no output; one per canvas.
   - Full-page editor at `/edit`, *departing from the focus-view convention on purpose*.
   - Rejected: the slide-up focus view (too small for a timeline).
2. **Premiere export written in TypeScript.**
   - FCP7 xmeml + `.otio` JSON, Premiere only.
   - Rejected: a Python service or a Trigger Python extension running OpenTimelineIO. Its adapter
     loses linked audio, and Premiere-only needs no format hub.
3. **Connecting locks generation.**
   - Scope: the node, plus the Video Gen behind a connected dub. Version switching allowed.
     Connecting is refused mid-generation.
   - Rejected: locking everything upstream (it would freeze shared prompts and images).
4. **The edit has its own record and uses the canvas lock.**
   - Rejected: storing it in node data under canvas autosave (that doesn't run on `/edit`);
     a separate editor lock (it would need live sync).
5. **Media facts measured on the server per take; export assembled in a Trigger.dev task.**
   - Refines D245 (storage has no CORS).
   - Rejected: zipping in the browser through the media proxy (every byte through a function);
     changing bucket CORS.
6. **Captions are Premiere Graphic titles.**
   - Reverse-engineered Source Text, with an SRT fallback and the caption probe as a re-test.
   - Google Fonts list as *content* fonts, an exception to the two-UI-font rule.
   - Captions move with their piece.
   - Rejected: SRT only (no styling survives).
7. **The spike stays on `spike/rough-cut-editor` and is never merged.** Code is reused by porting
   files.

## 9. Gotchas found in this session

- **Premiere's Import screen** (Import / Edit / Export tabs) only browses media. It silently makes
  "Sequence 01" from the MP4s. Use a drag into the Project panel.
- **The worktree-isolation guard** refuses Bash commands whose arguments contain the substring
  `git`, which includes the folder `sample-code-gitignore`. Use a glob (`sample-code-*`), or
  PowerShell with literal paths.
- **Artifact publishes:** use the long scratchpad path
  (`C:\Users\cyril varghese\AppData\Local\Temp\…`). The 8.3 short form (`CYRILV~1`) was refused by
  a Read permission rule.
- **Dev server:** the spike worktree's server ran on port **3100**. A second start fails with
  `EADDRINUSE`; that's harmless.
- **`feat/rough-cut-editor` was created tracking origin/staging**, and the upstream was unset so a
  bare `git push` can't land on staging. Keep it that way: push with `-u origin feat/rough-cut-editor`.
- **The spike plays the original audio only**, never the dub, in its preview. The product must
  play the chosen picture and sound (design doc §6).
