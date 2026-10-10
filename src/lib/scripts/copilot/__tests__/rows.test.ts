import { describe, it, expect, vi } from "vitest";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import { rowToScript } from "@/lib/scripts/rows";
import { rowToGenerateScript, rowToMessage, type GenerateScriptRow } from "../rows";
import { EMPTY_BRIEF, EMPTY_NOTES } from "../schema";

const base: GenerateScriptRow = {
  id: "s1", client_id: "c1", stage: "generate", doc: null, approved_at: null, archived_at: null,
  created_at: "t0", updated_at: "t1", brief: null, notes: null, doc_version: 0,
};

describe("rowToGenerateScript", () => {
  it("reads a new script with no draft, brief or notes as empty", () => {
    const s = rowToGenerateScript(base)!;
    expect(s.doc).toBeNull();
    expect(s.brief).toEqual(EMPTY_BRIEF);
    expect(s.notes).toEqual(EMPTY_NOTES);
    expect(s.docVersion).toBe(0);
  });

  it("marks the brief written whenever a draft exists, even with no stored brief (a seeded script)", () => {
    const s = rowToGenerateScript({ ...base, doc: reel01, doc_version: 3 })!;
    expect(s.doc?.shots).toHaveLength(14);
    expect(s.brief.phase).toBe("written");
    expect(s.docVersion).toBe(3);
  });

  it("reads a brief or notes that fail validation as empty, not as an error", () => {
    const s = rowToGenerateScript({ ...base, brief: { phase: "nonsense" }, notes: { brief: 7 } })!;
    expect(s.brief).toEqual(EMPTY_BRIEF);
    expect(s.notes).toEqual(EMPTY_NOTES);
  });

  it("skips a row whose draft fails validation", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(rowToGenerateScript({ ...base, doc: { header: {} } })).toBeNull();
    warn.mockRestore();
  });
});

describe("rowToScript", () => {
  it("skips a script with no draft yet, silently", () => {
    const warn = vi.spyOn(console, "warn");
    expect(rowToScript({ ...base, stage: "generate", doc: null })).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("rowToMessage", () => {
  it("keeps a valid card and drops an invalid one", () => {
    const row = { id: "m1", role: "assistant", content: "Hi", created_at: "t" };
    expect(rowToMessage({ ...row, card: { kind: "research", signals: [], perAngle: [] } }).card?.kind).toBe("research");
    expect(rowToMessage({ ...row, card: { kind: "mystery" } }).card).toBeNull();
  });
});
