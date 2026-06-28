import { describe, it, expect } from "vitest";
import {
  ADD_NODE_OPTIONS,
  mnemonicToType,
  isEditableTarget,
  type AddNodeType,
} from "./canvas-node-options";

describe("ADD_NODE_OPTIONS", () => {
  it("has the 8 user-addable node types (kb excluded)", () => {
    const types = ADD_NODE_OPTIONS.map((o) => o.type).sort();
    expect(types).toEqual(
      [
        "draw",
        "file",
        "image-gen",
        "prompt",
        "script",
        "text",
        "video-gen",
        "video-prompt",
      ].sort(),
    );
  });

  it("has unique mnemonics", () => {
    const mnemonics = ADD_NODE_OPTIONS.map((o) => o.mnemonic.toLowerCase());
    expect(new Set(mnemonics).size).toBe(mnemonics.length);
  });

  it("has a non-empty label and single-character mnemonic per option", () => {
    for (const o of ADD_NODE_OPTIONS) {
      expect(o.label.length).toBeGreaterThan(0);
      expect(o.mnemonic).toHaveLength(1);
    }
  });
});

describe("mnemonicToType", () => {
  it("maps the documented keys to types", () => {
    const expected: Record<string, AddNodeType> = {
      s: "script",
      f: "file",
      n: "text",
      p: "prompt",
      d: "draw",
      i: "image-gen",
      v: "video-prompt",
      g: "video-gen",
    };
    for (const [key, type] of Object.entries(expected)) {
      expect(mnemonicToType(key)).toBe(type);
    }
  });

  it("is case-insensitive", () => {
    expect(mnemonicToType("S")).toBe("script");
  });

  it("returns null for unmapped keys (incl. kb's 'k')", () => {
    expect(mnemonicToType("k")).toBeNull();
    expect(mnemonicToType("z")).toBeNull();
    expect(mnemonicToType("")).toBeNull();
  });
});

describe("isEditableTarget", () => {
  it("is true for inputs, textareas, selects, and contenteditable", () => {
    expect(isEditableTarget({ tagName: "INPUT" })).toBe(true);
    expect(isEditableTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isEditableTarget({ tagName: "SELECT" })).toBe(true);
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("is false for non-editable elements and nullish", () => {
    expect(isEditableTarget({ tagName: "DIV" })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(undefined)).toBe(false);
  });
});
