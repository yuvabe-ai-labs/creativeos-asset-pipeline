# Rough Cut Editor: MP4 export

*Decision D417 in the roadmap's ADR log (§7). Reverses D388's "CreativeOS renders no video";
builds on the Premiere export (D389, D392, D409, D416) and the caption style (D396–D398).*

## 1. What it is

The editor's Export gives two choices:

1. **MP4 video**: a finished video, ready to post or send.
2. **Premiere Pro package**: the editable sequence, exactly as today.

The MP4 is rendered in the background from the **same sequence plan** as the Premiere package
(`planSequence`), so the two can never disagree: same clip order and trims, same picture
(original or lip-synced), same sound (original or dub), same captions and caption style.

## 2. Options (only the two that matter)

Competitors (Descript, Canva, VEED, CapCut) separate "a finished video" from "a project for
another editor", and the one MP4 setting people change is size. Frame rate, bitrate and codec are
not exposed: the render matches the source rate and uses fixed, good defaults.

| Option | Choices | Default | Shown |
|---|---|---|---|
| Quality | **Full** (the reel's frame, e.g. 1080×1920) · **Quick** (720 px on the short side, faster and smaller) | Full | always |
| Burn in captions | on · off | on | only when the reel has captions |

## 3. The flow

1. **Export** (header button, renamed from "Export to Premiere") opens a dropdown:
   **MP4 video** · **Premiere Pro package**.
2. **Premiere Pro package** behaves exactly as today (saves, starts, the existing dialog).
3. **MP4 video** opens a small dialog with the two options and an **Export** button. Export saves
   first (as Premiere does), then starts the render. The same dialog shows progress
   ("Preparing the clips…", "Rendering… 40%", "Saving the video…"), then
   **Download `<reel>-<date>.mp4`** with the length, frame and size. A failure says what went
   wrong in plain words and offers **Try again**.
4. Closing the dialog doesn't stop the render; reopening MP4 while one runs shows its progress.

## 4. How the MP4 is made

A new background task, `editor-render`, beside `editor-export`, on the same job table
(`background_jobs`, kind `editor-render`, lock `editor-render:<editorNodeId>`, so an MP4 and a
Premiere package can run at once but not two MP4s). The route plans the reel from the **saved**
edit on the server (rule 10), named per D416, and puts the plan and the two options in the job's
input; the task payload is the job id only (rule 8).

The task, with ffmpeg (already in the Trigger.dev image, D282):

- **Media:** downloads exactly the files the plan uses (same cap as the package, 700 MB).
- **Picture:** each clip's picture file trimmed to its in/out, scaled to fit the output frame
  and padded with black (a clip of the other shape fits inside, as in the preview), at the
  plan's frame rate; clips joined end to end.
- **Sound:** each clip plays what the plan says: its original sound or its dub, trimmed with it;
  a clip with no sound gets silence, so picture and sound stay in step. AAC stereo.
- **Captions** (when on): written as an ASS subtitle file from the plan's titles and burned in
  with libass, using the caption fonts shipped in the image (D393). Font, size, colour,
  position, box or outline follow the reel's style; word-by-word highlighting comes from the
  same per-word titles as Premiere (D398): the said word's colour, upcoming words dimmed or
  hidden. Sizes scale with Quick.
- **Output:** H.264 (yuv420p, `+faststart`, CRF 20 for Full, 23 for Quick), uploaded to storage at
  `…/editor/<jobId>/<reel>-<date>.mp4` with a download header carrying that name.
- **Progress:** phase messages on the job row, with a percentage from ffmpeg's progress output
  during the render.

Nothing paid is called, so no credits are charged. One attempt (a failure is shown; the user
retries). An `onFailure` hook settles a run that dies (timeout, out of memory), as
`editor-export` does.

## 5. Units

| Unit | Responsibility |
|---|---|
| `src/lib/editor/render-ass.ts` | Pure: plan titles → ASS document (styles, events, colour and alpha overrides per word). Tested. |
| `src/lib/editor/render-plan.ts` | Pure: plan + options → output size and the ffmpeg arguments (inputs, filter graph, encoding). Tested. |
| `src/lib/editor/render-run.ts` | The task body with I/O injected (fetch, run ffmpeg, upload, set phase, now), as `export-run.ts`. Tested. |
| `trigger/editor-render.ts` | Wires the real I/O; settles dead runs. |
| `src/app/api/canvases/[cid]/editor/renders/route.ts` (+ `[jobId]`) | Start a render; read its status. Same checks as `exports`. |
| `editor.service.ts`, `hooks/queries/editor.ts` | `startRender`, `renderStatus`; `useStartRender`, `useRenderStatus` (polling with `refetchInterval`). |
| `editor-export-menu.tsx`, `editor-render-dialog.tsx` | The dropdown and the MP4 dialog. The Premiere dialog is unchanged. |

## 6. Errors

- An empty reel or an unreadable file: refused at start with the plan's reason (as Premiere).
- A download fails: "Couldn't download <file> (HTTP n)."
- ffmpeg fails: "The video couldn't be rendered. Try again." (the ffmpeg log goes to the task
  log, never the UI).
- Too large: the 700 MB message.

## 7. Risks checked before building

- **libass in the image's ffmpeg.** Burning captions needs ffmpeg built with libass. Verified
  first (`ffmpeg -filters` lists `subtitles`/`ass`) in the deployed image; if missing, the
  Trigger.dev `ffmpeg()` extension is pinned to a static build that has it.
- **Fidelity.** libass and the browser draw text slightly differently. The bar: same font, size,
  position, colours and word timing as the preview, to the eye.
- **Render time and memory.** A 30 s reel at 1080×1920 should render in well under a minute on
  `medium-1x`; the task's `maxDuration` is 600 s.

## 8. Testing

- `render-ass`: styles from the caption style (font, size, colours, outline vs box, position);
  one event per word title with the said word coloured and upcoming words dimmed or hidden;
  times in centiseconds; Quick scales sizes.
- `render-plan`: output size for Full and Quick in both shapes; trims, fit and pad per clip;
  sound choice per clip, silence for a silent clip; captions filter only when on.
- `render-run`: phases in order, upload once with the reel's name, download failure and size
  cap never upload.
- Routes: start (saved edit, names, options validated, lock), status.
- A real render of the Reel 2 clips, checked by eye against the preview, before calling it done.
