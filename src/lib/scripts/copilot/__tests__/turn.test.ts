import { describe, it, expect, vi } from "vitest";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import { scriptDocSchema } from "@/lib/scripts/schema";
import { acceptProposal, prepareInline, prepareTurn, spliceSelection, type TurnDeps } from "../turn";
import { EMPTY_BRIEF, EMPTY_NOTES, type Brief, type GenerateScript, type ProposalCard } from "../schema";
import type { CopilotContext } from "../context";
import type { EditOp, Extraction } from "../output";
import type { StructuredCall } from "../model";

const doc = scriptDocSchema.parse(reel01);
const ctx: CopilotContext = { clientName: "Jackfruit365", kbText: "KB", hasKb: true, library: [], avatars: [] };
const script = (over: Partial<GenerateScript> = {}): GenerateScript => ({
  id: "s1", clientId: "c1", stage: "generate", doc: null, brief: EMPTY_BRIEF, notes: EMPTY_NOTES, docVersion: 1, createdAt: "t", updatedAt: "t", ...over,
});
const none = { action: "none" as const, value: "" };
const extraction = (over: Partial<Extraction> = {}): Extraction => ({
  format: none, occasion: { ...none, postDate: "" }, lead: { ...none, avatarId: null }, narrative: { ...none, angleId: null },
  skipAll: false, reelNumber: null, confirm: false, cardChange: "", ack: "", ...over,
});
const angle = (id: string, signalIds: string[] = []) => ({
  id, hook: `Hook ${id}`, situation: "s", mealMoment: "m", supportingCast: "c", reviewTheme: "r", proofEmphasis: "p",
  format: "UGC", occasion: "Kerala Piravi", postDate: "Sun 1 Nov", lead: "Saraswathi", leadAvatarId: null, signalIds, fromSignals: "lunch at home",
});
const CARD = {
  title: "Kerala Piravi at our table", reelNumber: 4,
  lines: [{ label: "Format", value: "UGC", source: "given" as const }],
  cast: [{ name: "Saraswathi", role: "lead", isLead: true, avatarId: null }],
  toConfirm: ["Sun 1 Nov is Kerala Piravi"],
};
const DRAFT = {
  header: { title: "Kerala Piravi at our table", format: "UGC", region: "South", postDate: "Sun 1 Nov (Kerala Piravi)", theme: "Kerala Piravi", aspect: "9:16", targetLength: "45 to 55 sec", production: "AI-generated" },
  context: { purpose: "p", settingAndCamera: "s", disclaimers: "D1, D2, D4.", watchOuts: ["Keep it Kerala only."] },
  cast: [{ key: "sara", name: "Saraswathi", description: "55, Thrissur.", avatarId: null, isLead: true }],
  shots: [
    { beat: "HOOK", lengthSeconds: 5, visual: "v", vo: "Happy Kerala Piravi.", onScreenText: "Kerala Piravi", onScreen: ["sara"] },
    { beat: "REVIEW", lengthSeconds: 8, visual: "Use a real, cleared review on this theme: everyday ease.", vo: 'One customer wrote: "[real review, verbatim]".', onScreenText: "Customer review on Amazon", onScreen: [] },
  ],
  summary: "A couple's Piravi lunch.",
};

/** A fake model that returns, for each call name, the next queued answer. */
function fakeModel(answers: Record<string, unknown[]>) {
  const calls: string[] = [];
  const call = vi.fn(async ({ name }: { name: string }) => {
    calls.push(name);
    const next = answers[name]?.shift();
    if (next === undefined) throw new Error(`unexpected call ${name}`);
    return next;
  }) as unknown as StructuredCall;
  return { call, calls };
}
const deps = (call: StructuredCall, signals = [{ id: "sig-1", name: "Onam lunches" }]): TurnDeps => ({
  call, loadSignals: vi.fn(async () => ({ brief: "Market signal: Onam lunches", signals })), newShotId: (() => { let n = 0; return () => `new${++n}`; })(),
});
const run = async (s: GenerateScript, text: string, d: TurnDeps, current: GenerateScript = s) => {
  const apply = await prepareTurn({ script: s, ctx, text, lastAssistant: "" }, d);
  return apply(current);
};
const ok = <T,>(c: { patch: unknown; result: T } | { error: string; status: number }) => {
  if ("error" in c) throw new Error(c.error);
  return c as { patch: { doc?: typeof doc; brief?: Brief; notes?: typeof EMPTY_NOTES } | null; result: T };
};

