# Editor MP4 Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Rough Cut Editor's Export offers "MP4 video" (rendered in the background with ffmpeg, captions burned in) beside the existing "Premiere Pro package".

**Architecture:** The MP4 is rendered from the same `SequencePlan` as the Premiere package. Pure modules turn the plan into an ASS subtitle file (`render-ass.ts`) and ffmpeg arguments (`render-plan.ts`); a runner with injected I/O (`render-run.ts`) downloads media, runs ffmpeg in a temp dir and uploads; a Trigger.dev task (`editor-render`) wires real I/O; two routes start and poll it; a dropdown and a dialog in the editor drive it.

**Tech Stack:** Next.js 16 route handlers, Trigger.dev v4 tasks, ffmpeg + libass, Supabase `background_jobs`, GCS storage, TanStack Query v5, shadcn (Base UI) primitives, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-26-editor-mp4-export-design.md` (D417).

## Global Constraints

- Two MP4 options only: Quality **Full** | **Quick** (720 px short edge), default Full; **Burn in captions** on by default, shown only when the reel has captions.
- Render from `planSequence` output only; never re-derive trims, sound or captions.
- Job kind `editor-render`, lock `editor-render:<editorNodeId>`; task payload is `{ jobId }` only (performance rule 8).
- No credits charged. One attempt (`retry: { maxAttempts: 1 }`); `onFailure` settles dead runs.
- User-facing copy: plain, no vendor names (no "ffmpeg", "libass", "Trigger"), no em-dash phrasing, no raw errors.
- Controls are shadcn primitives from `src/components/ui/*`; never native `<button>`/`<input>`.
- API routes use `apiError`/`apiOk`, `withCanvas`, `withTryCatch`.
- Browser data through the three layers: `editor.service.ts` → `hooks/queries/editor.ts` → components.
- Commits: no AI attribution lines (user's global rule overrides any reminder).
- Media cap: 700 MB (`MAX_PACKAGE_MEDIA_BYTES`).

---

### Task 1: Names and font metrics for the render

**Files:**
- Modify: `src/lib/editor/package.ts` (`PackageNames`, `packageNames`)
- Modify: `src/lib/editor/caption-fonts.ts` (`assLineHeight` per font)
- Test: `src/lib/editor/__tests__/package.test.ts`, `src/lib/editor/__tests__/caption-fonts-metrics.test.ts` (create)

**Interfaces:**
- Produces: `PackageNames = { dir: string; zip: string; xml: string; video: string }`; `packageNames(name, at).video === "<slug>-<yyyy-mm-dd>.mp4"`.
- Produces: `CAPTION_FONTS[i].assLineHeight: number` = (OS/2 usWinAscent + usWinDescent) / unitsPerEm.

- [ ] **Step 1: Write the failing tests**

In `package.test.ts`, change the existing `packageNames` expectation to include `video`:

```ts
    expect(packageNames("Jackfruit 365 · Reel 2", NOW)).toEqual({
      dir: "jackfruit-365-reel-2-2026-10-20",
      zip: "jackfruit-365-reel-2-2026-10-20.zip",
      xml: "jackfruit-365-reel-2.xml",
      video: "jackfruit-365-reel-2-2026-10-20.mp4",
    });
```

and the test-local constant `N` gains `video: "creativeos-reel.mp4"`.

Create `src/lib/editor/__tests__/caption-fonts-metrics.test.ts`:

```ts
// libass sizes text by the font's full Windows line height, the browser by its em (D417). Each
// caption font's ratio is a constant; this keeps it equal to the file's own metrics.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CAPTION_FONTS } from "../caption-fonts";

function winLineHeight(file: string): number {
  const b = readFileSync(path.join(process.cwd(), "src", "fonts", "captions", file));
  const tables: Record<string, number> = {};
  for (let i = 0; i < b.readUInt16BE(4); i++) {
    const r = 12 + i * 16;
    tables[b.toString("ascii", r, r + 4)] = b.readUInt32BE(r + 8);
  }
  const upm = b.readUInt16BE(tables.head + 18);
  const os2 = tables["OS/2"];
  return (b.readUInt16BE(os2 + 74) + b.readUInt16BE(os2 + 76)) / upm;
}

describe("caption font metrics", () => {
  it.each(CAPTION_FONTS.map((f) => [f.key, f] as const))("%s matches its file", (_key, font) => {
    expect(font.assLineHeight).toBeCloseTo(winLineHeight(font.file), 3);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/editor/__tests__/package.test.ts src/lib/editor/__tests__/caption-fonts-metrics.test.ts`
Expected: FAIL (`video` missing; `assLineHeight` undefined).

- [ ] **Step 3: Implement**

In `package.ts`:

```ts
export type PackageNames = { dir: string; zip: string; xml: string; video: string };
```

and in `packageNames` return `{ dir: stamp, zip: \`${stamp}.zip\`, xml: \`${slug}.xml\`, video: \`${stamp}.mp4\` }`. Update the doc comment: "the zip, its folder and the MP4 carry the reel and the day".

In `caption-fonts.ts`, add `assLineHeight` to each entry (values measured from the files; the test guards them):

```ts
  { key: "montserrat", label: "Montserrat", postScript: "Montserrat-ExtraBold", file: "Montserrat-ExtraBold.ttf", licence: "Montserrat-OFL.txt", assLineHeight: 1.562 },
  { key: "poppins", label: "Poppins", postScript: "Poppins-Bold", file: "Poppins-Bold.ttf", licence: "Poppins-OFL.txt", assLineHeight: 1.762 },
  { key: "bebas-neue", label: "Bebas Neue", postScript: "BebasNeue-Regular", file: "BebasNeue-Regular.ttf", licence: "BebasNeue-OFL.txt", assLineHeight: 1.3 },
  { key: "anton", label: "Anton", postScript: "Anton-Regular", file: "Anton-Regular.ttf", licence: "Anton-OFL.txt", assLineHeight: 1.7334 },
  { key: "playfair-display", label: "Playfair Display", postScript: "PlayfairDisplay-Bold", file: "PlayfairDisplay-Bold.ttf", licence: "PlayfairDisplay-OFL.txt", assLineHeight: 1.41 },
```

with a comment above the list: `// assLineHeight: (usWinAscent + usWinDescent) / unitsPerEm. libass sizes text by it (D417).`

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/lib/editor/__tests__/package.test.ts src/lib/editor/__tests__/caption-fonts-metrics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor/package.ts src/lib/editor/caption-fonts.ts src/lib/editor/__tests__/package.test.ts src/lib/editor/__tests__/caption-fonts-metrics.test.ts
git commit -m "feat(editor): MP4 file name and caption font line heights for the render (D417)"
```

---

### Task 2: Captions as an ASS file (`render-ass.ts`)

**Files:**
- Create: `src/lib/editor/render-ass.ts`
- Test: `src/lib/editor/__tests__/render-ass.test.ts`

**Interfaces:**
- Consumes: `SequencePlan`, `PlanTitle` (`sequence-plan.ts`); `captionFont(key).postScript`, `.assLineHeight` (Task 1); `TextRun` (`premiere-title.ts`).
- Produces: `buildAss(plan: SequencePlan, out: { width: number; height: number }): string | null` (null when the plan has no titles); `assColor(hex: string, alpha?: number): string`; `assTime(seconds: number): string`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { assColor, assTime, buildAss } from "../render-ass";
import { planSequence, type SequencePlan } from "../sequence-plan";
import { CAPTION_PRESETS, DEFAULT_CAPTION_STYLE, type CaptionStyle } from "../caption-style";
import type { Caption, Piece } from "../types";
import { source } from "./fixtures";

const piece: Piece = { id: "p1", sourceNodeId: "a", in: 0, out: 121 / 24, picture: "original", sound: "original" };
const words = [{ text: "make", at: 1, duration: 0.5 }, { text: "dosa", at: 1.5, duration: 0.5 }];
const caption: Caption = { id: "c", pieceId: "p1", at: 1, duration: 1.3, text: "make dosa", words };
const planWith = (look: Partial<CaptionStyle>): SequencePlan => {
  const r = planSequence({ v: 2, captionStyle: { ...DEFAULT_CAPTION_STYLE, ...look }, shape: "9:16", sources: [], pieces: [piece], captions: [caption] }, [source("a")]);
  if (!r.ok) throw new Error(r.reason);
  return r.plan;
};
const FULL = { width: 720, height: 1280 };
const styleLine = (ass: string) => ass.split("\n").find((l) => l.startsWith("Style: Caption,"))!;
const events = (ass: string) => ass.split("\n").filter((l) => l.startsWith("Dialogue:"));

describe("assColor / assTime", () => {
  it("writes colours as &HAABBGGRR and times as h:mm:ss.cc", () => {
    expect(assColor("#ffca2d")).toBe("&H002DCAFF");
    expect(assColor("#111111", 0x47)).toBe("&H47111111");
    expect(assTime(3725.456)).toBe("1:02:05.46");
    expect(assTime(0)).toBe("0:00:00.00");
  });
});

describe("buildAss", () => {
  it("is null without captions", () => {
    const r = planSequence({ v: 2, captionStyle: DEFAULT_CAPTION_STYLE, shape: "9:16", sources: [], pieces: [piece], captions: [] }, [source("a")]);
    if (!r.ok) throw new Error(r.reason);
    expect(buildAss(r.plan, FULL)).toBeNull();
  });

  it("uses the reel's font, sized from its em to libass's line height, outlined", () => {
    const plan = planWith({ ...CAPTION_PRESETS.clean.look, font: "montserrat", size: 84, outline: true, box: false });
    const ass = buildAss(plan, FULL)!;
    expect(ass).toContain("PlayResX: 720\nPlayResY: 1280");
    const style = styleLine(ass).split(",");
    expect(style[1]).toBe("Montserrat-ExtraBold");
    expect(Number(style[2])).toBeCloseTo(plan.titles[0].sizePx * 1.562, 1);
    expect(style[15]).toBe("1"); // BorderStyle: outline
    expect(Number(style[16])).toBeCloseTo(plan.titles[0].stroke!.widthPx / 2, 1);
  });

  it("draws a box behind boxed captions, with its opacity", () => {
    const plan = planWith(CAPTION_PRESETS.boxed.look);
    const style = styleLine(buildAss(plan, FULL)!).split(",");
    expect(style[15]).toBe("3"); // BorderStyle: opaque box
    expect(style[6]).toBe(assColor(plan.titles[0].box!.color, Math.round(255 * (1 - plan.titles[0].box!.opacity / 100))));
  });

  it("writes one event per word: the said word coloured, upcoming words dimmed, at the caption's place", () => {
    const plan = planWith(CAPTION_PRESETS.boxed.look);
    const ev = events(buildAss(plan, FULL)!);
    expect(ev).toHaveLength(2);
    const t = plan.titles[0];
    expect(ev[0]).toContain(`${assTime(t.start / plan.fps)},${assTime(t.end / plan.fps)},Caption`);
    expect(ev[0]).toContain(`{\\pos(${Math.round(t.x * 720)},${Math.round(t.y * 1280)})}`);
    expect(ev[0]).toMatch(/\{\\1c&H[0-9A-F]{6}&\}MAKE\{\\r\} \{\\1c&H[0-9A-F]{6}&\}DOSA\{\\r\}/);
  });

  it("hides upcoming words for Karaoke without collapsing their space", () => {
    const ass = buildAss(planWith(CAPTION_PRESETS.karaoke.look), FULL)!;
    expect(events(ass)[0]).toContain("{\\1a&HFF&\\3a&HFF&}DOSA{\\r}");
  });

  it("scales everything for a smaller output", () => {
    const plan = planWith({ ...CAPTION_PRESETS.clean.look, font: "anton" });
    const half = buildAss(plan, { width: 360, height: 640 })!;
    expect(half).toContain("PlayResX: 360\nPlayResY: 640");
    expect(Number(styleLine(half).split(",")[2])).toBeCloseTo((plan.titles[0].sizePx / 2) * 1.7334, 1);
  });

  it("keeps braces and line breaks from becoming ASS codes", () => {
    const plan = planWith(CAPTION_PRESETS.clean.look);
    plan.titles = [{ ...plan.titles[0], text: "a {b}\nc", runs: undefined }];
    expect(events(buildAss(plan, FULL)!)[0]).toMatch(/\}a \(b\)\\Nc$/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/editor/__tests__/render-ass.test.ts`
Expected: FAIL ("Cannot find module '../render-ass'").

- [ ] **Step 3: Implement `src/lib/editor/render-ass.ts`**

```ts
// The reel's captions as an ASS subtitle file, burned into the MP4 (D417). Pure. It reads the
// same per-word titles as the Premiere export (D398), so both show the same words at the same
// frames. Sizes are px at the plan's frame, scaled to the output; libass sizes text by the font's
// full line height, so each font's ratio turns the preview's em size into the ASS size.
import { captionFont } from "./caption-fonts";
import type { TextRun } from "./premiere-title";
import type { PlanTitle, SequencePlan } from "./sequence-plan";

/** The stage's caption box is 88% of the frame wide: 6% each side. */
const SIDE_MARGIN = 0.06;
/** The preview's text shadow: 0.06em down, black at 60%. */
const SHADOW_EM = 0.06;
const SHADOW_ALPHA = 0x66;

