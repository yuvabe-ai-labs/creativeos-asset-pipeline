// The Script view's three states (EMPTY → SKELETON → PARSED). A parse in progress always wins,
// so a view opened while the gallery or the Create-canvas hand-off parses shows the skeleton,
// never the upload screen (script-to-canvas spec §2.4).
export function scriptViewMode(i: { parsing: boolean; hasParsed: boolean; replacing: boolean }): "skeleton" | "parsed" | "empty" {
  if (i.parsing) return "skeleton";
  return i.hasParsed && !i.replacing ? "parsed" : "empty";
}
