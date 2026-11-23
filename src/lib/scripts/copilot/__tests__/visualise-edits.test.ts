import { describe, it, expect } from "vitest";
import type { EditOp } from "../output";
import { routeVisualiseOps, VISUALISE_REFUSALS } from "../visualise-edits";

const op = (o: Partial<EditOp> & Pick<EditOp, "op">): EditOp => ({
  path: null, value: null, shotId: null, afterShotId: null, shot: null, second: null, list: null,
  cast: null, itemId: null, product: null, location: null, ...o,
});
const apply = { kind: "apply" };
const card = { kind: "card" };

describe("routeVisualiseOps", () => {
  it("casts an avatar at once", () => {
    expect(routeVisualiseOps([op({ op: "link_avatar" })], [])).toEqual(apply);
  });
  it("changes who leads at once", () => {
    expect(routeVisualiseOps([op({ op: "set_lead" })], [])).toEqual(apply);
  });
  it("changes locations and products at once", () => {
    expect(routeVisualiseOps([op({ op: "add_location" }), op({ op: "update_product" })], [])).toEqual(apply);
  });
  it("changes one shot's words at once", () => {
    expect(routeVisualiseOps([op({ op: "update_shot", shotId: "s1" })], ["s1"])).toEqual(apply);
  });
  it("changes one field of the script at once", () => {
    expect(routeVisualiseOps([op({ op: "set_field", path: "header.title", value: "New" })], [])).toEqual(apply);
  });
  it("changes the watch-outs at once", () => {
    expect(routeVisualiseOps([op({ op: "set_watch_outs", list: ["x"] })], [])).toEqual(apply);
  });
  it("puts a change across several shots on a card", () => {
    expect(routeVisualiseOps([op({ op: "update_shot", shotId: "s1" }), op({ op: "update_shot", shotId: "s2" })], ["s1", "s2"])).toEqual(card);
  });
  for (const name of ["insert_shot", "remove_shot", "split_shot", "move_shot", "add_cast", "remove_cast", "update_cast"] as const) {
    it(`puts ${name} on a card`, () => {
      expect(routeVisualiseOps([op({ op: name })], [])).toEqual(card);
    });
  }
  it("puts a request mixing at once and a card wholly on the card", () => {
    expect(routeVisualiseOps([op({ op: "link_avatar" }), op({ op: "insert_shot" })], [])).toEqual(card);
  });
  it("refuses confirming an open item", () => {
    expect(routeVisualiseOps([op({ op: "confirm_item", itemId: "g1" })], [])).toEqual({ kind: "refuse", reason: VISUALISE_REFUSALS.notes });
  });
  it("refuses the reel's notes", () => {
    expect(routeVisualiseOps([op({ op: "set_field", path: "notes.brief", value: "x" })], [])).toEqual({ kind: "refuse", reason: VISUALISE_REFUSALS.notes });
  });
  it("refuses the whole request when part of it is refused, so nothing is half done", () => {
    expect(routeVisualiseOps([op({ op: "confirm_item", itemId: "g1" }), op({ op: "link_avatar" })], [])).toMatchObject({ kind: "refuse" });
  });
});