const byte = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).toUpperCase().padStart(2, "0");
const num = (n: number) => String(Math.round(n * 100) / 100);
const pad2 = (n: number) => String(n).padStart(2, "0");

/** "#rrggbb" as ASS "&HAABBGGRR" (alpha 0 is opaque, 255 transparent). */
export function assColor(hex: string, alpha = 0): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  const [r, g, b] = m ? [m[1], m[2], m[3]] : ["FF", "FF", "FF"];
  return `&H${byte(alpha)}${b}${g}${r}`.toUpperCase();
}

/** Seconds as ASS "h:mm:ss.cc". */
export function assTime(seconds: number): string {
  const cs = Math.max(0, Math.round(seconds * 100));
  return `${Math.floor(cs / 360000)}:${pad2(Math.floor(cs / 6000) % 60)}:${pad2(Math.floor(cs / 100) % 60)}.${pad2(cs % 100)}`;
}

/** Text that can't open an override block or a line-break code by accident. */
const escapeText = (s: string) => s.replace(/\\/g, "＼").replace(/\{/g, "(").replace(/\}/g, ")").replace(/\r?\n/g, "\\N");

function segments(t: PlanTitle): Array<{ text: string; run?: TextRun }> {
  const out: Array<{ text: string; run?: TextRun }> = [];
  let at = 0;
  for (const run of [...(t.runs ?? [])].sort((a, b) => a.start - b.start)) {
    if (run.start > at) out.push({ text: t.text.slice(at, run.start) });
    out.push({ text: t.text.slice(Math.max(at, run.start), run.end), run });
    at = Math.max(at, run.end);
  }
  if (at < t.text.length) out.push({ text: t.text.slice(at) });
  return out.filter((s) => s.text.length > 0);
}

function override(run: TextRun, look: PlanTitle): string {
  if (run.hidden) {
    // Hide the letters (and their outline or shadow), keep their space and any box behind them.
    return `{\\1a&HFF&${look.stroke ? "\\3a&HFF&" : ""}${!look.stroke && !look.box ? "\\4a&HFF&" : ""}}`;
  }
  if (!run.color) return "";
  return `{\\1c&H${assColor(run.color).slice(4)}&}`; // assColor gives "&H00BBGGRR"; the tag takes "&HBBGGRR&"
}

export function buildAss(plan: SequencePlan, out: { width: number; height: number }): string | null {
  if (plan.titles.length === 0) return null;
  const look = plan.titles[0];
  const scale = out.width / plan.width;
  const font = captionFont(look.fontKey);
  const shadow = !look.stroke && !look.box;
  const borderStyle = look.box ? 3 : 1;
  const outline = look.box ? look.box.sizePx * scale : look.stroke ? (look.stroke.widthPx * scale) / 2 : 0;
  const outlineColour = look.box
    ? assColor(look.box.color, 255 * (1 - look.box.opacity / 100))
    : assColor(look.stroke?.color ?? "#000000");
  const margin = Math.round(out.width * SIDE_MARGIN);
  const style = [
    "Caption", font.postScript, num(look.sizePx * scale * font.assLineHeight),
    assColor(look.color), assColor(look.color), outlineColour, assColor("#000000", SHADOW_ALPHA),
    0, 0, 0, 0, 100, 100, 0, 0, borderStyle, num(outline), num(shadow ? look.sizePx * scale * SHADOW_EM : 0),
    5, margin, margin, 0, 1,
  ].join(",");

  const lines = plan.titles.map((t) => {
    const pos = `{\\pos(${Math.round(t.x * out.width)},${Math.round(t.y * out.height)})}`;
    const body = segments(t)
      .map((s) => {
        const tag = s.run ? override(s.run, t) : "";
        return tag ? `${tag}${escapeText(s.text)}{\\r}` : escapeText(s.text);
      })
      .join("");
    return `Dialogue: ${t.track},${assTime(t.start / plan.fps)},${assTime(t.end / plan.fps)},Caption,,0,0,0,,${pos}${body}`;
  });

  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${out.width}`,
    `PlayResY: ${out.height}`,
    "WrapStyle: 1",
    "ScaledBorderAndShadow: yes",
    "YCbCr Matrix: TV.709",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: ${style}`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...lines,
    "",
  ].join("\n");
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/lib/editor/__tests__/render-ass.test.ts`
Expected: PASS. If the boxed/karaoke presets' words are not upper-cased in this fixture, adjust only the literal words in the regex (`MAKE`/`DOSA` vs `make`/`dosa`) to match `plan.titles[0].text`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor/render-ass.ts src/lib/editor/__tests__/render-ass.test.ts
git commit -m "feat(editor): captions as an ASS file for the MP4, word by word (D417)"
```

---

### Task 3: The ffmpeg command (`render-plan.ts`)

**Files:**
- Create: `src/lib/editor/render-plan.ts`
- Test: `src/lib/editor/__tests__/render-plan.test.ts`

**Interfaces:**
- Consumes: `SequencePlan`, `PlanClip` (`sequence-plan.ts`); `rateParts` (`premiere-xml.ts`).
- Produces:
  - `type RenderQuality = "full" | "quick"`
  - `outputSize(plan: SequencePlan, quality: RenderQuality): { width: number; height: number }`
  - `renderArgs(plan, opts: { quality: RenderQuality; inputs: Map<number, string>; output: string; ass: string | null; fontsDir: string | null }): string[]` — `inputs` maps plan media id → file name relative to the working dir.
  - `renderSeconds(plan): number`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { outputSize, renderArgs, renderSeconds } from "../render-plan";
import { planSequence, type SequencePlan } from "../sequence-plan";
import { DEFAULT_CAPTION_STYLE } from "../caption-style";
import type { Piece } from "../types";
import { source, videoFacts } from "./fixtures";

