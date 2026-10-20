// The caption probe (D392): writes a media-free XML with two sequences, to re-check titles on a
// new Premiere version. A = a title written by our code, B = the title clipitem copied verbatim
// from a Premiere-exported file (OpenTimelineIO's premiere_generators.xml). Runs only when
// EDITOR_PROBE_OUT (a folder) and EDITOR_PREMIERE_SAMPLE (that file) are set. Import the result
// by dragging it into Premiere's Project panel, then compare the two sequences.
import { describe, it } from "vitest";
import { titleClipitem } from "../premiere-title";
import { rate, serialize, timecode, x } from "../xml-node";

const OUT = process.env.EDITOR_PROBE_OUT;
const SAMPLE = process.env.EDITOR_PREMIERE_SAMPLE;
const FPS = 24000 / 1001; // the sample's rate (timebase 24, NTSC)
const LEN = 119;

describe.skipIf(!OUT || !SAMPLE)("caption probe (manual)", () => {
  it("writes caption-probe.xml", async () => {
    const fs = await import("node:fs");
    const sample = fs.readFileSync(SAMPLE!, "utf8");
    const startAt = sample.indexOf('<clipitem id="clipitem-6">');
    const endAt = sample.indexOf("</clipitem>", startAt) + "</clipitem>".length;
    const premiereTitle = sample.slice(startAt, endAt)
      .replace("<start>737</start>", "<start>0</start>")
      .replace("<end>856</end>", `<end>${LEN}</end>`);

    const ours = serialize(titleClipitem({
      n: 1,
      title: { text: "PROBE A: our title", fontPostScript: "Arial-BoldMT", sizePx: 100, color: "#ffffff", x: 0.5, y: 0.5 },
      start: 0, end: LEN, fps: FPS, width: 1920, height: 1080,
    }), 6);

    const sequence = (id: string, name: string, clip: string) => serialize(
      x("sequence", { id },
        x("name", null, name),
        x("duration", null, LEN),
        rate(FPS),
        timecode(FPS),
        x("media", null,
          x("video", null,
            x("format", null, x("samplecharacteristics", null, rate(FPS), x("width", null, 1920), x("height", null, 1080), x("pixelaspectratio", null, "square"))),
            x("track", null, "__CLIP__"),
          ),
          x("audio", null, x("numOutputChannels", null, 2), x("track", null)),
        ),
      ), 3,
    ).replace("__CLIP__", `\n${clip}\n`);

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<!DOCTYPE xmeml>",
      '<xmeml version="4">',
      "  <project>",
      "    <name>CreativeOS caption probe</name>",
      "    <children>",
      sequence("sequence-a", "PROBE A: our title", ours),
      sequence("sequence-b", "PROBE B: Premiere's own title", premiereTitle),
      "    </children>",
      "  </project>",
      "</xmeml>",
      "",
    ].join("\n");
    fs.writeFileSync(`${OUT}/caption-probe.xml`, xml);
  });
});
