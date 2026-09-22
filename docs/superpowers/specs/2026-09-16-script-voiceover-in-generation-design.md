# Script voiceover in video generation

**16 September 2026 · design spec** · ADRs D267, D268

---

## 1. Problem

A parsed reel script carries its voiceover as one reel-wide string (`ReelScript.voiceover`), and it
stops there:

- `render-shot-for-video.ts` drops it on purpose ("audio carries zero motion signal"), so the
  single-take writer never sees it.
- `buildMultishotUserTurn` passes the cuts and the script's production notes, not the VO.
- No writer system prompt mentions dialogue, voiceover or lip-sync. Veo, Gemini Omni and Kling all
  generate audio without any audio guidance. Seedance has sound tags (`{}` for dialogue) but no VO
  text to put in them.
- Kling 3.0 and 3.0 Omni default `audio` to `"off"`, so even a correct prompt would be silent.

Each clip therefore invents its own speech or stays silent, and nothing says whether a mouth
should move.

**Goal.** When a script has VO, every generation that covers a shot with a VO line speaks that line
verbatim, in the form each vendor documents, with lip-sync behaviour matching who speaks. When the
script has no VO, that is the script's decision and generations follow it.

**Principle (operator's call).** There is no VO switch at the prompt level. The script is the only
source: to drop VO, edit the script.

**Non-goals.**
- Music and sound-effect direction (`music_sound`) — a follow-up.
- Voice identity across clips — that is the Character node (D264–D266).
- Re-syncing finished clips.
- Sora (its provider is not registered).
- A writer-side fallback for scripts parsed before this change — they are re-parsed.

---

## 2. Vendor rules (the contract this design encodes)

Sources: `ref/veo/*`, `ref/google-omni-flash-docs/*`, `ref/kling-docs/*`,
`ref/byteplus-docs/Dreamina Seedance 2.5 tutorial.md`, plus the
[fal Kling 3.0 guide](https://blog.fal.ai/kling-3-0-prompting-guide) and
[Kling's native audio guide](https://kling.ai/blog/kling-video-3-omni-native-lip-sync-audio-guide).

| Model | Speaks? | Documented form |
|---|---|---|
| Veo 3.1 Lite / Fast / Quality | Yes, audio always on (Lite included, API doc feature table) | Speech in quotes: `Man: (tight voice) "…"`, `he murmured, "…"`. English is the only evaluated language. |
| Gemini Omni | Yes, always on; generates "an appropriate audio track" by default | Audio described in natural language (`Narrated by a calm voice: "…"`). `No dialogue.` removes speech. English only evaluated. No audio references. |
| Kling 3.0, 3.0 Omni | Yes, when `audio: native` | Action first, then the line. Speaker named next to the line, with tone words (`@Grace says, "Hey!"`, `[Mom, fast urgent voice]: "…"`). Unique labels, short simple sentences. The face must be visible for lip-sync. Lip-sync is documented for zh / en / ja / ko / es. |
| Kling O1 | **No** — Kling's guide: "VIDEO O1: No Native Audio" | — |
| Seedance 2.5 | Yes, audio on by default | Formula ends with sound. `{}` marks dialogue, and the language is stated before any non-Chinese line. Worked example: `Voiceover reads the full line: "…"`. 11 languages. |

The operator's own `ref/multishot-refs/chupps-20s-omni-prompts.md` confirms the shape that works:

- a `VOICE —` block ("all spoken lines are off-screen narration … no lip movement");
- a `Voiceover: "…"` line under the beat where each line lands;
- `No dialogue.` when the VO is added in the edit instead.

---

## 3. VO data: parse → shots → nodes

### 3.1 Types

```ts
// reel-script.ts
export type VoLine = {
  text: string;                 // verbatim from the script
  speaker: "narrator" | string; // "narrator" = off-screen; otherwise the on-screen person as the script names them
  delivery?: string;            // only when the script states it ("warm, unhurried")
  language?: string;            // "English", "Tamil" — Seedance states it; Kling lip-sync is 5-language
};
ReelShot.voiceover?: VoLine[];

// multishot-cuts.ts
MultishotCut.voiceover?: VoLine[];
```

### 3.2 Parse (`src/prompts/script-parse.ts`)

- The reel-wide `voiceover` string is unchanged: the Script document and market signals use it.
- The shot schema gains `voiceover: VoLine[]`, which is required and may be an empty array.
- Parse rules:
  - Assign each VO line to the shot it plays over: by the script's timecodes when present, otherwise in script order.
  - Copy the text verbatim and never invent a line.
  - `speaker` is `"narrator"` unless the script puts the line in an on-screen person's mouth.
  - `delivery` and `language` are filled only when the script states or plainly shows them.
  - A script whose VO is "None" / "No voiceover" gives every shot `[]`.
- The prompt id bumps.

### 3.3 Integrity check

A pure function, `voiceoverMappingIssue(script): string | null`, in `src/lib/nodes/voiceover.ts`:

- Tokenises (whole words, not substrings) and walks the mapped lines in order, finding each as a
contiguous run of reel-VO tokens at or after a cursor that only advances — a line not found there
was dropped or changed. When the reel VO contains quoted spans ("…" or "…"), every token inside a
quote must be covered by some mapped line and everything outside the quotes (speaker labels,
"at 0-2s", delivery notes) is ignored; otherwise (unquoted prose) timecodes and "VO:"-style labels
are stripped first and up to two remaining uncovered tokens are tolerated. A script saying "None" /
"No voiceover" must have no mapped lines. (Literal equality would warn on every script, because
scripts wrap the words in timecodes and labels.)
- On mismatch, the Script node shows a warning: "VO mapping dropped or changed a line — re-parse or
  edit the shot lines."

It never rewrites anything.

### 3.4 Fan-out and cuts

- **Shot nodes** receive the lines through the existing `script.visual_script.shots` narrowing (`canvas-store.ts`).
- **Multishot nodes:** `cutsFromShots` copies `shot.voiceover` onto the cut, and `shotsFromCuts` copies it back. Every cut edit (text, seconds, reorder, split) keeps the cut's own lines.
- **Split and merge:** `addCut` adds a cut with no lines; deleting a cut drops its lines.

### 3.5 UI

- The Shot node and the Multishot cut editor list each shot's lines as speaker + text, editable in
  place. The editable text follows `editable-field.tsx`.
- An "Add VO line" dashed primary chip adds a line.
- The speaker field accepts "narrator" or a name.
- Controls are shadcn primitives only.

### 3.6 Old parses

- A node whose shots or cuts have no `voiceover` key contributes nothing, and nothing is added to its prompts.
- Re-parsing the Script adds the lines; there is no writer fallback.

---

## 4. Rendering the exact lines

### 4.1 Dialect

`VideoGenModelSpec.voDialect: "veo" | "gemini-omni" | "kling" | "seedance" | "none"` is set on every
server spec and mirrored in `client-models.ts`. A test asserts the two agree for every id, as
`voiceInput` already does.

| Model id | `voDialect` |
|---|---|
| veo-3.1-lite, veo-3.1-fast, veo-3.1 | `veo` |
| gemini-omni-1.1-flash | `gemini-omni` |
| kling-3-0, kling-3-0-omni | `kling` |
| kling-o1 | `none` |
| seedance-2-5 | `seedance` |

### 4.2 One renderer

`src/lib/nodes/voiceover.ts` exports pure functions:

- `renderVoLine(line, dialect): string`
- `renderVoiceNote(lines: VoLine[], dialect): string` — the once-per-prompt rule
- `hasVoData(cutsOrShots): boolean` — true when at least one entry has a `voiceover` key, whether or not it is empty

Exact templates. `{d}` is the delivery and `{lang}` the language. Each bracketed part `[…]` is
omitted when its field is absent; nothing else varies.

| Dialect | Narrator line | On-screen line | Once per prompt |
|---|---|---|---|
| gemini-omni | `Voiceover (off-screen narrator[, {d}][, in {lang}]): "{text}"` | `{speaker}, on screen, says[ in a {d} tone][ in {lang}]: "{text}"` | Narration only: `Nobody on screen speaks and there is no lip movement.` Any on-screen line: `{speaker} speaks on camera with natural lip-sync.` (one per on-screen speaker). **VO data present and every list empty: `No dialogue.`** |
| kling | `An off-screen narrator says[ in a {d} tone][ in {lang}], "{text}"` | `{speaker} says[ in a {d} tone][ in {lang}], "{text}"` | Narration only: `No one on screen speaks.` |
| seedance | `Voiceover[ ({d})] in {lang ?? "English"}: {"{text}"}` | `{speaker} says[ ({d})] in {lang ?? "English"}: {"{text}"}` | Narration only: `No one on screen speaks.` |
| veo | `Narrator (off-screen[, {d}]): "{text}"` | `{speaker} says[ in a {d} tone], "{text}"` | Narration only: `No one on screen speaks.` |
| none | — | — | — |

Seedance always states a language, because its prompt rules recommend naming the language before
any non-Chinese dialogue. A line with no stated language is rendered as English.

Several lines on one cut are rendered in order and joined by a space.

### 4.3 Multishot (`renderPlan`)

VO is read from the **cuts**, never from the writer's plan, so an edited line applies without
regenerating. The paid request (`resolve-prompt.ts`) and the preview (`upstream-images`) both call
`renderPlan`, so they cannot diverge.

- **timecode (Omni):** each `[a-bs] beat` is followed by its VO lines on the same line. The voice note sits after the look, before the ladder.
- **triple (Kling):** the VO lines are appended inside the triple text, after the beat. The `;` → `,` replacement applies to VO text too, because a `;` ends a shot (a structural rewrite, not a cosmetic one). The voice note leads with the look as prose.
- **bare-timecode (Seedance):** each `a-bs: beat` is followed by its VO lines, last. The voice note goes after the ladder.

`renderPlan` needs the dialect. It receives it from `cap.id` → `videoGenClientModelMap[cap.id].voDialect`.

### 4.4 Single-take (`resolveVideoGenPrompt`)

- **Where the lines come from:** for the video-prompt lane, the Shot node in `promptUpstream` supplies them (all shots, in order).
- **What is appended:** the rendered lines, then the voice note. They follow the writer's string after a blank line.
- **Where the dialect comes from:** `resolveVideoGenPrompt` gains a `voDialect` argument, which the route passes from `config` and the preview passes from the Video Gen node's persisted `modelId`.

### 4.5 Limits

- `checkPlanLimits` measures rendered text:
  - each cut's beat plus its VO, against `maxCutChars`;
  - the whole `renderPlan` output, against `maxPromptChars`.
- Errors name the shot and add "including its voiceover line".
- VO is never truncated.

---

## 5. Writer context

### 5.1 Inputs

- **Single-take:** `mapUpstreamForVideo` for a Shot appends `Voiceover on this shot: narrator (off-screen, warm): "…"` or `Riya (on screen): "…"`, one line each.
- **Multishot:** `buildMultishotUserTurn` adds, under each shot, `  Voiceover on this shot: …` in the same form.
- **Kling multishot budget:** for Kling plans, each shot also gets `  Room for your beat: N characters (its voiceover takes M of 512).`, where M is the rendered VO length.

### 5.2 One shared performance block

`VO_PERFORMANCE_RULES` lives in `src/prompts/video-prompt-shared.ts`. Every writer imports it: the Veo, Omni, Kling and Seedance single-take records, and the Omni, Kling and Seedance multishot writers.

> VOICEOVER. When a shot lists voiceover lines, those exact words are added to the prompt after
> you write it. NEVER write, quote or paraphrase them, and never describe a voice.
> - A line spoken by someone ON SCREEN: keep that person's face visible and readable toward the
>   camera while they speak; give them one simple action; nothing covers the mouth; no fast head
>   turns.
> - A NARRATOR line: nobody on screen speaks, moves their lips as if talking, or addresses the
>   camera.
> - A shot with no voiceover lines: do not describe anyone speaking.

The Seedance writers keep `()` for music and `<>` for sound effects. The instruction to write `{}` dialogue is removed, because the renderer owns dialogue.

Writer ids bump:
- `multishot-prompt-generate@7`
- `multishot-prompt-kling@4`
- `multishot-prompt-seedance@4`
- each single-take record's `version` +1

---

## 6. Kling audio default (D268)

- **Kling 3.0 and 3.0 Omni:** `audioParam(["native", "off"], "native")`, and the param moves out of the `advanced` group into the main params.
- **Kling O1:** unchanged (`"off"`, since it has no native audio).
- **Existing nodes:** a node that has a saved `audio` keeps it. The new default applies to new nodes and to nodes with no saved value.
- **Credits:** the estimate reflects this through `cost.ts`'s existing on/off pricing.

---

## 7. Errors and states

| Situation | Behaviour |
|---|---|
| VO mapping doesn't reproduce the reel VO | Warning on the Script node; nothing rewritten |
| Old parse (no `voiceover` key) | Nothing added to any prompt |
| Script says no VO, model Omni | `No dialogue.` |
| Script says no VO, other models | Nothing added |
| Kling O1 with VO lines | Nothing rendered (dialect `none`) |
| Rendered beat or prompt over the model limit | Existing limit error, naming the shot + "including its voiceover line"; Generate disabled |
| Non-English VO on Veo or Omni | Rendered as written; the vendors only evaluate English (no warning in this pass) |

---

## 8. Testing (Vitest)

- **`script-parse`**: `VoLine` schema; the prompt rules text; the parse fixture maps lines per shot.
- **`voiceover.ts`**:
  - `voiceoverMappingIssue`: exact, dropped line, changed line, "None";
  - `renderVoLine` and `renderVoiceNote` for every dialect × narrator / on-screen / delivery / language;
  - `hasVoData`.
- **`multishot-cuts` / `multishot-convert`**: `voiceover` survives `cutsFromShots` → `shotsFromCuts` and every cut mutation.
- **`canvas-store` fan-out**: Shot and Multishot nodes carry the lines.
- **`renderPlan`**: exact output per format for narrator-only, on-screen, mixed, a multi-line cut, and no-VO cases:
  - Omni `No dialogue.` only when `hasVoData`;
  - O1 renders nothing;
  - Kling `;` inside VO.
- **`checkPlanLimits`**: counts VO; the reason names the shot.
- **`resolveVideoGenPrompt`**:
  - single-take appends per dialect;
  - the preview route's text equals the request's.
- **Writers**:
  - user turns include VO lines, plus the Kling room line;
  - system prompts include `VO_PERFORMANCE_RULES`;
  - the Seedance writer no longer asks for `{}` dialogue.
- **Registry**: `voDialect` lockstep for every id; Kling 3.0 and 3.0 Omni audio default `native` in the main group; O1 unchanged.

---

## 9. Build order

| # | Item |
|---|---|
| 1 | `VoLine` types, parse schema + rules, integrity check |
| 2 | Cuts / fan-out carry `voiceover`; Shot + Multishot VO editing UI |
| 3 | `voDialect` on specs; `voiceover.ts` renderer |
| 4 | `renderPlan` + `checkPlanLimits` + single-take `resolveVideoGenPrompt` + preview parity |
| 5 | Writer inputs + `VO_PERFORMANCE_RULES` + Kling budget line |
| 6 | Kling audio default + param group |

Items 1–4 make the exact VO reach every paid request. Item 5 makes the visuals support it. Item 6 makes Kling audible.