const piece = (id: string, src: string, inF: number, outF: number, o: Partial<Piece> = {}): Piece => ({ id, sourceNodeId: src, in: inF / 24, out: outF / 24, picture: "original", sound: "original", ...o });
const tall = source("a", { handle: "VID-AAAA", facts: videoFacts({ width: 1080, height: 1920 }) });
const wide = source("w", { handle: "VID-WIDE", facts: videoFacts({ width: 1920, height: 1080 }) });
const silent = source("s", { handle: "VID-MUTE", facts: { ...videoFacts({ width: 1080, height: 1920 }), audio: null } });
const dubbed = source("d", { kind: "dubbing", handle: "DUB-DDDD", facts: videoFacts({ width: 1080, height: 1920 }) });
const plan = (pieces: Piece[], sources = [tall, wide, silent, dubbed]): SequencePlan => {
  const r = planSequence({ v: 2, captionStyle: DEFAULT_CAPTION_STYLE, shape: "9:16", sources: [], pieces, captions: [] }, sources);
  if (!r.ok) throw new Error(r.reason);
  return r.plan;
};
const graphOf = (args: string[]) => args[args.indexOf("-filter_complex") + 1];
const inputsFor = (p: SequencePlan) => new Map(p.media.map((m) => [m.id, `m${m.id}.mp4`]));

describe("outputSize", () => {
  it("is the reel's frame for Full and 720 on the short edge for Quick", () => {
    const p = plan([piece("1", "a", 0, 24)]);
    expect(outputSize(p, "full")).toEqual({ width: 1080, height: 1920 });
    expect(outputSize(p, "quick")).toEqual({ width: 720, height: 1280 });
  });
});

