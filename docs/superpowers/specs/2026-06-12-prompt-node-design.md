# Prompt node — image-prompt generation from brand context + connected nodes

**Date:** 2026-06-12
**Status:** Implemented
**Area:** Canvas → Prompt node

## Problem

CreativeOS needed a way to turn a brand's KB, a reel script, and reference files into a
production-ready image-generation prompt without the operator hand-writing it each time.
No node existed for this; and the prompt text needed to be both AI-generated and manually
editable before it travels downstream to an image node.

## Goals

- A compact **Prompt node** on the canvas that launches a focus view on open/double-click.
- Focus view shows brand KB slice selection, connected upstream nodes (accordion), a freetext
  instruction, and the generated output — all without an outer scroll.
- Generate button calls the model; output fills the right panel; user can edit freely before saving.
- **Image-specific KB slices**: Visual Style, Image Direction, Casting, Personality, Tone, Brand
  profile, Compliance — all on by default; derived from the full brand KB schema.
- File nodes with `useLlm: true` send only their LLM-extracted content; never fall back to raw text.
- Context-aware instruction placeholder adapts to what is connected (script, files, or nothing).
- Edits to the generated text are buffered in a local draft; an explicit Save commits them.
- Connected upstream inputs resolved via the same versioned output pipeline used by the Script node.

## Non-goals

- No streaming generation (single-shot completion only).
- No per-field provenance or KB approval workflow inside this node.
- No drag-reorder of upstream nodes.
- No image-generation trigger from within this node — it produces the prompt text only.

## Design

### A. Canvas node (launcher)

