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

// Briefs saved before the copilot went brand-neutral: angles had mealMoment/proofEmphasis, cards had no beats.
const oldAngle = {
  id: "A", hook: "One stir", situation: "Golu morning", mealMoment: "Lunch, two spoons", supportingCast: "Husband",
  reviewTheme: "Easy to use", proofEmphasis: "Name the study", format: "", occasion: "", postDate: "", lead: "",
  leadAvatarId: null, signalIds: [], fromSignals: "",
};
const oldCard = {
  title: "Golu at home", reelNumber: 4, lines: [{ label: "Format", value: "UGC", source: "given" }],
  cast: [{ name: "Meena", role: "lead", isLead: true, avatarId: null }], toConfirm: [],
};
const piece = (value: string) => ({ value, status: "given" });
const oldBrief = {
  phase: "confirm", reelNumber: 4, format: piece("UGC"), occasion: piece("Golu"), postDate: "", lead: piece("Meena"),
  leadAvatarId: null, narrative: piece("A. One stir: Golu morning"), angles: [oldAngle], card: oldCard, imported: false,
};

describe("briefs saved before the copilot went brand-neutral", () => {
  it("reads a brief stored with the old angle fields", () => {
    const s = rowToGenerateScript({ ...base, brief: oldBrief })!;
    expect(s.brief.phase).toBe("confirm");
    expect(s.brief.angles[0].productMoment).toBe("Lunch, two spoons");
    expect(s.brief.angles[0].proof).toBe("Name the study");
  });

  it("reads a stored card with no beats as an empty list", () => {
    const s = rowToGenerateScript({ ...base, brief: oldBrief })!;
    expect(s.brief.card?.beats).toEqual([]);
    expect(s.brief.card?.lines).toHaveLength(1);
  });

  it("reads an angles message card with old fields", () => {
    const m = rowToMessage({ id: "m1", role: "assistant", content: "", created_at: "t", card: { kind: "angles", angles: [oldAngle] } });
    expect(m.card?.kind === "angles" && m.card.angles[0].productMoment).toBe("Lunch, two spoons");
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
  it("reads every saved message as having no chips: chips are not stored, the turn's answer carries them", () => {
    const row = { id: "m1", role: "assistant", content: "Hi", card: null, created_at: "t" };
    expect(rowToMessage(row).suggestions).toEqual([]);
    expect(rowToMessage({ ...row, suggestions: ["A"] } as never).suggestions).toEqual([]);
  });

  it("keeps a valid card and drops an invalid one", () => {
    const row = { id: "m1", role: "assistant", content: "Hi", created_at: "t" };
    expect(rowToMessage({ ...row, card: { kind: "research", signals: [], perAngle: [] } }).card?.kind).toBe("research");
    expect(rowToMessage({ ...row, card: { kind: "mystery" } }).card).toBeNull();
  });
});
