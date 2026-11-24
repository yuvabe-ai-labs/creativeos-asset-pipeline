import { describe, expect, it } from "vitest";
import type { SignalWithItems } from "@/lib/db/signals";
import { SIGNAL_RULE } from "@/prompts/script-copilot";
import { anglesSignals, applyAngle, builtFromSignals, mergeExtraction } from "../brief";
import { draftPrompt, editPrompt, type CopilotBase } from "../messages";
import type { Extraction } from "../output";
import { briefSchema, EMPTY_BRIEF, EMPTY_NOTES, type Angle, type ConfirmationCard } from "../schema";
import { scriptDocSchema } from "@/lib/scripts/schema";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";

// D531: a script keeps the signals it is built from, set by the picked angle and steerable.

const signal = (id: string, name: string): SignalWithItems => ({
  id, client_id: "c1", name, tags: [], description: `${name} description`, created_by: null, created_at: "", updated_at: "", items: [],
});
const ALL = [signal("s-monsoon", "Monsoon rituals"), signal("s-office", "Office dry skin"), signal("s-hooks", "Question hooks")];
const angle = (id: string, signalIds: string[]): Angle => ({
  id, hook: `Hook ${id}`, situation: "s", productMoment: "m", supportingCast: "", proof: "p",
  format: "UGC", occasion: "Monsoon", postDate: "", lead: "", leadAvatarId: null, signalIds, fromSignals: "",
});
const none = { action: "none" as const, value: "" };
const ex = (over: Partial<Extraction> = {}): Extraction => ({
  format: none, occasion: { ...none, postDate: "" }, lead: { ...none, avatarId: null }, narrative: { ...none, angleId: null },
  skipAll: false, reelNumber: null, confirm: false, cardChange: "", ack: "", suggestions: [], signals: { add: [], remove: [] }, research: null, ...over,
});
const base: CopilotBase = { clientName: "C", kbText: "KB", library: "L", avatars: "A", today: "T", signalDigest: "", formatMenu: "F" };
const CARD: ConfirmationCard = { title: "t", reelNumber: 1, lines: [], beats: [], cast: [], toConfirm: [] };

describe("Built from (D531)", () => {
  it("is not set on a new brief, and an old brief reads as not set", () => {
    expect(EMPTY_BRIEF.signalIds).toBeNull();
    const old: Record<string, unknown> = { ...EMPTY_BRIEF };
    delete old.signalIds;
    expect(briefSchema.parse(old).signalIds).toBeNull();
  });

  it("picking an angle sets Built from to its signals", () => {
    const brief = { ...EMPTY_BRIEF, angles: [angle("A", ["s-monsoon"]), angle("B", ["s-office", "s-hooks"])] };
    expect(applyAngle(brief, brief.angles[1], "given").signalIds).toEqual(["s-office", "s-hooks"]);
    const picked = mergeExtraction(brief, ex({ narrative: { action: "given", value: "", angleId: "A" } }), new Set(), ALL);
    expect(picked.brief.signalIds).toEqual(["s-monsoon"]);
  });

  it("a typed narrative leaves Built from empty", () => {
    const out = mergeExtraction(EMPTY_BRIEF, ex({ narrative: { action: "given", value: "A grandmother's monsoon kitchen", angleId: null } }), new Set(), ALL);
    expect(out.brief.signalIds).toEqual([]);
  });

  it("a typed narrative keeps signals the person had already set", () => {
    const set = { ...EMPTY_BRIEF, signalIds: ["s-office"] };
    const out = mergeExtraction(set, ex({ narrative: { action: "given", value: "My own idea", angleId: null } }), new Set(), ALL);
    expect(out.brief.signalIds).toEqual(["s-office"]);
  });

  it('"use the office dry skin signal" adds that signal, matched by name', () => {
    const out = mergeExtraction(EMPTY_BRIEF, ex({ signals: { add: ["office dry skin"], remove: [] } }), new Set(), ALL);
    expect(out.brief.signalIds).toEqual(["s-office"]);
  });

  it("removing a signal before any is set keeps every other one", () => {
    const out = mergeExtraction(EMPTY_BRIEF, ex({ signals: { add: [], remove: ["Question hooks"] } }), new Set(), ALL);
    expect(out.brief.signalIds).toEqual(["s-monsoon", "s-office"]);
  });

  it("a name that is no signal of the client's is ignored", () => {
    const out = mergeExtraction(EMPTY_BRIEF, ex({ signals: { add: ["Made up"], remove: [] } }), new Set(), ALL);
    expect(out.brief.signalIds).toBeNull();
  });

  it("angles read only the chosen signals when set", () => {
    expect(anglesSignals(ALL, ["s-hooks"]).map((s) => s.id)).toEqual(["s-hooks"]);
    expect(anglesSignals(ALL, null)).toBe(ALL);
    expect(anglesSignals(ALL, [])).toBe(ALL);
  });

  it("drops a signal that no longer exists", () => {
    expect(anglesSignals(ALL, ["gone", "s-office"]).map((s) => s.id)).toEqual(["s-office"]);
    expect(anglesSignals(ALL, ["gone"])).toBe(ALL);
    expect(builtFromSignals(ALL, ["gone", "s-office"]).map((s) => s.id)).toEqual(["s-office"]);
    expect(builtFromSignals(ALL, null)).toEqual([]);
  });

  it("the draft is told only the chosen signals, as data under the signal rule", () => {
    const p = draftPrompt(base, { brief: EMPTY_BRIEF, card: CARD, conversation: "", builtFrom: "[S1] Office dry skin description" });
    expect(p.user).toContain("## Built from");
    expect(p.user).toContain("Office dry skin description");
    expect(p.user).toContain(SIGNAL_RULE);
    const without = draftPrompt(base, { brief: EMPTY_BRIEF, card: CARD, conversation: "", builtFrom: "" });
    expect(without.user).not.toContain("## Built from");
  });

  it("an edit after the draft sees Built from only when it is set", () => {
    const doc = scriptDocSchema.parse(reel01);
    const args = { doc, notes: EMPTY_NOTES, openItems: [], conversation: "", text: "Rewrite with these signals" };
    expect(editPrompt(base, { ...args, builtFrom: "[S1] Monsoon rituals description" }).user).toContain("## Built from");
    expect(editPrompt(base, args).user).not.toContain("## Built from");
  });
});
