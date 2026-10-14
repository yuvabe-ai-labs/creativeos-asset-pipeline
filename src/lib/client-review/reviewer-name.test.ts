import { describe, it, expect } from "vitest";
import {
  readReviewerName, saveReviewerName, clearReviewerName, PREPAINT_SCRIPT, type NameStore,
} from "./reviewer-name";

function memoryStore(initial: Record<string, string> = {}): NameStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
    removeItem: (k) => { delete data[k]; },
  };
}
const throwingStore: NameStore = {
  getItem: () => { throw new Error("SecurityError"); },
  setItem: () => { throw new Error("QuotaExceeded"); },
  removeItem: () => { throw new Error("SecurityError"); },
};

describe("reviewer name storage", () => {
  it("round-trips a trimmed name", () => {
    const s = memoryStore();
    expect(saveReviewerName(s, "  Priya ")).toBe("Priya");
    expect(readReviewerName(s)).toBe("Priya");
  });
  it("treats a whitespace-only stored value as no name", () => {
    expect(readReviewerName(memoryStore({ reviewer_name: "   " }))).toBeNull();
  });
  it("refuses empty and over-long names", () => {
    const s = memoryStore();
    expect(saveReviewerName(s, "  ")).toBeNull();
    expect(saveReviewerName(s, "a".repeat(61))).toBeNull();
    expect(s.data).toEqual({});
  });
  it("never throws when storage is blocked; the name still works for the visit", () => {
    expect(readReviewerName(throwingStore)).toBeNull();
    expect(saveReviewerName(throwingStore, "Priya")).toBe("Priya");
    expect(() => clearReviewerName(throwingStore)).not.toThrow();
    expect(readReviewerName(null)).toBeNull();
  });
  it("clears the name", () => {
    const s = memoryStore({ reviewer_name: "Priya" });
    clearReviewerName(s);
    expect(readReviewerName(s)).toBeNull();
  });
});

describe("PREPAINT_SCRIPT", () => {
  function run(store: unknown) {
    const parent = { dataset: {} as Record<string, string> };
    const doc = { currentScript: { parentElement: parent } };
    new Function("localStorage", "document", PREPAINT_SCRIPT)(store, doc);
    return parent.dataset.reviewer;
  }
  it("marks a returning reviewer as known before paint", () => {
    expect(run(memoryStore({ reviewer_name: "Priya" }))).toBe("known");
  });
  it("leaves new and whitespace-only reviewers alone", () => {
    expect(run(memoryStore())).toBeUndefined();
    expect(run(memoryStore({ reviewer_name: "  " }))).toBeUndefined();
  });
  it("swallows blocked storage", () => {
    expect(() => run(throwingStore)).not.toThrow();
  });
});
