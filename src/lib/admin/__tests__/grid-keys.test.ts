import { describe, expect, it } from "vitest";
import { gridKeyMove } from "../grid-keys";

// A 2 x 2 grid, then one other charge below it (row 2, column 0).
const cells = [
  { r: 0, c: 0 }, { r: 0, c: 1 },
  { r: 1, c: 0 }, { r: 1, c: 1 },
  { r: 2, c: 0 },
];
const caret = (start: number, end: number, length = 4) => ({ start, end, length });
const allSelected = caret(0, 4);

describe("gridKeyMove", () => {
  it("Enter and ↓ go down, Shift+Enter and ↑ go up", () => {
    expect(gridKeyMove({ key: "ArrowDown", shift: false }, { r: 0, c: 1 }, caret(2, 2), cells)).toEqual({ move: { r: 1, c: 1 } });
    expect(gridKeyMove({ key: "Enter", shift: false }, { r: 0, c: 0 }, caret(2, 2), cells)).toEqual({ move: { r: 1, c: 0 } });
    expect(gridKeyMove({ key: "Enter", shift: true }, { r: 1, c: 0 }, caret(2, 2), cells)).toEqual({ move: { r: 0, c: 0 } });
    expect(gridKeyMove({ key: "ArrowUp", shift: false }, { r: 0, c: 0 }, caret(2, 2), cells)).toBeNull();
  });
  it("going down into a shorter row lands on the nearest column", () => {
    expect(gridKeyMove({ key: "ArrowDown", shift: false }, { r: 1, c: 1 }, caret(0, 0), cells)).toEqual({ move: { r: 2, c: 0 } });
  });
  it("← and → move only from the text's edge or when it is all selected", () => {
    expect(gridKeyMove({ key: "ArrowRight", shift: false }, { r: 0, c: 0 }, caret(2, 2), cells)).toBeNull();
    expect(gridKeyMove({ key: "ArrowRight", shift: false }, { r: 0, c: 0 }, caret(4, 4), cells)).toEqual({ move: { r: 0, c: 1 } });
    expect(gridKeyMove({ key: "ArrowLeft", shift: false }, { r: 0, c: 1 }, caret(0, 0), cells)).toEqual({ move: { r: 0, c: 0 } });
    expect(gridKeyMove({ key: "ArrowLeft", shift: false }, { r: 0, c: 1 }, allSelected, cells)).toEqual({ move: { r: 0, c: 0 } });
    expect(gridKeyMove({ key: "ArrowLeft", shift: false }, { r: 0, c: 0 }, allSelected, cells)).toBeNull();
  });
  it("Esc puts the cell back", () => {
    expect(gridKeyMove({ key: "Escape", shift: false }, { r: 0, c: 0 }, caret(1, 1), cells)).toEqual({ reset: true });
  });
  it("other keys are left to the field", () => {
    expect(gridKeyMove({ key: "Tab", shift: false }, { r: 0, c: 0 }, caret(1, 1), cells)).toBeNull();
    expect(gridKeyMove({ key: "5", shift: false }, { r: 0, c: 0 }, caret(1, 1), cells)).toBeNull();
  });
});
