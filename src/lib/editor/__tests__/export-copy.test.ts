import { describe, expect, it } from "vitest";
import type { ExportSummary } from "../export-run";
import { exportChecklist, exportSubtitle } from "../export-copy";

const base: ExportSummary = { clips: 3, lipSynced: 1, dubs: 1, captions: 2, fonts: 1, durationSeconds: 13.2, shape: "9:16", fps: 24 };
const MB = 1024 * 1024;

describe("export checklist (Export artboard)", () => {
  it("lists what was collected, written and packaged", () => {
    expect(exportChecklist(base, 26.1 * MB)).toEqual([
      "Collected 3 clips, 1 lip-synced video and 1 dub",
      "Wrote the sequence, 2 captions and the font file",
      "Packaged creativeos-reel.zip · 26.1 MB",
    ]);
  });

  it("speaks of one clip, and leaves out what isn't there", () => {
    const [collected, wrote] = exportChecklist({ ...base, clips: 1, lipSynced: 0, dubs: 0, captions: 0, fonts: 0 }, MB);
    expect(collected).toBe("Collected 1 clip");
    expect(wrote).toBe("Wrote the sequence");
  });

  it("joins two extras with 'and', and counts font files", () => {
    const [collected, wrote] = exportChecklist({ ...base, lipSynced: 2, dubs: 0, captions: 1, fonts: 2 }, MB);
    expect(collected).toBe("Collected 3 clips and 2 lip-synced videos");
    expect(wrote).toBe("Wrote the sequence, 1 caption and the font files");
  });

  it("writes the subtitle", () => {
    expect(exportSubtitle("Reel 2 · rough cut", base, 4)).toBe("Reel 2 · rough cut · 4 pieces · 00:13.20 · 9:16 · 24 fps");
  });
});