describe("renderArgs", () => {
  const base = (p: SequencePlan, o: Partial<Parameters<typeof renderArgs>[1]> = {}) =>
    renderArgs(p, { quality: "full", inputs: inputsFor(p), output: "out.mp4", ass: null, fontsDir: null, ...o });

  it("trims each clip by frames, fits it into the frame, and joins them", () => {
    const p = plan([piece("1", "a", 10, 100), piece("2", "w", 0, 48)]);
    const g = graphOf(base(p));
    expect(g).toContain("fps=24,trim=start_frame=10:end_frame=100,setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black");
    expect(g).toContain("trim=start_frame=0:end_frame=48");
    expect(g).toContain("concat=n=2:v=1:a=1[vc][ac]");
    expect(renderSeconds(p)).toBeCloseTo((90 + 48) / 24, 6);
  });

  it("plays each clip's sound, silence for a clip without, and the dub when chosen", () => {
    const p = plan([piece("1", "a", 0, 24), piece("2", "s", 0, 24), piece("3", "d", 0, 24, { sound: "dubbed" })]);
    const g = graphOf(base(p));
    expect(g).toMatch(/\[0:a\]atrim=start=0:duration=1,asetpts=PTS-STARTPTS/);
    expect(g).toContain("anullsrc=r=48000:cl=stereo,atrim=duration=1[a1]");
    const dubInput = [...p.media].findIndex((m) => m.role === "dub-audio");
    expect(g).toContain(`[${dubInput}:a]atrim=start=0:duration=1`);
  });

  it("burns captions only when asked, from the working dir", () => {
    const p = plan([piece("1", "a", 0, 24)]);
    expect(graphOf(base(p))).not.toContain("ass=");
    const withCaps = base(p, { ass: "captions.ass", fontsDir: "fonts" });
    expect(graphOf(withCaps)).toContain("[vc]ass=filename=captions.ass:fontsdir=fonts[vout]");
    expect(withCaps).toContain("[vout]");
  });

  it("encodes H.264 + AAC for streaming, smaller for Quick", () => {
    const p = plan([piece("1", "a", 0, 24)]);
    const full = base(p);
    expect(full.join(" ")).toContain("-c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p");
    expect(full.join(" ")).toContain("-c:a aac -b:a 192k -movflags +faststart -progress pipe:1");
    expect(full[full.length - 1]).toBe("out.mp4");
    const quick = base(p, { quality: "quick" });
    expect(quick.join(" ")).toContain("-crf 23");
    expect(graphOf(quick)).toContain("scale=720:1280");
  });

  it("uses an exact NTSC rate", () => {
    const ntsc = source("n", { handle: "VID-NTSC", facts: videoFacts({ width: 1080, height: 1920, fps: 30000 / 1001 }) });
    const p = plan([{ id: "1", sourceNodeId: "n", in: 0, out: 1, picture: "original", sound: "original" }], [ntsc]);
    expect(graphOf(base(p))).toContain("fps=30000/1001");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/editor/__tests__/render-plan.test.ts`
Expected: FAIL ("Cannot find module '../render-plan'").

- [ ] **Step 3: Implement `src/lib/editor/render-plan.ts`**

```ts
// The ffmpeg command for the MP4 (D417). Pure. Each clip is cut by frames at the reel's rate,
// fitted into the frame (black bars, as the preview does), and given its own sound, its dub or
// silence, so picture and sound stay in step; then the clips are joined and, when asked, the
// captions are burned in. Paths are relative: ffmpeg runs in the render's working dir, so no
// path ever needs escaping inside the filter graph.
import { rateParts } from "./premiere-xml";
import type { SequencePlan } from "./sequence-plan";

export type RenderQuality = "full" | "quick";

const QUICK_SHORT_EDGE = 720;
const SAMPLE_RATE = 48000;
const CRF: Record<RenderQuality, string> = { full: "20", quick: "23" };
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
const sec = (n: number) => String(Math.round(n * 1e6) / 1e6);

export function outputSize(plan: SequencePlan, quality: RenderQuality): { width: number; height: number } {
  const short = Math.min(plan.width, plan.height);
  if (quality === "full" || short <= QUICK_SHORT_EDGE) return { width: plan.width, height: plan.height };
  const k = QUICK_SHORT_EDGE / short;
  return { width: even(plan.width * k), height: even(plan.height * k) };
}

export function renderSeconds(plan: SequencePlan): number {
  return plan.clips.length ? plan.clips[plan.clips.length - 1].end / plan.fps : 0;
}

function fpsExpr(fps: number): string {
  const { timebase, ntsc } = rateParts(fps);
  return ntsc ? `${timebase * 1000}/1001` : String(timebase);
}

export function renderArgs(
  plan: SequencePlan,
  opts: { quality: RenderQuality; inputs: Map<number, string>; output: string; ass: string | null; fontsDir: string | null },
): string[] {
  const { width: W, height: H } = outputSize(plan, opts.quality);
  const order = plan.media.map((m) => m.id).filter((id) => opts.inputs.has(id));
  const index = new Map(order.map((id, i) => [id, i]));
  const at = (media: number) => {
    const i = index.get(media);
    if (i === undefined) throw new Error(`No input for media ${media}`);
    return i;
  };
  const rate = fpsExpr(plan.fps);

  const parts: string[] = [];
  plan.clips.forEach((c, i) => {
    const len = c.end - c.start;
    const d = sec(len / plan.fps);
    parts.push(
      `[${at(c.picture.media)}:v]fps=${rate},trim=start_frame=${c.picture.in}:end_frame=${c.picture.in + len},setpts=PTS-STARTPTS,` +
        `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p[v${i}]`,
    );
    const sound = c.dubOn && c.dub ? { media: c.dub.media, in: c.dub.in } : c.sound;
    parts.push(
      sound
        ? `[${at(sound.media)}:a]atrim=start=${sec(sound.in / plan.fps)}:duration=${d},asetpts=PTS-STARTPTS,aresample=${SAMPLE_RATE},` +
            `aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${d}[a${i}]`
        : `anullsrc=r=${SAMPLE_RATE}:cl=stereo,atrim=duration=${d}[a${i}]`,
    );
  });
  const pairs = plan.clips.map((_, i) => `[v${i}][a${i}]`).join("");
  parts.push(`${pairs}concat=n=${plan.clips.length}:v=1:a=1[vc][ac]`);
  const burn = opts.ass !== null;
  if (burn) parts.push(`[vc]ass=filename=${opts.ass}${opts.fontsDir ? `:fontsdir=${opts.fontsDir}` : ""}[vout]`);

  return [
    "-hide_banner", "-y", "-nostats",
    ...order.flatMap((id) => ["-i", opts.inputs.get(id)!]),
    "-filter_complex", parts.join(";"),
    "-map", burn ? "[vout]" : "[vc]", "-map", "[ac]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", CRF[opts.quality], "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-progress", "pipe:1",
    opts.output,
  ];
}
```

The test's dub-input index assumes inputs follow `plan.media` order, which `order` preserves.

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/lib/editor/__tests__/render-plan.test.ts`
Expected: PASS. If `videoFacts` doesn't accept `fps`, read `src/lib/editor/__tests__/fixtures.ts` and pass the rate the way it allows.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor/render-plan.ts src/lib/editor/__tests__/render-plan.test.ts
git commit -m "feat(editor): the MP4's ffmpeg command from the sequence plan (D417)"
```

---

### Task 4: The render runner (`render-run.ts`) and a real ffmpeg run

**Files:**
- Modify: `src/lib/editor/export-run.ts` (extract `collectMedia`)
- Create: `src/lib/editor/render-run.ts`
- Modify: `src/lib/media/ffmpeg.ts` (add `runFfmpegWithProgress`, `ffmpegCanBurnSubtitles`)
- Test: `src/lib/editor/__tests__/render-run.test.ts`, `src/lib/editor/__tests__/render-run.ffmpeg.test.ts` (real ffmpeg, skipped when absent)

**Interfaces:**
- Consumes: `buildAss` (Task 2); `renderArgs`, `outputSize`, `renderSeconds`, `RenderQuality` (Task 3); `packageNames(...).video` (Task 1); `ExportFailure`, `DownloadError`, `MAX_PACKAGE_MEDIA_BYTES` (`export-run.ts`).
- Produces:
  - `collectMedia(plan, fetchBytes): Promise<Map<number, Uint8Array>>` exported from `export-run.ts` (the Premiere runner uses it too).
  - `type RenderOptions = { quality: RenderQuality; captions: boolean }`
  - `type RenderJobInput = { canvasId: string; nodeId: string; clientId: string; plan: SequencePlan; options: RenderOptions }`
  - `type RenderResult = { url: string; fileName: string; bytes: number; width: number; height: number; durationSeconds: number }`
  - `type RenderStatus = { status: JobStatus; phase: string | null; error: string | null; result: RenderResult | null }`
  - `type RenderDeps = { fetchBytes(url: string): Promise<Uint8Array>; readFonts(keys: CaptionFontKey[]): Promise<Array<{ name: string; bytes: Uint8Array }>>; ffmpeg(args: string[], cwd: string, onProgress: (seconds: number) => void): Promise<void>; upload(bytes: Uint8Array, fileName: string): Promise<string>; setPhase(message: string): Promise<void>; now(): Date }`
  - `runEditorRender(input: RenderJobInput, deps: RenderDeps): Promise<RenderResult>`
  - `runFfmpegWithProgress(args, cwd, onProgress): Promise<void>` and `ffmpegCanBurnSubtitles(): Promise<boolean>` in `src/lib/media/ffmpeg.ts`.

- [ ] **Step 1: Extract `collectMedia` (refactor under the existing tests)**

In `export-run.ts`, move the download loop out of `runEditorExport` into:

```ts
/** Downloads exactly the media the plan uses, four at a time, refusing past the size cap. */
export async function collectMedia(plan: SequencePlan, fetchBytes: (url: string) => Promise<Uint8Array>): Promise<Map<number, Uint8Array>> {
  const media = new Map<number, Uint8Array>();
  let total = 0;
  for (let i = 0; i < plan.media.length; i += DOWNLOAD_CONCURRENCY) {
    await Promise.all(
      plan.media.slice(i, i + DOWNLOAD_CONCURRENCY).map(async (m) => {
        let bytes: Uint8Array;
        try {
          bytes = await fetchBytes(m.url);
        } catch (err) {
          throw new ExportFailure(err instanceof DownloadError ? `Couldn't download ${m.fileName} (HTTP ${err.status}).` : `Couldn't download ${m.fileName}.`);
        }
        total += bytes.byteLength;
        if (total > MAX_PACKAGE_MEDIA_BYTES) {
          const mb = Math.round(total / (1024 * 1024));
          throw new ExportFailure(`This reel's media is ${mb} MB, more than the 700 MB a package can hold. Remove some clips and try again.`);
        }
        media.set(m.id, bytes);
      }),
    );
  }
  return media;
}
```

and in `runEditorExport` replace the loop with `const media = await collectMedia(plan, deps.fetchBytes);`.

Run: `npx vitest run src/lib/editor/__tests__/export-run.test.ts`
Expected: PASS (unchanged behaviour).

- [ ] **Step 2: Write the failing runner test**

```ts
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DownloadError, ExportFailure } from "../export-run";
import { runEditorRender, type RenderDeps, type RenderJobInput } from "../render-run";
import { planSequence } from "../sequence-plan";
import { CAPTION_PRESETS, DEFAULT_CAPTION_STYLE } from "../caption-style";
import type { Caption, Piece } from "../types";
import { source } from "./fixtures";

const piece: Piece = { id: "1", sourceNodeId: "a", in: 0, out: 2, picture: "original", sound: "original" };
const cap: Caption = { id: "c", pieceId: "1", at: 0.5, duration: 1, text: "Hi" };
const plan = (captions: Caption[]) => {
  const r = planSequence({ v: 2, captionStyle: { ...DEFAULT_CAPTION_STYLE, ...CAPTION_PRESETS.boxed.look }, shape: "9:16", sources: [], pieces: [piece], captions }, [source("a", { handle: "VID-AAAA" })], { name: "Jackfruit 365 · Reel 2" });
  if (!r.ok) throw new Error(r.reason);
  return r.plan;
};
const input = (captions = [cap], o: Partial<RenderJobInput["options"]> = {}): RenderJobInput => ({ canvasId: "cv", nodeId: "ed", clientId: "cl", plan: plan(captions), options: { quality: "full", captions: true, ...o } });

function deps(o: { failUrl?: string; ffmpegFails?: boolean } = {}) {
  const seen: { cwd?: string; args?: string[]; files?: string[] } = {};
  const d: RenderDeps = {
    fetchBytes: vi.fn(async (url: string) => {
      if (url === o.failUrl) throw new DownloadError(404);
      return new Uint8Array([1, 2, 3]);
    }),
    readFonts: vi.fn(async (keys) => keys.flatMap((k) => [{ name: `${k}.ttf`, bytes: new Uint8Array([7]) }, { name: `${k}-OFL.txt`, bytes: new Uint8Array([8]) }])),
    ffmpeg: vi.fn(async (args: string[], cwd: string, onProgress: (s: number) => void) => {
      seen.cwd = cwd;
      seen.args = args;
      seen.files = ["captions.ass", path.join("fonts", "montserrat.ttf"), path.join("fonts", "anton.ttf")].filter((f) => existsSync(path.join(cwd, f)));
      if (o.ffmpegFails) throw new Error("ffmpeg exited with 1: boom");
      onProgress(1);
      await writeFile(path.join(cwd, args[args.length - 1]), new Uint8Array([9, 9]));
    }),
    upload: vi.fn(async (_bytes: Uint8Array, fileName: string) => `https://storage.googleapis.com/b/${fileName}`),
    setPhase: vi.fn(async (_m: string) => {}),
    now: () => new Date("2026-10-26T09:00:00Z"),
  };
  return { d, seen };
}

describe("runEditorRender", () => {
  it("renders in a temp dir, uploads once under the reel's name, and cleans up", async () => {
    const t = deps();
    const r = await runEditorRender(input(), t.d);
    expect(t.d.upload).toHaveBeenCalledTimes(1);
    expect(t.d.upload).toHaveBeenCalledWith(new Uint8Array([9, 9]), "jackfruit-365-reel-2-2026-10-26.mp4");
    expect(r).toMatchObject({ fileName: "jackfruit-365-reel-2-2026-10-26.mp4", bytes: 2, width: 720, height: 1280 });
    expect(r.durationSeconds).toBeCloseTo(2, 1);
    expect(existsSync(t.seen.cwd!)).toBe(false);
  });

  it("writes the captions file and the caption font when captions are on", async () => {
    const t = deps();
    await runEditorRender(input(), t.d);
    expect(t.seen.files).toContain("captions.ass");
    expect(t.seen.args!.join(" ")).toContain("ass=filename=captions.ass:fontsdir=fonts");
    expect(t.d.readFonts).toHaveBeenCalled();
  });

  it("burns nothing when captions are off or there are none", async () => {
    for (const i of [input([cap], { captions: false }), input([])]) {
      const t = deps();
      await runEditorRender(i, t.d);
      expect(t.seen.files).not.toContain("captions.ass");
      expect(t.seen.args!.join(" ")).not.toContain("ass=");
    }
  });

  it("reports phases in order", async () => {
    const t = deps();
    await runEditorRender(input(), t.d);
    const phases = vi.mocked(t.d.setPhase).mock.calls.map((c) => c[0]);
    expect(phases[0]).toBe("Collecting the media…");
    expect(phases).toContain("Rendering…");
    expect(phases[phases.length - 1]).toBe("Saving the video…");
  });

  it("says which file failed to download, and never renders or uploads", async () => {
    const i = input();
    const t = deps({ failUrl: i.plan.media[0].url });
    await expect(runEditorRender(i, t.d)).rejects.toBeInstanceOf(ExportFailure);
    expect(t.d.ffmpeg).not.toHaveBeenCalled();
    expect(t.d.upload).not.toHaveBeenCalled();
  });

  it("turns a render failure into a plain message", async () => {
    const t = deps({ ffmpegFails: true });
    await expect(runEditorRender(input(), t.d)).rejects.toThrow(new ExportFailure("The video couldn't be rendered. Try again."));
    expect(t.d.upload).not.toHaveBeenCalled();
    expect(existsSync(t.seen.cwd!)).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run src/lib/editor/__tests__/render-run.test.ts`
Expected: FAIL ("Cannot find module '../render-run'").

- [ ] **Step 4: Implement `src/lib/editor/render-run.ts`**

```ts
// The MP4 render (D417), with its I/O injected so it runs the same in the Trigger.dev task and in
// tests. Downloads the plan's media into a temp dir, writes the captions (ASS) and their font when
// asked, runs ffmpeg there, and uploads the video LAST. The temp dir is always removed. Failures
// carry a plain message the dialog shows as is; the underlying error rides on `cause` for the log.
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { JobStatus } from "@/lib/jobs/types";
import type { CaptionFontKey } from "./caption-fonts";
import { collectMedia, ExportFailure } from "./export-run";
import { fontsUsed, packageNames } from "./package";
import { buildAss } from "./render-ass";
import { outputSize, renderArgs, renderSeconds, type RenderQuality } from "./render-plan";
import type { SequencePlan } from "./sequence-plan";

export type RenderOptions = { quality: RenderQuality; captions: boolean };
export type RenderJobInput = { canvasId: string; nodeId: string; clientId: string; plan: SequencePlan; options: RenderOptions };
export type RenderResult = { url: string; fileName: string; bytes: number; width: number; height: number; durationSeconds: number };
/** What the MP4 dialog polls. */
export type RenderStatus = { status: JobStatus; phase: string | null; error: string | null; result: RenderResult | null };

export type RenderDeps = {
  fetchBytes(url: string): Promise<Uint8Array>;
  readFonts(keys: CaptionFontKey[]): Promise<Array<{ name: string; bytes: Uint8Array }>>;
  ffmpeg(args: string[], cwd: string, onProgress: (seconds: number) => void): Promise<void>;
  upload(bytes: Uint8Array, fileName: string): Promise<string>;
  setPhase(message: string): Promise<void>;
  now(): Date;
};

const RENDER_FAILED = "The video couldn't be rendered. Try again.";
const PROGRESS_STEP = 10;

export async function runEditorRender(input: RenderJobInput, deps: RenderDeps): Promise<RenderResult> {
  const { plan, options } = input;
  const names = packageNames(plan.name, deps.now());
  const size = outputSize(plan, options.quality);
  const total = renderSeconds(plan);

  await deps.setPhase("Collecting the media…");
  const media = await collectMedia(plan, deps.fetchBytes);

  const dir = await mkdtemp(path.join(tmpdir(), "editor-render-"));
  try {
    const inputs = new Map<number, string>();
    for (const m of plan.media) {
      const name = `m${m.id}${path.extname(m.fileName) || ".mp4"}`;
      await writeFile(path.join(dir, name), media.get(m.id)!);
      inputs.set(m.id, name);
    }
    const ass = options.captions ? buildAss(plan, size) : null;
    if (ass) {
      await writeFile(path.join(dir, "captions.ass"), ass, "utf8");
      await mkdir(path.join(dir, "fonts"));
      for (const f of await deps.readFonts(fontsUsed(plan))) {
        if (f.name.endsWith(".ttf")) await writeFile(path.join(dir, "fonts", f.name), f.bytes);
      }
    }

    await deps.setPhase("Rendering…");
    let reported = 0;
    const output = "out.mp4";
    try {
      await deps.ffmpeg(renderArgs(plan, { quality: options.quality, inputs, output, ass: ass ? "captions.ass" : null, fontsDir: ass ? "fonts" : null }), dir, (seconds) => {
        const pct = total > 0 ? Math.min(99, Math.floor((seconds / total) * 100)) : 0;
        if (pct >= reported + PROGRESS_STEP) {
          reported = pct - (pct % PROGRESS_STEP);
          void deps.setPhase(`Rendering… ${reported}%`).catch(() => {});
        }
      });
    } catch (err) {
      throw new ExportFailure(RENDER_FAILED, { cause: err });
    }

    await deps.setPhase("Saving the video…");
    const bytes = new Uint8Array(await readFile(path.join(dir, output)));
    const url = await deps.upload(bytes, names.video);
    return { url, fileName: names.video, bytes: bytes.byteLength, width: size.width, height: size.height, durationSeconds: total };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
```

`ExportFailure` must accept `{ cause }`: change its constructor in `export-run.ts` to

```ts
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ExportFailure";
  }
```

- [ ] **Step 5: Run the runner test to see it pass**

Run: `npx vitest run src/lib/editor/__tests__/render-run.test.ts src/lib/editor/__tests__/export-run.test.ts`
Expected: PASS.

- [ ] **Step 6: Add the real ffmpeg wrapper**

Append to `src/lib/media/ffmpeg.ts`:

```ts
/** D417 — runs ffmpeg in `cwd` and reports how many seconds of output it has written, from
 *  `-progress pipe:1` (the args must ask for it). Rejects with the tail of stderr on failure. */
export function runFfmpegWithProgress(args: string[], cwd: string, onProgress: (seconds: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin(), args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let pending = "";
    proc.stdout.on("data", (d: Buffer) => {
      pending += d.toString();
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const m = /^out_time_us=(\d+)/.exec(line.trim());
        if (m) onProgress(Number(m[1]) / 1e6);
      }
    });
    proc.stderr.on("data", (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-4000);
    });
    proc.on("error", (e) => reject(new Error(`ffmpeg could not start: ${e.message}`)));
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}: ${stderr.trim()}`))));
  });
}

/** D417 — whether this ffmpeg can burn captions in (built with libass). */
export function ffmpegCanBurnSubtitles(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegBin(), ["-hide_banner", "-filters"], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    proc.stdout.on("data", (d: Buffer) => (out += d.toString()));
    proc.on("error", () => resolve(false));
    proc.on("close", () => resolve(/\sass\s+V->V/.test(out)));
  });
}
```

- [ ] **Step 7: Write the real-ffmpeg test**

`src/lib/editor/__tests__/render-run.ffmpeg.test.ts`:

```ts
// A real render with this machine's ffmpeg (skipped when it has none): two synthetic clips, one
// boxed word-by-word caption. Set EDITOR_RENDER_OUT=<dir> to keep the MP4 and a frame to look at.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readCaptionFontFiles } from "../font-files";
import { runFfmpegWithProgress } from "@/lib/media/ffmpeg";
import { runEditorRender } from "../render-run";
import { planSequence } from "../sequence-plan";
import { CAPTION_PRESETS, DEFAULT_CAPTION_STYLE } from "../caption-style";
import { source } from "./fixtures";

const bin = process.env.FFMPEG_PATH ?? "ffmpeg";
const hasFfmpeg = spawnSync(bin, ["-hide_banner", "-filters"]).stdout?.toString().includes(" ass ") ?? false;

describe.skipIf(!hasFfmpeg)("runEditorRender with real ffmpeg", () => {
  it("renders a playable MP4 of the reel's length and frame, captions burned in", { timeout: 120_000 }, async () => {
    const work = mkdtempSync(path.join(tmpdir(), "render-it-"));
    try {
      const clip = path.join(work, "clip.mp4");
      spawnSync(bin, ["-hide_banner", "-y", "-f", "lavfi", "-i", "testsrc2=size=720x1280:rate=24", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "5.1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", clip]);
      const a = source("a", { handle: "VID-AAAA" });
      const r = planSequence({
        v: 2, captionStyle: { ...DEFAULT_CAPTION_STYLE, ...CAPTION_PRESETS.boxed.look }, shape: "9:16", sources: [],
        pieces: [{ id: "1", sourceNodeId: "a", in: 0, out: 2, picture: "original", sound: "original" }, { id: "2", sourceNodeId: "a", in: 1, out: 3, picture: "original", sound: "original" }],
        captions: [{ id: "c", pieceId: "1", at: 0.2, duration: 1.6, text: "make dosa today", words: [{ text: "make", at: 0.2, duration: 0.5 }, { text: "dosa", at: 0.7, duration: 0.5 }, { text: "today", at: 1.2, duration: 0.6 }] }],
      }, [a], { name: "Render Test" });
      if (!r.ok) throw new Error(r.reason);
      const uploaded: Uint8Array[] = [];
      const result = await runEditorRender({ canvasId: "cv", nodeId: "ed", clientId: "cl", plan: r.plan, options: { quality: "full", captions: true } }, {
        fetchBytes: async () => new Uint8Array(readFileSync(clip)),
        readFonts: readCaptionFontFiles,
        ffmpeg: runFfmpegWithProgress,
        upload: async (bytes) => {
          uploaded.push(bytes);
          return "https://example/out.mp4";
        },
        setPhase: async () => {},
        now: () => new Date("2026-10-26T00:00:00Z"),
      });
      const out = path.join(work, "out.mp4");
      writeFileSync(out, uploaded[0]);
      const probe = spawnSync(bin, ["-hide_banner", "-i", out]).stderr.toString();
      expect(probe).toMatch(/Video: h264.*720x1280/);
      expect(probe).toMatch(/Audio: aac.*48000 Hz, stereo/);
      const m = /Duration: 00:00:(\d+\.\d+)/.exec(probe)!;
      expect(Number(m[1])).toBeCloseTo(4, 0);
      expect(result.fileName).toBe("render-test-2026-10-26.mp4");

      const keep = process.env.EDITOR_RENDER_OUT;
      if (keep) {
        copyFileSync(out, path.join(keep, "render-test.mp4"));
        spawnSync(bin, ["-hide_banner", "-y", "-ss", "0.9", "-i", out, "-frames:v", "1", path.join(keep, "render-test-frame.png")]);
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 8: Run both tests**

Run: `npx vitest run src/lib/editor/__tests__/render-run.test.ts src/lib/editor/__tests__/render-run.ffmpeg.test.ts`
Expected: PASS (the ffmpeg test runs on a machine with ffmpeg + libass, else is skipped).

- [ ] **Step 9: Look at a real frame**

Run (PowerShell): `$env:EDITOR_RENDER_OUT="<scratchpad dir>"; npx vitest run src/lib/editor/__tests__/render-run.ffmpeg.test.ts`
Open `render-test-frame.png`: the boxed caption "MAKE DOSA TODAY" in Montserrat ExtraBold (not a fallback sans), centred low on the frame, "DOSA" in the active colour, "TODAY" dimmed, a dark box behind the line. If the font is a fallback, change `buildAss`'s `Fontname` to the font's family name (Task 1 measured: "Montserrat ExtraBold", "Poppins", "Bebas Neue", "Anton", "Playfair Display") with `Bold` set for Poppins and Playfair, re-run, and record which form libass matched in the commit message.

- [ ] **Step 10: Commit**

```bash
git add src/lib/editor/export-run.ts src/lib/editor/render-run.ts src/lib/media/ffmpeg.ts src/lib/editor/__tests__/render-run.test.ts src/lib/editor/__tests__/render-run.ffmpeg.test.ts
git commit -m "feat(editor): render the MP4 in a temp dir with progress; a real ffmpeg render test (D417)"
```

---

### Task 5: Storage, the background task and the routes

**Files:**
- Modify: `src/lib/jobs/types.ts` (`JobKind` gains `"editor-render"`)
- Modify: `src/lib/storage/index.ts` (`uploadEditorRender`)
- Create: `src/lib/editor/plan-saved-reel.ts` (shared by both start routes)
- Modify: `src/app/api/canvases/[cid]/editor/exports/route.ts` (use it)
- Create: `src/app/api/canvases/[cid]/editor/renders/route.ts`, `src/app/api/canvases/[cid]/editor/renders/[jobId]/route.ts`, `src/app/api/canvases/[cid]/editor/renders/route.test.ts`
- Create: `trigger/editor-render.ts`

**Interfaces:**
- Consumes: `runEditorRender`, `RenderJobInput`, `RenderResult`, `RenderStatus` (Task 4); `runFfmpegWithProgress`, `ffmpegCanBurnSubtitles` (Task 4); `pathForEditorExport({ ..., fileName })`.
- Produces: `POST /api/canvases/:cid/editor/renders` body `{ nodeId: uuid, quality: "full" | "quick", captions: boolean }` → `202 { jobId }`; `GET /api/canvases/:cid/editor/renders/:jobId` → `RenderStatus`. `planSavedReel(canvas: CanvasRow, nodeId: string): Promise<{ ok: true; plan: SequencePlan; orgId: string } | { ok: false; status: 404 | 422; reason: string }>`.

- [ ] **Step 1: Extract `planSavedReel` from the exports route**

Create `src/lib/editor/plan-saved-reel.ts`:

```ts
// The reel planned from its SAVED edit, read fresh on the server (rule 10), named after the client
// and canvas (D416), with pauses as markers (D409). Shared by the Premiere and MP4 exports (D417).
import "server-only";
import { resolveOrgId } from "@/lib/dal";
import { getClientById } from "@/lib/db/clients";
import { listTranscripts } from "@/lib/db/media-transcripts";
import type { CanvasRow } from "@/lib/db/types";
import { loadEditorState } from "./load-state";
import { reelName } from "./package";
import { pausesFromWords } from "./pauses";
import { planSequence, type SequencePlan } from "./sequence-plan";
import { planTranscription } from "./transcribe-plan";

export type SavedReelPlan = { ok: true; plan: SequencePlan; orgId: string } | { ok: false; status: 404 | 422; reason: string };

export async function planSavedReel(canvas: CanvasRow, nodeId: string): Promise<SavedReelPlan> {
  const [state, orgId, client] = await Promise.all([loadEditorState(canvas.id), resolveOrgId(), getClientById(canvas.client_id)]);
  if (!state || state.editorNodeId !== nodeId) return { ok: false, status: 404, reason: "Editor not found." };
  const { files } = planTranscription(state.doc, state.sources);
  const transcripts = await listTranscripts(files.map((f) => f.url));
  const pauses = new Map([...transcripts].map(([url, t]) => [url, pausesFromWords(t.words)] as const));
  const planned = planSequence(state.doc, state.sources, { pauses, name: reelName(client?.name, canvas.name) });
  return planned.ok ? { ok: true, plan: planned.plan, orgId } : { ok: false, status: 422, reason: planned.reason };
}
```

In `exports/route.ts`, replace the block from `const [state, orgId, client] = …` through `if (!planned.ok) return apiError(planned.reason, 422);` with:

```ts
      const reel = await planSavedReel(canvas, nodeId);
      if (!reel.ok) return apiError(reel.reason, reel.status);
      const { plan, orgId } = reel;
```

and use `plan` where it used `planned.plan`. Remove the now-unused imports. The route test mocks `@/lib/editor/load-state`, `@/lib/editor/sequence-plan`, `@/lib/db/clients`, `@/lib/dal` and `@/lib/db/media-transcripts`, which the helper imports, so it keeps working; it mocks `server-only` already.

Run: `npx vitest run "src/app/api/canvases/[cid]/editor/exports"`
Expected: PASS. (The supabase mock's canvas row has `id: "cv1"`, so `loadEditorState(canvas.id)` is called with the same id as before.)

- [ ] **Step 2: Write the failing renders route test**

`src/app/api/canvases/[cid]/editor/renders/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({ userId: "u1", orgId: "org-1", orgRole: "owner" })),
  resolveOrgId: vi.fn(async () => "org-1"),
}));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })) }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "cv1", client_id: "cl1", name: "Reel 2", clients: { org_id: "org-1" } }, error: null }) }) }) }),
  }),
}));
vi.mock("@/lib/editor/plan-saved-reel", () => ({ planSavedReel: vi.fn() }));
vi.mock("@trigger.dev/sdk", () => ({ tasks: { trigger: vi.fn() } }));
vi.mock("@/lib/jobs/db", () => ({ insertJob: vi.fn(), failStaleJobs: vi.fn(), setJobRunId: vi.fn(), failJob: vi.fn(), getJob: vi.fn() }));

