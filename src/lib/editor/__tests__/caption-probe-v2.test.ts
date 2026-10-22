// The word-by-word caption probe (D398, step 0): writes a media-free XML with one 9:16 sequence
// per title feature the auto-captions build relies on: per-word colour, hidden words, outline,
// box, and two short word-by-word lines. Runs only when EDITOR_PROBE_OUT (a folder) is set.
// Import the result by dragging it into Premiere's Project panel, open each sequence and play it.
// Arial Bold is used so nothing needs installing; the real export ships its own fonts.
import { describe, it } from "vitest";
import { titleClipitem, type TextRun, type TitleSpec } from "../premiere-title";
import { rate, serialize, timecode, x } from "../xml-node";

const OUT = process.env.EDITOR_PROBE_OUT;
const FPS = 24;
const W = 1080;
const H = 1920;
const FONT = "Arial-BoldMT";

type Clip = { title: TitleSpec; start: number; end: number };

/** Character ranges of each word in `text`. */
function wordRanges(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (const m of text.matchAll(/\S+/g)) out.push({ start: m.index!, end: m.index! + m[0].length });
  return out;
}

/** One clip per word, `framesPerWord` long, the active word coloured; `upcoming` styles the rest. */
function wordByWord(text: string, framesPerWord: number, base: Omit<TitleSpec, "text" | "runs">, active: string, upcoming: (r: { start: number; end: number }) => TextRun | null): Clip[] {
  const words = wordRanges(text);
  return words.map((w, i) => {
    const runs: TextRun[] = [{ ...w, color: active }];
    for (const later of words.slice(i + 1)) {
      const r = upcoming(later);
      if (r) runs.push(r);
    }
    return { title: { ...base, text, runs }, start: i * framesPerWord, end: (i + 1) * framesPerWord };
  });
}

const base = { fontPostScript: FONT, sizePx: 110, color: "#ffffff", x: 0.5, y: 0.5 };
const outline = { color: "#000000", widthPx: 10 };

const SEQUENCES: { name: string; clips: Clip[] }[] = [
  { name: "1 One word coloured (WORD is yellow)", clips: [{ title: { ...base, text: "THIS WORD LIGHTS UP", runs: [{ start: 5, end: 9, color: "#ffca2d" }] }, start: 0, end: 72 }] },
  { name: "2 Hidden word (HIDDEN is invisible, line stays centred as if it were there)", clips: [{ title: { ...base, text: "SAID SO FAR HIDDEN", stroke: outline, runs: [{ start: 12, end: 18, hidden: true }] }, start: 0, end: 72 }] },
  { name: "3 Outline (black, 10 px)", clips: [{ title: { ...base, text: "OUTLINED TEXT", stroke: outline }, start: 0, end: 72 }] },
  { name: "4 Box (black at 72%, no shadow)", clips: [{ title: { ...base, sizePx: 70, text: "Boxed caption", box: { color: "#111111", opacity: 72, sizePx: 14 } }, start: 0, end: 72 }] },
  { name: "5 Karaoke: words appear one by one", clips: wordByWord("I JUST STARTED ADDING", 12, { ...base, stroke: outline }, "#ffca2d", (r) => ({ ...r, hidden: true })) },
  { name: "6 Highlight: said word yellow, upcoming dimmed", clips: wordByWord("MIX IT IN PROPERLY", 12, { ...base, sizePx: 90, box: { color: "#111111", opacity: 72, sizePx: 14 } }, "#c4b5fd", (r) => ({ ...r, color: "#7d7d7d" })) },
];

function sequence(id: string, name: string, clips: Clip[], n0: number): string {
  const len = Math.max(...clips.map((c) => c.end));
  const items = clips.map((c, i) => serialize(titleClipitem({ n: n0 + i, title: c.title, start: c.start, end: c.end, fps: FPS, width: W, height: H }), 6)).join("\n");
  return serialize(
    x("sequence", { id },
      x("name", null, name),
      x("duration", null, len),
      rate(FPS),
      timecode(FPS),
      x("media", null,
        x("video", null,
          x("format", null, x("samplecharacteristics", null, rate(FPS), x("width", null, W), x("height", null, H), x("pixelaspectratio", null, "square"))),
          x("track", null, "__CLIPS__"),
        ),
        x("audio", null, x("numOutputChannels", null, 2), x("track", null)),
      ),
    ), 3,
  ).replace("__CLIPS__", `\n${items}\n`);
}

describe.skipIf(!OUT)("caption probe v2 (manual)", () => {
  it("writes caption-probe-v2.xml", async () => {
    const fs = await import("node:fs");
    let n = 1;
    const seqs = SEQUENCES.map((s, i) => {
      const xml = sequence(`sequence-${i + 1}`, s.name, s.clips, n);
      n += s.clips.length;
      return xml;
    });
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<!DOCTYPE xmeml>",
      '<xmeml version="4">',
      "  <project>",
      "    <name>CreativeOS caption probe v2</name>",
      "    <children>",
      ...seqs,
      "    </children>",
      "  </project>",
      "</xmeml>",
      "",
    ].join("\n");
    fs.writeFileSync(`${OUT}/caption-probe-v2.xml`, xml);
  });
});
