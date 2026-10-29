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
