// Spreadsheet keys on the change-prices grid (prototype gridKeys): Enter / ↓ and Shift+Enter / ↑ move
// down and up, ← → move from the text's edge (or when it is all selected), Esc puts the cell back.
// Tab is the browser's own. Client-safe.

export type GridPos = { r: number; c: number };
type Caret = { start: number | null; end: number | null; length: number };

export function gridKeyMove(
  e: { key: string; shift: boolean },
  at: GridPos,
  caret: Caret,
  cells: readonly GridPos[],
): { move: GridPos } | { reset: true } | null {
  if (e.key === "Escape") return { reset: true };
  const go = (dr: number, dc: number) => {
    const exact = cells.find((x) => x.r === at.r + dr && x.c === at.c + dc);
    if (exact) return { move: exact };
    if (!dr) return null;
    // A shorter row (other charges have one column): the nearest column.
    const row = cells.filter((x) => x.r === at.r + dr).sort((a, b) => Math.abs(a.c - at.c) - Math.abs(b.c - at.c));
    return row[0] ? { move: row[0] } : null;
  };
  const atStart = caret.start === 0 && caret.end === 0;
  const atEnd = caret.start === caret.length && caret.end === caret.length;
  const allSelected = caret.start === 0 && caret.end === caret.length;
  if (e.key === "ArrowDown" || (e.key === "Enter" && !e.shift)) return go(1, 0);
  if (e.key === "ArrowUp" || (e.key === "Enter" && e.shift)) return go(-1, 0);
  if (e.key === "ArrowLeft" && (atStart || allSelected)) return go(0, -1);
  if (e.key === "ArrowRight" && (atEnd || allSelected)) return go(0, 1);
  return null;
}