`prompt-node.tsx` is a compact `w-44` card: Sparkles icon + "Prompt" eyebrow, title (or "Image
prompt" fallback), a status dot (purple = generated, gray = not), and an **Open ↗** button.
Double-click or Open launches `PromptFocusView`. The upstream list is derived in a `useMemo` over
the canvas store's `nodes` + `edges` to avoid the `useSyncExternalStore` infinite-loop caused by
returning freshly-built object arrays from a selector.

`kbSlices` falls back to `DEFAULT_IMAGE_PROMPT_SLICES` (all 7) when not yet saved on the node.

### B. Focus view layout

A bottom sheet (`data-[side=bottom]:h-[92vh]`) with a fixed three-zone layout — no outer scroll.

```
┌──────────────────────── max-w-5xl, centered ─────────────────────────┐
│ Header: ← Back  Title                            ● Unsaved  [Save]   │
├─────────────────────────┬────────────────────────────────────────────┤
│ Left 45%  (scrollable)  │ Right 55%                                  │
│                         ├────────────────────────────────────────────┤
│ Brand KB  [↗]           │ INSTRUCTION   flex ~30%                    │
│ [chip][chip]…           │ [textarea]  [Generate / Re-generate]       │
│                         ├────────────────────────────────────────────┤
│ Connected               │ GENERATED PROMPT   flex ~70%               │
│ ▼ Script (auto-open)    │ skeleton / empty state / output textarea   │
│ ► [img] filename        │                                            │
└─────────────────────────┴────────────────────────────────────────────┘
```

- **Left panel** — Brand KB section (slice chips + external-link icon → `/clients/:id/kb`) and
  Connected section (accordion list, script pinned first).
- **Right instruction zone** — `flex: 3 3 0%` of the right panel height; textarea + Generate button
  at bottom. Single button — no duplicate in the header.
- **Right output zone** — `flex: 7 7 0%`; three display states (skeleton, empty, result textarea).
- Header shows Save (+ unsaved badge) only when output exists; no Re-generate in the header.
- Max-width `max-w-5xl` matches the Script focus view — same centered position on wide screens.

### C. State machine

```
          Generate clicked               model returns
EMPTY ──────────────────────▶ SKELETON ────────────────▶ RESULT
                                  │  error                 │  Re-generate
                                  ▼                        │
                              toast + stay empty  ◀────────┘
```

`mode` is derived on every render: `generating ? "skeleton" : output ? "result" : "empty"`.
Draft is seeded from `output` when the view opens or a fresh generation lands (render-time state
adjustment, not an effect).

### D. Connected inputs accordion (`connected-inputs-card.tsx`)

| Collapsed state | Expanded state |
|---|---|
| Chevron + node icon + label + LLM badge | + content (image, text, script summary) |
| Image files: `size-5` micro-thumbnail inline | Image files: `aspect-4/3` thumbnail |
| Edit = pencil icon only | same |

Script nodes sorted to the top; scripts start expanded, all other types start collapsed.
The `upstream` list comes from the parent via props — the card owns only expand/collapse state.

### E. KB slice filtering (`slice-toggles.tsx`)

`SliceToggles` accepts an optional `allowedKeys` prop. The script empty state passes the original
4 copy-writing keys so image-specific slices (`visual_identity`, `image_direction`, `casting`)
don't appear there. The prompt focus view passes no filter — all 7 are shown.

### F. Data flow

1. **compile-preview** (`POST /api/nodes/:id/compile-preview`): called on open (debounced 300 ms).
   Resolves KB context + upstream outputs server-side without calling the model. Powers the
   Connected accordion's live text previews and LLM-badge logic.

2. **generate** (`POST /api/nodes/:id/generate`): `resolvePromptInputs` → `compilePrompt` →
   `buildUserContent` → OpenAI → `insertVersion` + `setActiveVersion` → returns `{ output }`.

   `compilePrompt` assembles labeled text blocks in order:
   ```
   Brand context: <KB slices text>
   Script:        <rendered reel script>
   File:          <extracted text, rawText, or [File: name] hint>
   Instruction:   <operator text, or DEFAULT_INSTRUCTION>
   ```

   `buildUserContent` (`src/lib/nodes/compose-message.ts`) wraps the compiled text with vision
   attachments when image file upstreams are present, producing a plain string or a multi-part
   content array for the OpenAI SDK. See §G.

3. **`getNodeOutput`** (`src/lib/nodes/node-output.ts`) normalises each upstream to a plain string:

   | Node type | Source |
   |---|---|
   | `text` (Note) | `node.data.text` |
   | `script` | `renderScriptAsText(activeOutput)` — flattens shots, VO, caption, etc. |
   | `prompt` | `activeOutput` string |
   | `file` | priority table below |

   File kinds at upload time:

   | `fileKind` | What's stored | Text available without LLM? |
   |---|---|---|
   | `"text"` (.txt/.md) | `rawText` in node data | Yes — extracted at upload |
   | `"image"` | `fileUrl` in storage | No — sent via vision API |
   | `"document"` (PDF/DOCX) | `fileUrl` in storage | Only via LLM extraction (`processedOutput`) |

   Resolution priority for `case "file"` in `getNodeOutput`:

   | processedOutput | useLlm | image + fileUrl | rawText | Result |
   |---|---|---|---|---|
   | ✓ | any | any | any | `processedOutput` |
   | — | true | any | any | `""` (extraction not run — UI shows nudge) |
   | — | false | ✓ | any | `""` (sent as vision part — not as text) |
   | — | false | — | ✓ | `rawText` (text files only) |
   | — | false | — | — | `[File: filename]` (document without extraction) |

4. **Save**: `onSaveOutput(draft)` (server action → `setActiveVersion`) + `onPatch({ parsed: draft })`
   mirrors to the canvas store. Dirty flag = `output !== draft && draft.trim() !== ""`.

### G. File content routing — three paths

`buildUserContent` (`src/lib/nodes/compose-message.ts`) is a pure helper that takes the compiled
text string and the resolved upstream list, then decides whether the OpenAI message is a plain
string or a multi-part array:

```
plain string               → no image file upstreams (or all have useLlm on)
[text part, image_url …]   → one or more image files with useLlm off
```

**Path 1 — LLM extraction (`useLlm: true`)**
`getNodeOutput` returns `processedOutput` if extraction has been run; `""` otherwise. Applies to
any file kind. The model receives extracted prose; never raw bytes or a URL. The accordion shows
a "Run extraction first" nudge when `text` is empty.

**Path 2 — Vision (`fileKind === "image"`, `useLlm` off)**
`getNodeOutput` returns `""` (no text contribution). `buildUserContent` appends the `fileUrl` as
an `image_url` content part. The model sees the actual image. OpenAI `detail: "auto"` lets the API
choose resolution based on image dimensions.

**Path 3 — Text / document (`useLlm` off)**
- `"text"` files (.txt/.md): `rawText` extracted at upload → sent in the text block.
- `"document"` files (PDF/DOCX): `rawText` is not extracted at upload; only `fileUrl` is stored.
  Without LLM extraction, `getNodeOutput` returns `[File: filename]` — a placeholder that at
  least names the file in the compiled prompt. OpenAI's chat completions API cannot fetch
  arbitrary document URLs, so no richer fallback is possible without extraction.

The `fileKind`, `fileUrl`, and `useLlm` flags are threaded through `UpstreamPreview`,
the compile-preview response, and the client `UpstreamNode`/`ConnectedPreview` types.

## Testing

- `npx tsc --noEmit` — clean (all types thread end-to-end).
- Open a Prompt node → three-zone layout, no outer scroll; left panel scrolls independently.
- Connect a Script node → accordion shows it at top, expanded, with title + shot count.
- Connect 5 File nodes (mixed image/text) → collapsed by default; expand one image → `aspect-4/3` thumbnail.
- File node (image, `useLlm` off) → Generate sends `image_url` content part; compiled text has no `[File: …]` for it.
- File node (PDF/DOCX, `useLlm` off, no extraction) → compiled text contains `[File: filename]` placeholder.
- File node (`useLlm: true`, no extraction) → nudge visible in accordion; `""` sent to model.
- File node (`useLlm: true`, extraction run) → `processedOutput` sent as text block; no vision part.
- KB edit icon → navigates to `/clients/:id/kb`.
- Generate → skeleton visible (gray pulse bars); result fills output zone.
- Edit output → unsaved badge + Save enabled; Save → badge clears.
- Re-generate from instruction zone → skeleton replaces output, new result lands.

## Design-system notes

Left panel chip row uses the existing `SliceToggles` purple-active pill pattern. Output textarea and
instruction textarea follow the same `focus:ring-1 focus:ring-ring` style as other document inputs.
Skeleton bars use `bg-muted-foreground/15` (visible gray against white background) with `animate-pulse`.

## Migration note

This replaces two earlier iterations: (1) a single scrollable column where the generated output was
at the very bottom, and (2) a two-panel layout (left 42%, right 58%) where the instruction textarea
and Generate button lived in the left panel alongside KB and connected inputs. The current design
moves instruction + output entirely to the right panel as a vertical split, freeing the left panel
for context-only controls. KB slices also expanded from 4 generic copy-writing slices to 7
image-generation specific ones, with the original 4 preserved for script nodes via `allowedKeys`.
