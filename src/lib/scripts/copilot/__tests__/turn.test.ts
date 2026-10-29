import { describe, it, expect, vi } from "vitest";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import { scriptDocSchema } from "@/lib/scripts/schema";
import { acceptImport } from "../import-turn";
import { buildImport } from "../import";
import { shotSummary } from "@/lib/scripts/utils";
import { acceptProposal, prepareInline, prepareTurn, spliceSelection, type TurnDeps } from "../turn";
import { angleText } from "../brief";
import { EMPTY_BRIEF, EMPTY_NOTES, type Brief, type GenerateScript, type ImportCard, type ProposalCard } from "../schema";
import type { CopilotContext } from "../context";
import type { EditOp, Extraction } from "../output";
import type { StructuredCall } from "../model";
import { REEL_07_PASTE } from "@/lib/scripts/fixtures/reel-07-paste";
import { REEL_07_IMPORT } from "@/lib/scripts/fixtures/reel-07-import";
import { EMPTY_PARTIAL_DRAFT } from "../partial-draft";
import type { Script } from "@/lib/scripts/schema";

const doc = scriptDocSchema.parse(reel01);
const ctx: CopilotContext = {
  clientName: "Jackfruit365", kbText: "KB", hasKb: true, library: [], avatars: [], today: "Wed 28 Oct 2026",
  signals: { brief: "Market signal: Onam lunches", digest: "[S1] Onam lunches", list: [{ id: "sig-1", name: "Onam lunches" }] },
};
const script = (over: Partial<GenerateScript> = {}): GenerateScript => ({
  id: "s1", clientId: "c1", stage: "generate", doc: null, brief: EMPTY_BRIEF, notes: EMPTY_NOTES, docVersion: 1, createdAt: "t", updatedAt: "t", ...over,
});
const none = { action: "none" as const, value: "" };
const extraction = (over: Partial<Extraction> = {}): Extraction => ({
  format: none, occasion: { ...none, postDate: "" }, lead: { ...none, avatarId: null }, narrative: { ...none, angleId: null }, suggestions: [],
  skipAll: false, reelNumber: null, confirm: false, cardChange: "", ack: "", ...over,
});
const angle = (id: string, signalIds: string[] = []) => ({
  id, hook: `Hook ${id}`, situation: "s", productMoment: "m", supportingCast: "c", reviewTheme: "r", proof: "p",
  format: "UGC", occasion: "Kerala Piravi", postDate: "Sun 1 Nov", lead: "Saraswathi", leadAvatarId: null, signalIds, fromSignals: "lunch at home",
});
const CARD = {
  title: "Kerala Piravi at our table", reelNumber: 4,
  lines: [{ label: "Format", value: "UGC", source: "given" as const }],
  cast: [{ name: "Saraswathi", role: "lead", isLead: true, avatarId: null }],
  beats: [], toConfirm: ["Sun 1 Nov is Kerala Piravi"],
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
const deps = (call: StructuredCall): TurnDeps => ({
  call, newShotId: (() => { let n = 0; return () => `new${++n}`; })(),
});
const run = async (s: GenerateScript, text: string, d: TurnDeps, current: GenerateScript = s) => {
  const apply = await prepareTurn({ script: s, ctx, text, history: [] }, d);
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
    expect(out.result[0].content).toBe("UGC it is.\n\nWhat's the occasion or theme, and the post date if you have one?");
    expect(out.patch?.brief?.format).toEqual({ value: "UGC", status: "given" });
  });

  it("goes straight to three angles with a Market Research card when the message gives everything but the angle", async () => {
    const m = fakeModel({
      script_brief_read: [extraction({
        format: { action: "given", value: "UGC" }, occasion: { action: "given", value: "Kerala Piravi", postDate: "Sun 1 Nov" },
        lead: { action: "given", value: "Saraswathi", avatarId: null }, reelNumber: 4,
      })],
      script_angles: [{ angles: [angle("A", ["S1", "ghost"]), angle("B"), angle("C")] }],
    });
    const d = deps(m.call);
    const out = ok(await run(script(), "Reel 04, Kerala Piravi, UGC, Saraswathi", d));
    expect(m.calls).toEqual(["script_brief_read", "script_angles"]);
    const [research, angles] = out.result;
    // The card is the whole message: no prose explaining what signals are for.
    expect(research.content).toBe("");
    expect(research.card).toEqual({ kind: "research", signals: [{ id: "sig-1", name: "Onam lunches" }], perAngle: [
      { angleId: "A", signalIds: ["sig-1"] },
      { angleId: "B", signalIds: [] },
      { angleId: "C", signalIds: [] },
    ] });
    expect(angles.card?.kind).toBe("angles");
    expect(out.patch?.brief?.angles.map((a) => a.id)).toEqual(["A", "B", "C"]);
    expect(out.patch?.brief?.reelNumber).toBe(4);
  });

  it("puts the angles call's chips on the angles message, the turn's last reply, not on the research card", async () => {
    const m = fakeModel({
      script_brief_read: [extraction({
        format: { action: "given", value: "UGC" }, occasion: { action: "given", value: "Diwali", postDate: "" },
        lead: { action: "given", value: "Asha", avatarId: null },
      })],
      script_angles: [{ angles: [angle("A"), angle("B"), angle("C")], suggestions: ["Blend A and C"] }],
    });
    const [research, angles] = ok(await run(script(), "UGC, Diwali, Asha", deps(m.call))).result;
    expect(research.suggestions ?? []).toEqual([]);
    expect(angles.suggestions).toEqual(["Blend A and C"]);
  });

  it("offers the reader's occasion ideas when the next question is the occasion, and nothing for the format", async () => {
    const m = fakeModel({ script_brief_read: [
      extraction({ format: { action: "given", value: "UGC" }, suggestions: ["Diwali: a new home"] }),
      extraction({ suggestions: ["ignored"] }),
    ] });
    expect(ok(await run(script(), "A UGC reel", deps(m.call))).result[0].suggestions).toEqual(["Diwali: a new home"]);
    expect(ok(await run(script(), "hello", deps(m.call))).result[0].suggestions ?? []).toEqual([]);
  });

  it("skipping all four still reaches a confirmation card: three angles, one picked, then the card", async () => {
    const m = fakeModel({
      script_brief_read: [extraction({ skipAll: true })],
      script_angles: [{ angles: [angle("A"), angle("B"), angle("C")] }],
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
    expect(out.result[0].content).toMatch(/2 things to settle before it's final\. First: Paste a real, cleared customer review/);
  });

  it("streams the draft: reports each new shot as it arrives, then saves the whole draft", async () => {
    const brief: Brief = { ...EMPTY_BRIEF, phase: "confirm", format: { value: "UGC", status: "given" }, occasion: { value: "x", status: "given" }, lead: { value: "y", status: "given" }, narrative: { value: "n", status: "given" }, card: CARD };
    const quick = fakeModel({ script_brief_read: [extraction({ confirm: true })] });
    const whole = JSON.stringify(DRAFT);
    const previews: string[] = [];
    const stream = vi.fn(async (_args: unknown, onText: (t: string) => void) => {
      previews.push("writer called");
      for (const at of [whole.indexOf("\"cast\""), whole.indexOf("\"REVIEW\""), whole.length]) onText(whole.slice(0, at));
      return DRAFT;
    });
    const d = { ...deps(fakeModel({}).call), quick: quick.call, stream: stream as never, onDraft: (p: { shots: unknown[] }) => previews.push(`${p.shots.length} shots`) };
    const out = ok(await run(script({ brief }), "write it", d));
    // An empty draft first, so the page shows the script taking shape while the writer thinks.
    expect(previews).toEqual(["0 shots", "writer called", "0 shots", "1 shots", "2 shots"]);
    expect(out.patch?.doc?.shots.map((s) => s.id)).toEqual(["s01", "s02"]);
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
    const quick = fakeModel({ script_brief_read: [extraction({ skipAll: true }), extraction({ confirm: true })], script_angles: [{ angles: [angle("A"), angle("B"), angle("C")] }], script_card: [CARD] });
    const writer = fakeModel({ script_draft: [DRAFT] });
    const d = { ...deps(writer.call), quick: quick.call };
    const first = ok(await run(script(), "take it from here", d));
    expect(quick.calls).toEqual(["script_brief_read", "script_angles", "script_card"]);
    expect(writer.calls).toEqual([]);
    ok(await run(script({ brief: first.patch!.brief! }), "write it", d));
    expect(writer.calls).toEqual(["script_draft"]);
  });

  it("sets the lead from a picked avatar chip itself, not from the model's reading of the name", async () => {
    const JAMES = "7a2d3c4e-0000-4000-8000-0000000000aa";
    const avatars = [{ id: JAMES, name: "James", story: "", front: null, specific: true }];
    const brief: Brief = { ...EMPTY_BRIEF, format: { value: "Founder-led", status: "given" }, occasion: { value: "Navratri", status: "given" } };
    // The model misreads the name; the chip's avatar still wins.
    const m = fakeModel({
      script_brief_read: [extraction({ lead: { action: "given", value: "Meenakshi", avatarId: null } })],
      script_angles: [{ angles: [angle("A"), angle("B"), angle("C")] }],
    });
    const apply = await prepareTurn({ script: script({ brief }), ctx: { ...ctx, avatars }, text: "James", history: [], leadAvatarId: JAMES }, deps(m.call));
    const out = ok(apply(script({ brief })));
    expect(out.patch?.brief?.lead).toEqual({ value: "James", status: "given" });
    expect(out.patch?.brief?.leadAvatarId).toBe(JAMES);
  });

  it("writes on 'write it' even when the model re-reports the angle already picked (the confirm loop)", async () => {
    const a = angle("A");
    const brief: Brief = {
      ...EMPTY_BRIEF, phase: "confirm", format: { value: "UGC", status: "given" }, occasion: { value: "Kerala Piravi", status: "given" },
      lead: { value: "Saraswathi", status: "given" }, angles: [a, angle("B"), angle("C")], narrative: { value: angleText(a), status: "given" }, card: CARD,
    };
    // What the staging conversation showed: "Write it." read back as angle A, again, plus confirm.
    const m = fakeModel({ script_brief_read: [extraction({ confirm: true, narrative: { action: "given", value: "", angleId: "A" } })], script_draft: [DRAFT] });
    const out = ok(await run(script({ brief }), "Write it.", deps(m.call)));
    expect(m.calls).toEqual(["script_brief_read", "script_draft"]);
    expect(out.patch?.doc?.header.title).toBe("Kerala Piravi at our table");
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

  it("gives the edit the conversation so far, so 'like before' has something to point back to", async () => {
    const m = fakeModel({ script_edit: [{ ops: [], reply: "Done." }] });
    const history = [
      { id: "h1", role: "user" as const, content: "Keep every line light-hearted", card: null, suggestions: [], createdAt: "t" },
      { id: "h2", role: "assistant" as const, content: "Will do.", card: null, suggestions: [], createdAt: "t" },
    ];
    await prepareTurn({ script: written, ctx, text: "Now the hook, like before", history }, deps(m.call));
    const user = vi.mocked(m.call).mock.calls[0][0].user;
    expect(user).toContain("Person: Keep every line light-hearted\nCopilot: Will do.");
  });

  it("applies a one-shot edit at once and says what changed", async () => {
    const m = fakeModel({ script_edit: [{ ops: [op({ op: "set_field", path: "shots.s01.vo", value: "Golu begins." })], reply: "Shortened the hook line." }] });
    const out = ok(await run(written, "shorter hook", deps(m.call)));
    expect(out.patch?.doc?.shots[0].vo).toBe("Golu begins.");
    expect(out.result[0].content).toMatch(/^Shortened the hook line\.\n\n/);
  });

  it("carries the writer's brand-aware chips on its reply, cleaned", async () => {
    const m = fakeModel({ script_edit: [{ ops: [op({ op: "set_field", path: "shots.s01.vo", value: "Golu begins." })], reply: "Done.", suggestions: [" Shorten the hook ", ""] }] });
    const out = ok(await run(written, "shorter hook", deps(m.call)));
    expect(out.result[0].suggestions).toEqual(["Shorten the hook"]);
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
    expect(out).toEqual({ patch: null, result: [{ content: "It runs 52 seconds.", card: null, suggestions: [] }] });
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

describe("pasting a whole script (paste-a-script spec)", () => {
  it("imports it as the first draft: detect, then read, then save the script, notes and reply", async () => {
    const m = fakeModel({ script_detect: [{ wholeScript: true }], script_import: [REEL_07_IMPORT] });
    const out = ok(await run(script(), REEL_07_PASTE, deps(m.call)));
    expect(m.calls).toEqual(["script_detect", "script_import"]);
    expect(out.patch?.doc?.shots).toHaveLength(9);
    expect(out.patch?.doc?.header.reelNumber).toBe(7);
    expect(out.patch?.brief).toMatchObject({ phase: "written", imported: true, reelNumber: 7, card: null });
    expect(out.patch?.notes?.brief).toContain("From the pasted script:");
    expect(out.result).toHaveLength(1);
    expect(out.result[0].content).toMatch(/^Imported Reel 07 · 9 shots · 50s\./);
  });

  it("shows the skeleton the moment the reading starts, as a first draft does (D367)", async () => {
    const m = fakeModel({ script_detect: [{ wholeScript: true }], script_import: [REEL_07_IMPORT] });
    const onDraft = vi.fn();
    await run(script(), REEL_07_PASTE, { ...deps(m.call), onDraft });
    expect(onDraft).toHaveBeenNthCalledWith(1, EMPTY_PARTIAL_DRAFT);
  });

  it("wins over the brief mid-way: a paste while the card is showing imports, and the card goes (Review Focus 4)", async () => {
    const brief: Brief = { ...EMPTY_BRIEF, phase: "confirm", format: { value: "UGC", status: "given" }, narrative: { value: "A. Hook A: s", status: "given" }, card: CARD };
    const m = fakeModel({ script_detect: [{ wholeScript: true }], script_import: [REEL_07_IMPORT] });
    const out = ok(await run(script({ brief }), REEL_07_PASTE, deps(m.call)));
    expect(out.patch?.brief).toMatchObject({ phase: "written", imported: true, card: null });
    expect(out.patch?.brief?.format).toEqual({ value: "UGC", status: "given" });
  });

  it("goes on with the brief when the long message is not a whole script", async () => {
    const m = fakeModel({ script_detect: [{ wholeScript: false }], script_brief_read: [extraction({ format: { action: "given", value: "UGC" } })] });
    const brief = "Notes for the reel.\n".repeat(30);
    await run(script(), brief, deps(m.call));
    expect(m.calls).toEqual(["script_detect", "script_brief_read"]);
  });

  it("sends back a message over 4,000 characters that is not a script, changing nothing (Review Focus 3)", async () => {
    const m = fakeModel({ script_detect: [{ wholeScript: false }] });
    const out = ok(await run(script(), "x".repeat(4001), deps(m.call)));
    expect(out.patch).toBeNull();
    expect(out.result[0].content).toBe("That's longer than a chat message can be (4,000 characters), and it doesn't read as a whole script. If it is one, paste the whole script, shot table included.");
  });

  it("changes nothing when the paste can't be read as a script, and says what to try (spec §5.4)", async () => {
    const m = fakeModel({ script_detect: [{ wholeScript: true }], script_import: [{ ...REEL_07_IMPORT, readable: false, problem: "There is no shot table in it.", shots: [] }] });
    const out = ok(await run(script(), REEL_07_PASTE, deps(m.call)));
    expect(out.patch).toBeNull();
    expect(out.result[0].content).toBe("I couldn't read that as a script: There is no shot table in it. Nothing was changed. Try pasting the whole script, shot table included.");
  });

  it("takes the next free reel number when the pasted one is taken (success 9)", async () => {
    const taken: Script = { id: "other", clientId: "c1", stage: "visualise", doc: { ...doc, header: { ...doc.header, reelNumber: 7 } }, approvedAt: null, createdAt: "t", updatedAt: "t" };
    const m = fakeModel({ script_detect: [{ wholeScript: true }], script_import: [REEL_07_IMPORT] });
    const apply = await prepareTurn({ script: script(), ctx: { ...ctx, library: [taken] }, text: REEL_07_PASTE, history: [] }, deps(m.call));
    const out = ok(apply(script()));
    expect(out.patch?.doc?.header.reelNumber).toBe(8);
    expect(out.result[0].content).toContain("Reel 07 is taken, so this is Reel 08.");
  });

  it("refuses to save over a draft that appeared while it read", async () => {
    const m = fakeModel({ script_detect: [{ wholeScript: true }], script_import: [REEL_07_IMPORT] });
    const apply = await prepareTurn({ script: script(), ctx, text: REEL_07_PASTE, history: [] }, deps(m.call));
    expect(apply(script({ doc, docVersion: 2 }))).toEqual({ error: "The script changed while I was working. Send that again.", status: 409 });
  });
});

describe("pasting a whole script over a draft (spec §3, Q1)", () => {
  it("reads the paste first, then asks with a replace card; nothing changes and nothing streams", async () => {
    const m = fakeModel({ script_detect: [{ wholeScript: true }], script_import: [REEL_07_IMPORT] });
    const onDraft = vi.fn();
    const out = ok(await run(script({ doc }), REEL_07_PASTE, { ...deps(m.call), onDraft }));
    expect(m.calls).toEqual(["script_detect", "script_import"]);
    expect(out.patch).toBeNull();
    expect(onDraft).not.toHaveBeenCalled();
    expect(out.result[0].content).toBe("Replace the current draft with this script? Nothing changes until you choose.");
    expect(out.result[0].card).toMatchObject({ kind: "import", status: "pending", summary: "Reel 07 · 9 shots · 50s", replacing: `${shotSummary(doc)} and its notes` });
  });

  it("a few pasted rows the detector calls an edit go to the editor, not the importer (A3)", async () => {
    const rows = REEL_07_PASTE.split("\n").filter((l) => l.startsWith("| **")).slice(0, 6).join("\n");
    const m = fakeModel({ script_detect: [{ wholeScript: false }], script_edit: [{ ops: [], reply: "Which shots should these go after?" }] });
    const out = ok(await run(script({ doc }), `Add these after the hook:\n${rows}`, deps(m.call)));
    expect(m.calls).toEqual(["script_detect", "script_edit"]);
    expect(out.result[0].content).toBe("Which shots should these go after?");
  });
});

describe("acceptImport", () => {
  const built = buildImport(REEL_07_IMPORT, { paste: REEL_07_PASTE, reelNumber: 7, takenReel: null, avatars: [] });
  if ("error" in built) throw new Error(built.error);
  const card: ImportCard = { kind: "import", status: "pending", summary: "Reel 07 · 9 shots · 50s", replacing: shotSummary(doc), doc: built.doc, notes: built.notes, reply: built.reply };

  it("replaces the draft and its notes whole, and keeps the import's guesses open", () => {
    expect(acceptImport(script({ doc }), card)).toEqual({
      patch: { doc: built.doc, notes: built.notes, brief: expect.objectContaining({ phase: "written", imported: true, reelNumber: 7, card: null }) },
      result: { reply: built.reply },
      replaces: true,
    });
  });
  it("refuses a card that was already settled", () => {
    expect(acceptImport(script({ doc }), { ...card, status: "rejected" })).toEqual({ error: "That was already settled.", status: 409 });
  });
});
