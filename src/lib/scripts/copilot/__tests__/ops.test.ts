import { describe, it, expect } from "vitest";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import { scriptDocSchema } from "@/lib/scripts/schema";
import { applyOps, beforeAfter, type OpsGen } from "../ops";
import { newShotId } from "../draft";
import type { EditOp, ShotFields } from "../output";

const doc = scriptDocSchema.parse(reel01);
const notes = { brief: "", confirmations: [{ id: "c1", text: "Sun 11 Oct is day one", confirmed: false }] };
const AVATAR = "7a2d3c4e-0000-4000-8000-000000000002";
let n = 0;
const gen: OpsGen = { newShotId: () => `new${++n}`, avatarIds: new Set([AVATAR]) };
const realGen: OpsGen = { newShotId, avatarIds: new Set() };

const op = (o: Partial<EditOp> & Pick<EditOp, "op">): EditOp => ({
  path: null, value: null, shotId: null, afterShotId: null, shot: null, second: null, list: null, cast: null, itemId: null, ...o,
});
const fields = (beat: string, vo = "A line.", card = "A card."): ShotFields =>
  ({ beat, lengthSeconds: 3, visual: `${beat} visual`, vo, onScreenText: card, onScreen: ["meenakshi"] });
const ok = (r: ReturnType<typeof applyOps>) => { if (!r.ok) throw new Error(r.error); return r; };
const others = (d: typeof doc, except: string[]) => d.shots.filter((s) => !except.includes(s.id));

describe("applyOps: shot ids (the contract with spec 3)", () => {
  it("an edited shot keeps its id, and every other shot stays exactly as it was", () => {
    const r = ok(applyOps(doc, notes, [op({ op: "update_shot", shotId: "s03", shot: fields("INTRO", "Warmer line.") })], gen));
    expect(r.doc.shots[2]).toMatchObject({ id: "s03", vo: "Warmer line." });
    expect(others(r.doc, ["s03"])).toEqual(others(doc, ["s03"]));
    expect(r.touchedShotIds).toEqual(["s03"]);
  });

  it("a split's first half keeps the original id and its second half is new, placed right after", () => {
    const r = ok(applyOps(doc, notes, [op({ op: "split_shot", shotId: "s05", shot: fields("STEP", "First."), second: fields("STEP", "Second.") })], gen));
    const i = r.doc.shots.findIndex((s) => s.id === "s05");
    expect(r.doc.shots[i + 1].id).toMatch(/^new\d+$/);
    expect(r.doc.shots).toHaveLength(doc.shots.length + 1);
    expect(r.touchedShotIds).toHaveLength(2);
  });

  it("a removed id never comes back on a later new shot", () => {
    const removed = ok(applyOps(doc, notes, [op({ op: "remove_shot", shotId: "s05" })], realGen));
    const added = ok(applyOps(removed.doc, notes, [op({ op: "insert_shot", afterShotId: "s04", shot: fields("STEP") })], realGen));
    const fresh = added.doc.shots[4];
    expect(fresh.id).not.toBe("s05");
    expect(fresh.id).toMatch(/^s[0-9a-f]{8}$/);
  });

  it("moves a shot without changing its content or id", () => {
    const r = ok(applyOps(doc, notes, [op({ op: "move_shot", shotId: "s08", afterShotId: "s01" })], gen));
    expect(r.doc.shots[1]).toEqual(doc.shots[7]);
    expect(r.doc.shots.map((s) => s.id).sort()).toEqual(doc.shots.map((s) => s.id).sort());
  });

  it("inserting at the start puts the shot first", () => {
    const r = ok(applyOps(doc, notes, [op({ op: "insert_shot", afterShotId: null, shot: fields("HOOK") })], gen));
    expect(r.doc.shots[0].id).toMatch(/^new\d+$/);
  });
});

