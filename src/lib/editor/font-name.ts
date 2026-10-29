// Reads a font file's PostScript name (name ID 6 in the OpenType `name` table). Premiere picks a
// caption's font by this name (D393), so a test holds every shipped file to the name we write.

const POSTSCRIPT_NAME_ID = 6;

export function readPostScriptName(ttf: Uint8Array): string | null {
  if (ttf.byteLength < 12) return null;
  const view = new DataView(ttf.buffer, ttf.byteOffset, ttf.byteLength);
  const numTables = view.getUint16(4);
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (rec + 16 > ttf.byteLength) return null;
    const tag = String.fromCharCode(ttf[rec], ttf[rec + 1], ttf[rec + 2], ttf[rec + 3]);
    if (tag !== "name") continue;
    return readNameTable(view, view.getUint32(rec + 8));
  }
  return null;
}

function readNameTable(view: DataView, table: number): string | null {
  const count = view.getUint16(table + 2);
  const strings = table + view.getUint16(table + 4);
  for (let i = 0; i < count; i++) {
    const rec = table + 6 + i * 12;
    if (view.getUint16(rec + 6) !== POSTSCRIPT_NAME_ID) continue;
    const platform = view.getUint16(rec);
    const length = view.getUint16(rec + 8);
    const start = strings + view.getUint16(rec + 10);
    if (platform === 3 || platform === 0) {
      let s = "";
      for (let j = 0; j < length; j += 2) s += String.fromCharCode(view.getUint16(start + j));
      return s;
    }
    if (platform === 1) {
      let s = "";
      for (let j = 0; j < length; j++) s += String.fromCharCode(view.getUint8(start + j));
      return s;
    }
  }
  return null;
}

// ── Character coverage (D393) ────────────────────────────────────────────────
// The fonts' `cmap` tables say which characters they can draw. caption-font-coverage.ts is
// generated from them (scripts/gen-caption-font-coverage.mjs) and a test holds it to the files, so
// the editor can warn about any letter a caption's font lacks, in any script.

/** Every codepoint a font maps to a glyph (cmap formats 4 and 12, Unicode subtables). */
export function readCmapCodepoints(ttf: Uint8Array): number[] {
  const view = new DataView(ttf.buffer, ttf.byteOffset, ttf.byteLength);
  const numTables = view.getUint16(4);
  let cmap = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (String.fromCharCode(ttf[rec], ttf[rec + 1], ttf[rec + 2], ttf[rec + 3]) === "cmap") cmap = view.getUint32(rec + 8);
  }
  if (cmap < 0) return [];
  const out = new Set<number>();
  const count = view.getUint16(cmap + 2);
  for (let i = 0; i < count; i++) {
    const rec = cmap + 4 + i * 8;
    const platform = view.getUint16(rec);
    const encoding = view.getUint16(rec + 2);
    if (!(platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10)))) continue;
    const sub = cmap + view.getUint32(rec + 4);
    const format = view.getUint16(sub);
    if (format === 4) {
      const segX2 = view.getUint16(sub + 6);
      const ends = sub + 14;
      const starts = ends + segX2 + 2;
      const deltas = starts + segX2;
      const offsets = deltas + segX2;
      for (let s = 0; s < segX2 / 2; s++) {
        const end = view.getUint16(ends + s * 2);
        const start = view.getUint16(starts + s * 2);
        const delta = view.getInt16(deltas + s * 2);
        const rangeOffset = view.getUint16(offsets + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let glyph: number;
          if (rangeOffset === 0) glyph = (c + delta) & 0xffff;
          else {
            const at = offsets + s * 2 + rangeOffset + (c - start) * 2;
            glyph = view.getUint16(at);
            if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
          }
          if (glyph !== 0) out.add(c);
        }
      }
    } else if (format === 12) {
      const groups = view.getUint32(sub + 12);
      for (let g = 0; g < groups; g++) {
        const at = sub + 16 + g * 12;
        const start = view.getUint32(at);
        const end = view.getUint32(at + 4);
        for (let c = start; c <= end; c++) out.add(c);
      }
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** Sorted codepoints as inclusive [start, end] ranges. */
export function codepointRanges(codepoints: number[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const c of codepoints) {
    const last = ranges[ranges.length - 1];
    if (last && c === last[1] + 1) last[1] = c;
    else ranges.push([c, c]);
  }
  return ranges;
}
