import { describe, it, expect, vi } from "vitest";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import { scriptDocSchema } from "@/lib/scripts/schema";
import { acceptProposal, prepareTurn, type TurnDeps } from "../turn";
import { editPrompt } from "../messages";
import { EMPTY_BRIEF, EMPTY_NOTES, type GenerateScript } from "../schema";
import type { CopilotContext } from "../context";
import { visualiseTurnSchema, type EditOp } from "../output";
import type { StructuredCall } from "../model";
import type { BoardFacts } from "../board-text";
import { VISUALISE_REFUSALS } from "../visualise-edits";
import generatePrompt from "./fixtures/edit-prompt-generate.json";

const doc = scriptDocSchema.parse(reel01);
const ctx: CopilotContext = {
  clientName: "Jackfruit365", kbText: "KB", hasKb: true, library: [], avatars: [], today: "Wed 28 Oct 2026",
  signals: { brief: "", digest: "", list: [] },
};
const atVisualise: GenerateScript = {
  id: "s1", clientId: "c1", stage: "visualise", doc, brief: { ...EMPTY_BRIEF, phase: "written" }, notes: EMPTY_NOTES,
  docVersion: 5, createdAt: "t", updatedAt: "t1",
};
const board: BoardFacts = {
  shots: doc.shots.map((s, i) => ({ id: s.id, label: `S${i + 1}`, panel: "ready", versions: 1, picked: 1 })),
  castWithoutAvatar: [], withoutPicture: [],
};
const op = (o: Partial<EditOp> & Pick<EditOp, "op">): EditOp => ({
  path: null, value: null, shotId: null, afterShotId: null, shot: null, second: null, list: null, cast: null, itemId: null, product: null, location: null, ...o,
});
const out = (over: Record<string, unknown> = {}) => ({ ops: [], reply: "Done.", suggestions: [], picks: [], offer: "none", ...over });

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
const deps = (call: StructuredCall): TurnDeps => ({ call, newShotId: (() => { let n = 0; return () => `new${++n}`; })() });
const run = async (text: string, call: StructuredCall) => {
  const apply = await prepareTurn({ script: atVisualise, ctx, text, history: [], stage: "visualise", board }, deps(call));
  const r = apply(atVisualise);
  if ("error" in r) throw new Error(r.error);
  return r;
};

describe("the copilot's turn at Visualise", () => {
  it("sends Generate's edit prompt unchanged when there is no board", () => {
    const base = { clientName: "Jackfruit365", kbText: "KB", library: "lib", avatars: "av", today: "Wed 28 Oct 2026", signalDigest: "", formatMenu: "menu" };
    expect(editPrompt(base, { doc, notes: EMPTY_NOTES, openItems: [], conversation: "Person: hi", text: "shorter hook" })).toEqual(generatePrompt);
  });

  it("uses the Visualise schema and the board at Visualise", async () => {
    const m = fakeModel({ script_visualise_edit: [out()] });
    await run("how many panels are left?", m.call);
    const args = vi.mocked(m.call).mock.calls[0][0] as unknown as { schema: unknown; user: string };
    expect(args.schema).toBe(visualiseTurnSchema);
    expect(args.user).toContain("## The storyboard at Visualise");
    expect(args.user).toContain("S1 (id s01): panel ready, 1 version, version 1 picked");
  });

  it("applies a one-shot change at once", async () => {
    const m = fakeModel({ script_visualise_edit: [out({ ops: [op({ op: "set_field", path: "shots.s01.vo", value: "Golu begins." })], reply: "Shortened it." })] });
    const r = await run("shorter hook", m.call);
    expect(r.patch?.doc?.shots[0].vo).toBe("Golu begins.");
    expect(r.result[0]).toMatchObject({ content: "Shortened it.", card: null });
  });

  it("puts an added shot on a card", async () => {
    const shot = { beat: "CLOSE", lengthSeconds: 3, visual: "The bottle on the counter.", vo: "", onScreenText: "", onScreen: [], products: [], location: "" };
    const m = fakeModel({ script_visualise_edit: [out({ ops: [op({ op: "insert_shot", afterShotId: "s14", shot })], reply: "Added a closing shot." })] });
    const r = await run("add a closing shot", m.call);
    expect(r.patch).toBeNull();
    expect(r.result[0].card).toMatchObject({ kind: "proposal", status: "pending" });
  });

  it("shows the shots a character is in on a character's card", async () => {
    const m = fakeModel({ script_visualise_edit: [out({ ops: [op({ op: "update_cast", cast: { castId: "husband", name: "Ravi", description: "Her husband, 60.", avatarId: null } })], reply: "Renamed him Ravi." })] });
    const r = await run("call the husband Ravi", m.call);
    const card = r.result[0].card;
    expect(card?.kind === "proposal" && card.before.map((s) => s.id)).toEqual(["s06", "s10", "s12"]);
  });

  it("refuses the notes with a Reopen offer", async () => {
    const m = fakeModel({ script_visualise_edit: [out({ ops: [op({ op: "confirm_item", itemId: "g1" })], reply: "Confirmed." })] });
    const r = await run("yes that's confirmed", m.call);
    expect(r.patch).toBeNull();
    expect(r.result[0]).toMatchObject({ content: VISUALISE_REFUSALS.notes, card: { kind: "offer", action: "reopen" } });
  });

  it("refuses a pasted whole script at Visualise", async () => {
    const m = fakeModel({ script_detect: [{ wholeScript: true }] });
    const text = Array.from({ length: 40 }, (_, i) => `Shot ${i + 1}: VO line for the reel, with a visual and on-screen text.`).join("\n");
    const r = await run(text, m.call);
    expect(m.calls).toEqual(["script_detect"]);
    expect(r.result[0]).toMatchObject({ content: VISUALISE_REFUSALS.replace, card: { kind: "offer", action: "reopen" } });
  });

  it("carries the model's offer as an offer card", async () => {
    const m = fakeModel({ script_visualise_edit: [out({ reply: "Ready when you are.", offer: "draw" })] });
    const r = await run("draw them", m.call);
    expect(r.result[0].card).toEqual({ kind: "offer", action: "draw" });
  });

  it("carries picks on the last reply", async () => {
    const m = fakeModel({ script_visualise_edit: [out({ reply: "Picked version 1 for S2.", picks: [{ shotId: "s02", version: 1 }] })] });
    const r = await run("use the first version of S2", m.call);
    expect(r.result.at(-1)?.picks).toEqual([{ shotId: "s02", version: 1 }]);
  });

  it("says only what it applied when a card is accepted at Visualise (no open items: the script is final)", async () => {
    const shot = { beat: "CLOSE", lengthSeconds: 3, visual: "The bottle.", vo: "", onScreenText: "", onScreen: [], products: [], location: "" };
    const m = fakeModel({ script_visualise_edit: [out({ ops: [op({ op: "insert_shot", afterShotId: "s14", shot })], reply: "Added a closing shot." })] });
    const card = (await run("add a closing shot", m.call)).result[0].card;
    if (card?.kind !== "proposal") throw new Error("no card");
    const accepted = acceptProposal(atVisualise, card, { newShotId: () => "new9", avatarIds: new Set() });
    if ("error" in accepted) throw new Error(accepted.error);
    expect(accepted.result.reply).toBe("Applied: Added a closing shot.");
  });
});