describe("applyOps: all or nothing", () => {
  it("applies nothing when any operation fails, and says which", () => {
    const r = applyOps(doc, notes, [
      op({ op: "set_field", path: "header.title", value: "Changed" }),
      op({ op: "remove_shot", shotId: "s99" }),
    ], gen);
    expect(r).toEqual({ ok: false, error: 'Change 2 (remove_shot): there is no shot "s99".' });
  });

  it("refuses an operation missing what it needs", () => {
    expect(applyOps(doc, notes, [op({ op: "update_shot", shotId: "s01" })], gen)).toMatchObject({ ok: false });
    expect(applyOps(doc, notes, [op({ op: "set_field", path: "shots.s01.id", value: "x" })], gen)).toMatchObject({ ok: false });
  });

  it("never removes the last shot", () => {
    const one = { ...doc, shots: [doc.shots[0]] };
    expect(applyOps(one, notes, [op({ op: "remove_shot", shotId: "s01" })], gen)).toMatchObject({ ok: false });
  });
});

describe("applyOps: the carry rule and the cast", () => {
  it("blanks a touched split shot that repeats its beat's line, and leaves untouched shots alone", () => {
    const r = ok(applyOps(doc, notes, [op({ op: "insert_shot", afterShotId: "s01", shot: fields("HOOK", doc.shots[0].vo, doc.shots[0].onScreenText) })], gen));
    expect(r.doc.shots[1]).toMatchObject({ vo: "", onScreenText: "" });
    expect(r.doc.shots[2]).toEqual(doc.shots[1]);
  });

  it("set_field touches only the shot it names", () => {
    const r = ok(applyOps(doc, notes, [op({ op: "set_field", path: "shots.s02.visual", value: "New visual." })], gen));
    expect(r.touchedShotIds).toEqual(["s02"]);
    expect(others(r.doc, ["s02"])).toEqual(others(doc, ["s02"]));
  });

  it("drops unknown people from a shot", () => {
    const r = ok(applyOps(doc, notes, [op({ op: "update_shot", shotId: "s01", shot: { ...fields("HOOK"), onScreen: ["meenakshi", "ghost"] } })], gen));
    expect(r.doc.shots[0].onScreen).toEqual(["meenakshi"]);
  });

  it("will not remove the lead; removing anyone else takes them off every shot", () => {
    expect(applyOps(doc, notes, [op({ op: "remove_cast", cast: { castId: "meenakshi", name: "", description: "", avatarId: null } })], gen)).toMatchObject({ ok: false });
    const r = ok(applyOps(doc, notes, [op({ op: "remove_cast", cast: { castId: "husband", name: "", description: "", avatarId: null } })], gen));
    expect(r.doc.cast.map((c) => c.id)).toEqual(["meenakshi"]);
    expect(r.doc.shots.some((s) => s.onScreen.includes("husband"))).toBe(false);
  });

  it("links only a known avatar, unlinks with null, and moves the lead", () => {
    expect(applyOps(doc, notes, [op({ op: "link_avatar", cast: { castId: "husband", name: "", description: "", avatarId: "7a2d3c4e-0000-4000-8000-00000000dead" } })], gen)).toMatchObject({ ok: false });
    const linked = ok(applyOps(doc, notes, [op({ op: "link_avatar", cast: { castId: "husband", name: "", description: "", avatarId: AVATAR } })], gen));
    expect(linked.doc.cast[1].avatarId).toBe(AVATAR);
    const lead = ok(applyOps(doc, notes, [op({ op: "set_lead", cast: { castId: "husband", name: "", description: "", avatarId: null } })], gen));
    expect(lead.doc.cast.map((c) => c.isLead)).toEqual([false, true]);
  });

  it("confirms an item in the notes", () => {
    const r = ok(applyOps(doc, notes, [op({ op: "confirm_item", itemId: "c1" })], gen));
    expect(r.notes.confirmations[0].confirmed).toBe(true);
    expect(r.doc).toEqual(doc);
  });
});

describe("beforeAfter", () => {
  it("shows the touched shots as they were and as they will be", () => {
    const r = ok(applyOps(doc, notes, [op({ op: "split_shot", shotId: "s05", shot: fields("STEP", "First."), second: fields("STEP", "Second.") })], gen));
    const ba = beforeAfter(doc, r.doc, r.touchedShotIds);
    expect(ba.before.map((s) => s.id)).toEqual(["s05"]);
    expect(ba.after.map((s) => s.vo)).toEqual(["First.", "Second."]);
  });
});