describe("before the draft", () => {
  it("asks the next missing piece in order, in fixed words", async () => {
    const m = fakeModel({ script_brief_read: [extraction({ format: { action: "given", value: "UGC" }, ack: "UGC it is." })] });
    const out = ok(await run(script(), "A UGC reel", deps(m.call)));
    expect(m.calls).toEqual(["script_brief_read"]);
    expect(out.result[0].content).toBe("UGC it is.\n\nWhat's the occasion or theme, and the post date if you have one? Skip it and I'll propose one from the season.");
    expect(out.patch?.brief?.format).toEqual({ value: "UGC", status: "given" });
  });

  it("goes straight to three angles with a Market Research card when the message gives everything but the angle", async () => {
    const m = fakeModel({
      script_brief_read: [extraction({
        format: { action: "given", value: "UGC" }, occasion: { action: "given", value: "Kerala Piravi", postDate: "Sun 1 Nov" },
        lead: { action: "given", value: "Saraswathi", avatarId: null }, reelNumber: 4,
      })],
      script_angles: [{ angles: [angle("A", ["sig-1", "ghost"]), angle("B"), angle("C")], researchNote: "Lunch at home is what people post." }],
    });
    const d = deps(m.call);
    const out = ok(await run(script(), "Reel 04, Kerala Piravi, UGC, Saraswathi", d));
    expect(m.calls).toEqual(["script_brief_read", "script_angles"]);
    expect(d.loadSignals).toHaveBeenCalledTimes(1);
    const [research, angles] = out.result;
    expect(research.card).toEqual({ kind: "research", signals: [{ id: "sig-1", name: "Onam lunches" }], perAngle: [
      { angleId: "A", signalIds: ["sig-1"], note: "lunch at home" },
      { angleId: "B", signalIds: [], note: "lunch at home" },
      { angleId: "C", signalIds: [], note: "lunch at home" },
    ] });
    expect(angles.card?.kind).toBe("angles");
    expect(out.patch?.brief?.angles.map((a) => a.id)).toEqual(["A", "B", "C"]);
    expect(out.patch?.brief?.reelNumber).toBe(4);
  });

  it("skipping all four still reaches a confirmation card: three angles, one picked, then the card", async () => {
    const m = fakeModel({
      script_brief_read: [extraction({ skipAll: true })],
      script_angles: [{ angles: [angle("A"), angle("B"), angle("C")], researchNote: "" }],
      script_card: [CARD],
    });
    const out = ok(await run(script(), "take it from here", deps(m.call)));
    expect(m.calls).toEqual(["script_brief_read", "script_angles", "script_card"]);
    expect(out.result.map((r) => r.card?.kind ?? null)).toEqual(["research", "angles", null, "confirmation"]);
    expect(out.patch?.brief?.narrative.status).toBe("proposed");
    expect(out.patch?.brief?.lead).toEqual({ value: "Saraswathi", status: "proposed" });
    expect(out.patch?.brief?.phase).toBe("confirm");
  });

  it("writes the draft when the person confirms the card, and starts the notes from it", async () => {
    const brief: Brief = { ...EMPTY_BRIEF, phase: "confirm", format: { value: "UGC", status: "given" }, occasion: { value: "Kerala Piravi", status: "given" }, lead: { value: "Saraswathi", status: "given" }, narrative: { value: "A. Hook A: s", status: "given" }, card: CARD };
    const m = fakeModel({ script_brief_read: [extraction({ confirm: true })], script_draft: [DRAFT] });
    const out = ok(await run(script({ brief }), "write it", deps(m.call)));
    expect(out.patch?.doc?.shots.map((s) => s.id)).toEqual(["s01", "s02"]);
    expect(out.patch?.doc?.header.reelNumber).toBe(4);
    expect(out.patch?.notes?.confirmations).toEqual([{ id: "c1", text: "Sun 1 Nov is Kerala Piravi", confirmed: false }]);
    expect(out.patch?.brief?.phase).toBe("written");
    expect(out.result[0].content).toMatch(/^The first draft is in: 2 shots · 13s\./);
    expect(out.result[0].content).toMatch(/2 things to settle before it's final\. First: Paste a real, cleared Amazon review/);
  });

  it("rebuilds the card when the person changes a line instead of confirming", async () => {
    const brief: Brief = { ...EMPTY_BRIEF, phase: "confirm", format: { value: "UGC", status: "given" }, occasion: { value: "x", status: "given" }, lead: { value: "y", status: "given" }, narrative: { value: "n", status: "given" }, card: CARD };
    const m = fakeModel({ script_brief_read: [extraction({ cardChange: "make it dinner" })], script_card: [{ ...CARD, title: "Dinner" }] });
    const out = ok(await run(script({ brief }), "make it dinner", deps(m.call)));
    expect(m.calls).toEqual(["script_brief_read", "script_card"]);
    expect(out.patch?.brief?.card?.title).toBe("Dinner");
    expect(out.patch?.doc).toBeUndefined();
  });

  it("uses the quick model to read, propose angles and build the card, and the writer only for the draft", async () => {
    const quick = fakeModel({ script_brief_read: [extraction({ skipAll: true }), extraction({ confirm: true })], script_angles: [{ angles: [angle("A"), angle("B"), angle("C")], researchNote: "" }], script_card: [CARD] });
    const writer = fakeModel({ script_draft: [DRAFT] });
    const d = { ...deps(writer.call), quick: quick.call };
    const first = ok(await run(script(), "take it from here", d));
    expect(quick.calls).toEqual(["script_brief_read", "script_angles", "script_card"]);
    expect(writer.calls).toEqual([]);
    ok(await run(script({ brief: first.patch!.brief! }), "write it", d));
    expect(writer.calls).toEqual(["script_draft"]);
  });

  it("refuses to save over a brief that changed during the turn", async () => {
    const m = fakeModel({ script_brief_read: [extraction()] });
    const out = await run(script(), "hi", deps(m.call), script({ docVersion: 2 }));
    expect(out).toEqual({ error: "The script changed while I was working. Send that again.", status: 409 });
  });
});

describe("after the draft: chat edits", () => {
  const written = script({ doc, brief: { ...EMPTY_BRIEF, phase: "written" }, docVersion: 5 });
  const op = (o: Partial<EditOp> & Pick<EditOp, "op">): EditOp => ({
    path: null, value: null, shotId: null, afterShotId: null, shot: null, second: null, list: null, cast: null, itemId: null, ...o,
  });

  it("applies a one-shot edit at once and says what changed", async () => {
    const m = fakeModel({ script_edit: [{ ops: [op({ op: "set_field", path: "shots.s01.vo", value: "Golu begins." })], reply: "Shortened the hook line." }] });
    const out = ok(await run(written, "shorter hook", deps(m.call)));
    expect(out.patch?.doc?.shots[0].vo).toBe("Golu begins.");
    expect(out.result[0].content).toMatch(/^Shortened the hook line\.\n\n/);
  });

  it("shows an edit that touches several shots as a before-and-after, and saves nothing yet", async () => {
    const m = fakeModel({ script_edit: [{ ops: [
      op({ op: "set_field", path: "shots.s01.vo", value: "a" }),
      op({ op: "set_field", path: "shots.s02.vo", value: "b" }),
    ], reply: "Redid the hook." }] });
    const out = ok(await run(written, "redo the hook", deps(m.call)));
    expect(out.patch).toBeNull();
    const card = out.result[0].card as ProposalCard;
    expect(card).toMatchObject({ kind: "proposal", status: "pending", summary: "Redid the hook." });
    expect(card.before.map((s) => s.vo)).toEqual([doc.shots[0].vo, doc.shots[1].vo]);
    expect(card.after.map((s) => s.vo)).toEqual(["a", "b"]);
  });

  it("applies the edit to the script as it is now, so text the person typed meanwhile survives", async () => {
    const m = fakeModel({ script_edit: [{ ops: [op({ op: "set_field", path: "shots.s03.vo", value: "Copilot line." })], reply: "Changed S3." }] });
    const typed = { ...doc, shots: doc.shots.map((s) => (s.id === "s02" ? { ...s, visual: "Typed by the person." } : s)) };
    const out = ok(await run(written, "change S3", deps(m.call), { ...written, doc: typed, docVersion: 6 }));
    expect(out.patch?.doc?.shots[1].visual).toBe("Typed by the person.");
    expect(out.patch?.doc?.shots[2].vo).toBe("Copilot line.");
  });

  it("leaves a shot alone when the person typed into it while the copilot was rewriting it (final review 1)", async () => {
    const m = fakeModel({ script_edit: [{ ops: [op({ op: "update_shot", shotId: "s03", shot: { beat: "INTRO", lengthSeconds: 4, visual: "Model visual.", vo: "Model line.", onScreenText: "Card", onScreen: ["meenakshi"] } })], reply: "Rewrote S3." }] });
    const typed = { ...doc, shots: doc.shots.map((s) => (s.id === "s03" ? { ...s, visual: "Typed by the person." } : s)) };
    const out = ok(await run(written, "rewrite S3", deps(m.call), { ...written, doc: typed, docVersion: 6 }));
    expect(out.patch).toBeNull();
    expect(out.result[0].content).toMatch(/You changed S3 while I was working/);
  });

  it("changes nothing when an operation fails, and says so", async () => {
    const m = fakeModel({ script_edit: [{ ops: [op({ op: "remove_shot", shotId: "s99" })], reply: "Removed it." }] });
    const out = ok(await run(written, "remove S99", deps(m.call)));
    expect(out.patch).toBeNull();
    expect(out.result[0].content).toMatch(/^I couldn't make that change: .*Nothing was changed\.$/);
  });

  it("answers a question without changing anything", async () => {
    const m = fakeModel({ script_edit: [{ ops: [], reply: "It runs 52 seconds." }] });
    const out = ok(await run(written, "how long is it?", deps(m.call)));
    expect(out).toEqual({ patch: null, result: [{ content: "It runs 52 seconds.", card: null }] });
  });
});

describe("acceptProposal", () => {
  const written = script({ doc, brief: { ...EMPTY_BRIEF, phase: "written" } });
  const card: ProposalCard = {
    kind: "proposal", status: "pending", summary: "Redid the hook.", before: [], after: [],
    ops: [{ op: "remove_shot", path: null, value: null, shotId: "s02", afterShotId: null, shot: null, second: null, list: null, cast: null, itemId: null }],
  };
  const gen = { newShotId: () => "x", avatarIds: new Set<string>() };

  it("applies the operations to the current script and marks the card accepted", () => {
    const out = ok(acceptProposal(written, card, gen));
    expect(out.patch?.doc?.shots.some((s) => s.id === "s02")).toBe(false);
    expect(out.result.card.status).toBe("accepted");
  });

  it("applies nothing and marks the card out of date when a targeted shot is gone (Review Focus 4)", () => {
    const gone = { ...written, doc: { ...doc, shots: doc.shots.filter((s) => s.id !== "s02") } };
    const out = ok(acceptProposal(gone, card, gen));
    expect(out.patch).toBeNull();
    expect(out.result.card.status).toBe("stale");
    expect(out.result.reply).toMatch(/changed since I proposed that/);
  });

  it("applies nothing when the person changed a targeted shot since the proposal (final review 1)", () => {
    const rewrite: ProposalCard = {
      ...card,
      before: [doc.shots[3]],
      ops: [{ op: "update_shot", path: null, value: null, shotId: "s04", afterShotId: null, list: null, cast: null, itemId: null, second: null,
        shot: { beat: "INTRO", lengthSeconds: 4, visual: "Proposed.", vo: "Proposed line.", onScreenText: "", onScreen: [] } }],
    };
    const typed = { ...written, doc: { ...doc, shots: doc.shots.map((s) => (s.id === "s04" ? { ...s, vo: "Pasted by the person." } : s)) } };
    const out = ok(acceptProposal(typed, rewrite, gen));
    expect(out.patch).toBeNull();
    expect(out.result.card.status).toBe("stale");
    expect(out.result.reply).toMatch(/You changed S4 since I proposed that/);
    expect(ok(acceptProposal(written, rewrite, gen)).patch?.doc?.shots[3].visual).toBe("Proposed.");
  });

  it("refuses a card that was already settled", () => {
    expect(acceptProposal(written, { ...card, status: "rejected" }, gen)).toEqual({ error: "That change was already settled.", status: 409 });
  });
});

describe("inline edits", () => {
  it("spliceSelection replaces only the selection at its offset, taking the replacement literally", () => {
    expect(spliceSelection("a cat and a cat", "cat", 12, "dog")).toBe("a cat and a dog");
    expect(spliceSelection("costs $5", "$5", 6, "$$ and $&")).toBe("costs $$ and $&");
    expect(spliceSelection("a cat", "cat", 0, "dog")).toBe("a dog"); // a stale offset falls back to the first match
    expect(spliceSelection("a cat", "cow", 2, "dog")).toBeNull();
  });

  const written = script({ doc, brief: { ...EMPTY_BRIEF, phase: "written" } });
  const vo = doc.shots[0].vo;
  const sel = vo.split(" ")[0];

  it("changes only the selected words of one field, and returns the undo", async () => {
    const m = fakeModel({ script_inline: [{ replacement: "Today,", summary: "Warmer opening." }] });
    const prepared = await prepareInline({ script: written, ctx, path: "shots.s01.vo", selectedText: sel, offset: 0, instruction: "warmer" }, { call: m.call });
    if ("error" in prepared) throw new Error(prepared.error);
    const out = ok(prepared(written));
    expect(out.patch?.doc?.shots[0].vo).toBe(`Today,${vo.slice(sel.length)}`);
    expect(out.patch?.doc?.shots.slice(1)).toEqual(doc.shots.slice(1));
    expect(out.result).toEqual({ reply: "Changed S1 VO: Warmer opening.", undo: { path: "shots.s01.vo", before: vo } });
  });

  it("refuses when the selected text is no longer in the field", async () => {
    const m = fakeModel({});
    expect(await prepareInline({ script: written, ctx, path: "shots.s01.vo", selectedText: "not there", offset: 0, instruction: "x" }, { call: m.call }))
      .toEqual({ error: "That text changed. Select it again.", status: 409 });
    expect(await prepareInline({ script: written, ctx, path: "shots.s01.id", selectedText: "x", offset: 0, instruction: "x" }, { call: m.call }))
      .toEqual({ error: "That part of the script can't be edited this way.", status: 400 });
  });
});