import { tasks } from "@trigger.dev/sdk";
import { getJob, insertJob } from "@/lib/jobs/db";
import { JobLockedError } from "@/lib/jobs/types";
import { planSavedReel } from "@/lib/editor/plan-saved-reel";
import { POST } from "./route";
import { GET } from "./[jobId]/route";

const NODE = "11111111-1111-4111-8111-111111111111";
const post = (body: unknown) => POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ cid: "cv1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(planSavedReel).mockResolvedValue({ ok: true, plan: { name: "p" } as never, orgId: "org-1" });
  vi.mocked(insertJob).mockResolvedValue({ id: "job1" } as never);
  vi.mocked(tasks.trigger).mockResolvedValue({ id: "run1" } as never);
});

describe("POST /api/canvases/[cid]/editor/renders", () => {
  it("starts a render of the saved reel with the chosen options", async () => {
    const res = await post({ nodeId: NODE, quality: "quick", captions: false });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ jobId: "job1" });
    expect(insertJob).toHaveBeenCalledWith(expect.objectContaining({
      kind: "editor-render",
      lockKey: `editor-render:${NODE}`,
      input: { canvasId: "cv1", nodeId: NODE, clientId: "cl1", plan: { name: "p" }, options: { quality: "quick", captions: false } },
    }));
    expect(tasks.trigger).toHaveBeenCalledWith("editor-render", { jobId: "job1" });
  });

  it("refuses bad options", async () => {
    expect((await post({ nodeId: NODE, quality: "4k", captions: true })).status).toBe(400);
  });

  it("passes on why the reel can't be planned", async () => {
    vi.mocked(planSavedReel).mockResolvedValue({ ok: false, status: 422, reason: "Add a clip to the timeline first." });
    const res = await post({ nodeId: NODE, quality: "full", captions: true });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Add a clip to the timeline first." });
  });

  it("refuses a second render while one runs", async () => {
    vi.mocked(insertJob).mockRejectedValue(new JobLockedError(`editor-render:${NODE}`));
    expect((await post({ nodeId: NODE, quality: "full", captions: true })).status).toBe(409);
  });
});

