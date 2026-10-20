// Reads a font file's PostScript name (name ID 6 in the OpenType `name` table). Premiere picks a
// caption's font by this name (D392), so a test holds every shipped file to the name we write.

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