describe("GET /api/canvases/[cid]/editor/renders/[jobId]", () => {
  it("shows only this canvas's renders", async () => {
    vi.mocked(getJob).mockResolvedValue({ kind: "editor-render", status: "running", phase_message: "Rendering… 40%", error: null, result: null, input: { canvasId: "cv1" } } as never);
    const ok = await GET(new Request("http://x"), { params: Promise.resolve({ cid: "cv1", jobId: "job1" }) });
    expect(await ok.json()).toEqual({ status: "running", phase: "Rendering… 40%", error: null, result: null });
    vi.mocked(getJob).mockResolvedValue({ kind: "editor-export", input: { canvasId: "cv1" } } as never);
    expect((await GET(new Request("http://x"), { params: Promise.resolve({ cid: "cv1", jobId: "job1" }) })).status).toBe(404);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run "src/app/api/canvases/[cid]/editor/renders"`
Expected: FAIL (route modules missing).

- [ ] **Step 4: Implement the routes, job kind and storage**

`src/lib/jobs/types.ts`: `export type JobKind = "asset-import" | "image-analysis" | "editor-export" | "editor-transcribe" | "editor-render";`

`src/lib/storage/index.ts`, after `uploadEditorExport`:

```ts
/** D417 — the editor's MP4, saved under its own name and downloaded as it. */
export async function uploadEditorRender(path: string, bytes: Uint8Array, fileName: string): Promise<UploadResult> {
  await _put(path, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), "video/mp4", {
    contentDisposition: `attachment; filename="${fileName}"`,
  });
  return { path, url: publicUrlFor(path) };
}
```

`src/app/api/canvases/[cid]/editor/renders/route.ts`:

```ts
import { tasks } from "@trigger.dev/sdk";
import * as z from "zod";
import { apiError, apiOk, withCanvas, withTryCatch } from "@/lib/api/route-helpers";
import { planSavedReel } from "@/lib/editor/plan-saved-reel";
import type { RenderJobInput } from "@/lib/editor/render-run";
import { failJob, failStaleJobs, insertJob, setJobRunId } from "@/lib/jobs/db";
import { JobLockedError } from "@/lib/jobs/types";

// Starts an MP4 render (D417) of the SAVED edit, planned exactly as the Premiere export is. The
// task payload is the job id only (rule 8); the plan and the options travel in the job's input.
// One render per Editor at a time; it can run beside a Premiere export.

const STALE_RENDER_MS = 20 * 60 * 1000;
const BodySchema = z.object({ nodeId: z.uuid(), quality: z.enum(["full", "quick"]), captions: z.boolean() });

export async function POST(req: Request, { params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  return withCanvas(req, Promise.resolve({ id: cid }), async (canvasId, canvas) =>
    withTryCatch("Couldn't start the video.", async () => {
      const parsed = BodySchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Choose a quality for the video.", 400);
      const { nodeId, quality, captions } = parsed.data;

      const reel = await planSavedReel(canvas, nodeId);
      if (!reel.ok) return apiError(reel.reason, reel.status);

      const clientId = canvas.client_id;
      await failStaleJobs(clientId, "editor-render", STALE_RENDER_MS);
      let jobId: string;
      try {
        const input: RenderJobInput = { canvasId, nodeId, clientId, plan: reel.plan, options: { quality, captions } };
        const job = await insertJob({ orgId: reel.orgId, clientId, kind: "editor-render", input, lockKey: `editor-render:${nodeId}`, phaseMessage: "Queued…" });
        jobId = job.id;
      } catch (err) {
        if (err instanceof JobLockedError) return apiError("A video of this reel is already rendering.", 409);
        throw err;
      }

      try {
        const run = await tasks.trigger("editor-render", { jobId });
        await setJobRunId(jobId, run.id);
      } catch {
        await failJob(jobId, "Couldn't start the video. Try again.");
        return apiError("Couldn't start the video. Try again.", 502);
      }
      return apiOk({ jobId }, 202);
    }),
  );
}
```

`src/app/api/canvases/[cid]/editor/renders/[jobId]/route.ts`:

```ts
import { apiError, apiOk, withCanvas, withTryCatch } from "@/lib/api/route-helpers";
import type { RenderJobInput, RenderResult, RenderStatus } from "@/lib/editor/render-run";
import { getJob } from "@/lib/jobs/db";

// The MP4 dialog polls this (D417). A render is only visible through the canvas it renders.
export async function GET(req: Request, { params }: { params: Promise<{ cid: string; jobId: string }> }) {
  const { cid, jobId } = await params;
  return withCanvas(req, Promise.resolve({ id: cid }), async (canvasId) =>
    withTryCatch("Couldn't read the video.", async () => {
      const job = await getJob<RenderJobInput, RenderResult>(jobId);
      if (!job || job.kind !== "editor-render" || job.input?.canvasId !== canvasId) return apiError("Video not found.", 404);
      const status: RenderStatus = { status: job.status, phase: job.phase_message, error: job.error, result: job.result };
      return apiOk(status);
    }),
  );
}
```

Check the exact type `withCanvas` passes as `canvas` (`CanvasRow`) matches `planSavedReel`'s parameter; it is `CanvasRow` from `@/lib/db/types`.

- [ ] **Step 5: Run the route tests**

Run: `npx vitest run "src/app/api/canvases/[cid]/editor"`
Expected: PASS.

- [ ] **Step 6: The background task**

`trigger/editor-render.ts`:

```ts
// trigger/editor-render.ts
// Renders the Rough Cut Editor's reel as an MP4 (D417): downloads the reel's media, burns in the
// captions when asked, encodes, and uploads. Progress and the result go on the background_jobs row
// the MP4 dialog polls. Every @/lib import is dynamic (see editor-export.ts). One attempt: nothing
// is paid for, and a failure is shown to the user, who can try again.
import { AbortTaskRunError, logger, task } from "@trigger.dev/sdk";

const STOPPED = "The video stopped before it finished. Try again.";
const NOT_READY = "Videos with captions can't be made right now. Try again without captions, or later.";

export const editorRenderTask = task({
  id: "editor-render",
  // x264 is CPU-bound: two cores roughly halve a reel's render.
  machine: "medium-2x",
  maxDuration: 900,
  retry: { maxAttempts: 1 },
  run: async (payload: { jobId: string }) => {
    const [jobs, { runEditorRender }, { ExportFailure, DownloadError }, storage, { readCaptionFontFiles }, ffmpeg, { pathForEditorExport }] = await Promise.all([
      import("@/lib/jobs/db"),
      import("@/lib/editor/render-run"),
      import("@/lib/editor/export-run"),
      import("@/lib/storage"),
      import("@/lib/editor/font-files"),
      import("@/lib/media/ffmpeg"),
      import("@/lib/storage/paths"),
    ]);
    type Input = import("@/lib/editor/render-run").RenderJobInput;

    const job = await jobs.getJob<Input>(payload.jobId);
    if (!job) throw new AbortTaskRunError(`No render job ${payload.jobId}`);
    const input = job.input;
    await jobs.startJob(job.id, "Collecting the media…");
    try {
      if (input.options.captions && input.plan.titles.length > 0 && !(await ffmpeg.ffmpegCanBurnSubtitles())) {
        logger.error("ffmpeg in this image has no libass: captions can't be burned in");
        throw new ExportFailure(NOT_READY);
      }
      const result = await runEditorRender(input, {
        fetchBytes: async (url) => {
          const res = await fetch(url);
          if (!res.ok) throw new DownloadError(res.status);
          return new Uint8Array(await res.arrayBuffer());
        },
        readFonts: readCaptionFontFiles,
        ffmpeg: ffmpeg.runFfmpegWithProgress,
        upload: async (bytes, fileName) => {
          const path = pathForEditorExport({ clientId: input.clientId, canvasId: input.canvasId, nodeId: input.nodeId, jobId: job.id, fileName });
          return (await storage.uploadEditorRender(path, bytes, fileName)).url;
        },
        setPhase: (message) => jobs.setJobPhase(job.id, message),
        now: () => new Date(),
      });
      await jobs.succeedJob(job.id, result, "Done");
      return { url: result.url, bytes: result.bytes };
    } catch (err) {
      if (err instanceof Error && err.cause) logger.error("render failed", { cause: String(err.cause) });
      const message = err instanceof ExportFailure ? err.message : "The video couldn't be rendered. Try again.";
      await jobs.failJob(job.id, message);
      throw new AbortTaskRunError(message);
    }
  },
  // A timeout or out-of-memory never reaches the catch above: settle the job here.
  onFailure: async ({ payload }) => {
    const [{ getJob, failJob }, { JOB_LIVE_STATUSES }] = await Promise.all([import("@/lib/jobs/db"), import("@/lib/jobs/types")]);
    const job = await getJob(payload.jobId);
    if (job && JOB_LIVE_STATUSES.has(job.status)) await failJob(job.id, STOPPED);
  },
});
```

- [ ] **Step 7: Typecheck and lint**

Run: `npx tsc --noEmit -p .` (ignore pre-existing `.next/types` errors) and `npx eslint trigger/editor-render.ts src/lib/editor src/lib/storage src/lib/jobs "src/app/api/canvases/[cid]/editor"`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/jobs/types.ts src/lib/storage/index.ts src/lib/editor/plan-saved-reel.ts "src/app/api/canvases/[cid]/editor/exports/route.ts" "src/app/api/canvases/[cid]/editor/renders" trigger/editor-render.ts
git commit -m "feat(editor): the editor-render task and routes to start and poll an MP4 (D417)"
```

---

### Task 6: Service, query hooks and the Export menu with the MP4 dialog

**Files:**
- Modify: `src/services/editor.service.ts` (`startRender`, `renderStatus`)
- Modify: `src/hooks/queries/editor.ts` (`editorKeys.render`, `useStartRender`, `useRenderStatus`)
- Modify: `src/components/editor/editor-export-button.tsx` (dropdown)
- Create: `src/components/editor/editor-render-dialog.tsx`

**Interfaces:**
- Consumes: routes from Task 5; `RenderStatus`, `RenderQuality` types.
- Produces: `editorService.startRender(canvasId, body: { nodeId: string; quality: RenderQuality; captions: boolean }): Promise<{ jobId: string }>`; `editorService.renderStatus(canvasId, jobId): Promise<RenderStatus>`; `useStartRender(canvasId)`; `useRenderStatus(canvasId, jobId | null)`; `<EditorRenderDialog canvasId nodeId open onClose flush />`.

- [ ] **Step 1: Service methods** (after `exportStatus`):

```ts
  /** Starts an MP4 render of the saved edit (D417). */
  async startRender(canvasId: string, body: { nodeId: string; quality: RenderQuality; captions: boolean }): Promise<{ jobId: string }> {
    const res = await fetch(`/api/canvases/${canvasId}/editor/renders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return readJson(res, "Couldn't start the video.");
  }

  async renderStatus(canvasId: string, jobId: string): Promise<RenderStatus> {
    const res = await fetch(`/api/canvases/${canvasId}/editor/renders/${jobId}`);
    return readJson(res, "Couldn't read the video.");
  }
```

with `import type { RenderStatus } from "@/lib/editor/render-run";` and `import type { RenderQuality } from "@/lib/editor/render-plan";`.

- [ ] **Step 2: Query hooks.** In `editorKeys` add `render: (canvasId: string, jobId: string) => [...editorKeys.all(canvasId), "render", jobId] as const,`. After `useExportStatus`:

```ts
export function useStartRender(canvasId: string) {
  return useMutation({ mutationFn: (body: { nodeId: string; quality: RenderQuality; captions: boolean }) => editorService.startRender(canvasId, body) });
}

/** An MP4 render's progress, polled until it finishes (D417). */
export function useRenderStatus(canvasId: string, jobId: string | null) {
  return useQuery<RenderStatus>({
    queryKey: editorKeys.render(canvasId, jobId ?? ""),
    queryFn: () => editorService.renderStatus(canvasId, jobId!),
    enabled: Boolean(canvasId && jobId),
    refetchInterval: (q) => (!q.state.data || JOB_LIVE_STATUSES.has(q.state.data.status) ? EXPORT_POLL_MS : false),
  });
}
```

- [ ] **Step 3: The MP4 dialog** `src/components/editor/editor-render-dialog.tsx`:

```tsx
"use client";
// The MP4 export (D417): two options (quality; burn in captions, only when there are captions),
// then progress, then the download. Closing doesn't stop a render: reopening shows its progress.
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useRenderStatus, useStartRender } from "@/hooks/queries/editor";
import { SaveFailure } from "@/lib/editor/autosave";
import type { RenderQuality } from "@/lib/editor/render-plan";
import { formatTime } from "@/lib/editor/timeline";
import { formatBytes } from "@/lib/kb/utils";
import { ApiError } from "@/services/read-json";
import { EditorChoiceToggle } from "./editor-choice-toggle";
import { useEditorStore } from "./editor-store-provider";

const QUALITY_HINT: Record<RenderQuality, string> = {
  full: "The reel's full size. Best for posting.",
  quick: "720p. Faster and smaller, for sending or a quick check.",
};

export function EditorRenderDialog({ canvasId, nodeId, open, onClose, flush }: {
  canvasId: string;
  nodeId: string;
  open: boolean;
  onClose(): void;
  flush(): Promise<void>;
}) {
  const start = useStartRender(canvasId);
  const [jobId, setJobId] = useState<string | null>(null);
  const [quality, setQuality] = useState<RenderQuality>("full");
  const [captions, setCaptions] = useState(true);
  const hasCaptions = useEditorStore((s) => s.doc.captions.length > 0);
  const { data } = useRenderStatus(canvasId, jobId);
  const result = data?.status === "succeeded" ? data.result : null;
  const failed = data?.status === "failed";
  const choosing = jobId === null;

  const begin = async () => {
    try {
      await flush();
      const { jobId: id } = await start.mutateAsync({ nodeId, quality, captions: hasCaptions && captions });
      setJobId(id);
    } catch (err) {
      if (err instanceof SaveFailure) toast.error(`Your latest changes aren't saved, so the video didn't start. ${err.message}`);
      else toast.error(err instanceof ApiError || err instanceof Error ? err.message : "Couldn't start the video.");
    }
  };
  const close = () => {
    onClose();
    if (result || failed) setJobId(null);
  };

  const title = choosing ? "Export an MP4" : result ? "Your video is ready" : failed ? "The video didn't finish" : "Rendering your video";
  const description = choosing
    ? "A finished video with everything in the reel: trims, dubs and lip sync."
    : result
      ? `${formatTime(result.durationSeconds)} · ${result.width}×${result.height} · ${formatBytes(result.bytes)}`
      : failed
        ? data?.error
        : (data?.phase ?? "Starting…");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="flex w-[460px] max-w-[calc(100%-2rem)] flex-col gap-5 rounded-[18px] p-6 sm:max-w-[460px]">
        <div className="flex flex-col gap-1.5">
          <DialogTitle className="font-display text-xl font-semibold">{title}</DialogTitle>
          <DialogDescription className="text-sm tabular-nums text-muted-foreground">{description}</DialogDescription>
        </div>

        {choosing && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold">Quality</span>
              <EditorChoiceToggle
                label="Quality"
                value={quality}
                options={[
                  { value: "full", label: "Full", available: true },
                  { value: "quick", label: "Quick", available: true },
                ]}
                onChange={setQuality}
              />
              <span className="text-xs text-muted-foreground">{QUALITY_HINT[quality]}</span>
            </div>
            {hasCaptions && (
              <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
                <Label htmlFor="render-captions" className="flex flex-col items-start gap-0.5">
                  <span className="text-[13px] font-semibold">Burn in captions</span>
                  <span className="text-xs font-normal text-muted-foreground">Off if you'll add the platform's own captions.</span>
                </Label>
                <Switch id="render-captions" checked={captions} onCheckedChange={(v) => setCaptions(Boolean(v))} />
              </div>
            )}
          </div>
        )}

        {!choosing && !result && !failed && (
          <div className="flex items-center gap-2.5 text-sm">
            <Loader2 className="size-4 animate-spin text-primary" strokeWidth={1.5} />
            You can close this. The video keeps rendering.
          </div>
        )}

        <div className="flex justify-end gap-2.5 border-t border-border pt-4">
          <Button variant="outline" onClick={close}>Close</Button>
          {choosing && (
            <Button onClick={() => void begin()} disabled={start.isPending} className="gap-2 font-semibold">
              {start.isPending && <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />}
              Export
            </Button>
          )}
          {failed && <Button onClick={() => void begin()}>Try again</Button>}
          {result && (
            <Button nativeButton={false} render={<a href={result.url} download={result.fileName} />} className="min-w-0 gap-2 font-semibold">
              <Download className="size-4 flex-none" strokeWidth={1.5} />
              <span className="truncate">Download {result.fileName}</span>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

Before using `Switch`, open `src/components/ui/switch.tsx` and confirm its change prop (`onCheckedChange`) and value prop (`checked`); adapt the two props if they differ.

- [ ] **Step 4: The Export menu.** In `editor-export-button.tsx`, keep the Premiere `run` logic; replace the single button with:

```tsx
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button disabled={!hasPieces || start.isPending} className="h-[38px] gap-2 rounded-[10px] px-4 font-semibold">
              <Download className="size-4" strokeWidth={1.5} />
              Export
              <ChevronDown className="size-4 opacity-70" strokeWidth={1.5} />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuItem onClick={() => setMp4Open(true)} className="items-start gap-3 py-2">
            <Film className="mt-0.5 size-4" strokeWidth={1.5} />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">MP4 video</span>
              <span className="text-xs text-muted-foreground">Ready to post or send</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void run()} className="items-start gap-3 py-2">
            <Clapperboard className="mt-0.5 size-4" strokeWidth={1.5} />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">Premiere Pro package</span>
              <span className="text-xs text-muted-foreground">An editable sequence for your editor</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
```

add `const [mp4Open, setMp4Open] = useState(false);`, render `<EditorRenderDialog canvasId={canvasId} nodeId={nodeId} open={mp4Open} onClose={() => setMp4Open(false)} flush={flush} />` after `EditorExportDialog`, import `ChevronDown, Clapperboard, Film` from `lucide-react`, the dropdown parts from `@/components/ui/dropdown-menu`, and update the file's doc comment to "Export (D417): an MP4 video or the Premiere package (spec §9)".

- [ ] **Step 5: Typecheck, lint, editor tests**

Run: `npx tsc --noEmit -p .` ; `npx eslint src/components/editor src/hooks/queries src/services` ; `npx vitest run src/lib/editor "src/app/api/canvases/[cid]/editor"`
Expected: no new errors; tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/editor.service.ts src/hooks/queries/editor.ts src/components/editor/editor-export-button.tsx src/components/editor/editor-render-dialog.tsx
git commit -m "feat(editor): Export menu with MP4 video (Full or Quick, captions on or off) and the Premiere package (D417)"
```

---

### Task 7: Verify end to end, and confirm the deployed ffmpeg

**Files:**
- Modify (only if the deployed check fails): `trigger.config.ts` (`ffmpeg({ version: "7.0.2" })` or the version the docs name for a static build)
- Modify: `docs/superpowers/specs/2026-10-26-editor-mp4-export-design.md` (§7, the outcome of the checks)

- [ ] **Step 1: Run the local Trigger.dev worker** (`npx trigger.dev dev`) and the app (`npm run dev`), open `/clients/jackfruit-365/canvases/reel-2/edit`.

- [ ] **Step 2: Export → MP4 video → Full, captions on → Export.** Expected: progress phases, then **Download jackfruit-365-reel-2-<date>.mp4**. Play it: clip order and trims as on the timeline, the dubbed clip plays the Tamil dub, the lip-synced clip shows the lip-synced picture, captions in the reel's font and place with the word highlight in time with speech.

- [ ] **Step 3: Quick with captions off.** Expected: 720×1280, no captions, smaller file.

- [ ] **Step 4: Confirm the deployed image burns captions.** After the next staging deploy of the Trigger.dev tasks, run one MP4 with captions on staging. If it fails with "Videos with captions can't be made right now…", the image's ffmpeg lacks libass: set `ffmpeg({ version: "<static version from Trigger.dev's ffmpeg extension docs>" })` in `trigger.config.ts` (static builds include libass), redeploy, retry, and commit that change.

- [ ] **Step 5: Record the outcome** in the spec's §7 (fidelity seen, render time for the 29 s Reel 2, whether the static ffmpeg was needed), then commit:

```bash
git add docs/superpowers/specs/2026-10-26-editor-mp4-export-design.md trigger.config.ts
git commit -m "docs(editor): MP4 export verified on Reel 2 (D417)"
```
