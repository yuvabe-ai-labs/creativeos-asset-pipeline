import { describe, it, expect } from "vitest";
import type { ScriptDoc } from "@/lib/scripts/schema";
import type { Avatar } from "@/lib/avatars/schema";
import type { GenerateAllPlan, PanelStatus, PanelView } from "@/lib/scripts/visualise/state";
import { HUSBAND_AVATAR, MEENAKSHI_AVATAR, linkedDoc, readyAvatar, reel01Doc } from "@/lib/scripts/visualise/__tests__/fixtures";
import { visualiseStep, type WalkInput } from "../visualise-walk";

const ready = new Map<string, Avatar>([[MEENAKSHI_AVATAR, readyAvatar(MEENAKSHI_AVATAR, "m")], [HUSBAND_AVATAR, readyAvatar(HUSBAND_AVATAR, "h")]]);
const view = (status: PanelStatus): PanelView => ({ status, pick: null, takes: [], failure: null, staleBecause: [], waitingFor: [], canGenerate: status !== "waiting" });
const views = (doc: ScriptDoc, status: (id: string) => PanelStatus) => new Map(doc.shots.map((s) => [s.id, view(status(s.id))]));
const plan = (shotIds: string[]): GenerateAllPlan => ({ shotIds, credits: 70 * shotIds.length, redraw: false, waiting: 0 });
const input = (over: Partial<WalkInput> = {}): WalkInput => {
  const doc = over.doc ?? linkedDoc();
  return { doc, avatars: ready, views: views(doc, () => "ready"), plan: plan([]), ...over };
};

describe("visualiseStep", () => {
  it("asks who plays the lead first, even when another character is listed before", () => {
    const doc = reel01Doc();
    doc.cast = [...doc.cast].reverse();
    expect(visualiseStep(input({ doc, avatars: new Map(), plan: plan(["s03"]) }))).toEqual({ kind: "cast", castId: "meenakshi", name: "Meenakshi", drawable: 1 });
  });

  it("asks someone to finish an avatar that is linked but not ready to draw", () => {
    const doc = linkedDoc();
    const avatars = new Map(ready);
    avatars.set(MEENAKSHI_AVATAR, readyAvatar(MEENAKSHI_AVATAR, "m", { status: "draft" }));
    expect(visualiseStep(input({ doc, avatars }))).toMatchObject({ kind: "finish_avatar", castId: "meenakshi", name: "Meenakshi" });
  });

  it("never asks about a character on screen in no shot", () => {
    const doc = linkedDoc();
    doc.cast.push({ id: "narrator", name: "Narrator", description: "Voice.", avatarId: null, isLead: false });
    expect(visualiseStep(input({ doc }))).toEqual({ kind: "send" });
  });

  it("says panels are being drawn, ahead of pictures and drawing", () => {
    const doc = linkedDoc();
    expect(visualiseStep(input({ doc, views: views(doc, (id) => (id === "s01" || id === "s02" ? "generating" : "not_yet")), plan: plan(["s03"]) })))
      .toEqual({ kind: "drawing", count: 2 });
  });

  it("asks for the pictures the shots still to draw use, and not for an unused one", () => {
    const doc = linkedDoc();
    doc.locations = [{ id: "cafe", name: "the café", description: "d", image: null }, { id: "park", name: "the park", description: "d", image: null }];
    doc.products = [{ id: "pouch", name: "the pouch", images: [] }];
    doc.shots[0] = { ...doc.shots[0], location: "cafe", products: ["pouch"] };
    const p = plan(["s01", "s02"]);
    expect(visualiseStep(input({ doc, views: views(doc, () => "not_yet"), plan: p }))).toEqual({
      kind: "pictures", plan: p,
      missing: [{ id: "cafe", kind: "location", name: "the café" }, { id: "pouch", kind: "product", name: "the pouch" }],
    });
  });

  it("offers the draw once nothing is missing", () => {
    const doc = linkedDoc();
    const p = plan(["s01"]);
    expect(visualiseStep(input({ doc, views: views(doc, (id) => (id === "s01" ? "not_yet" : "ready")), plan: p }))).toEqual({ kind: "draw", plan: p });
  });

  it("offers the send once every shot has a current panel", () => {
    expect(visualiseStep(input())).toEqual({ kind: "send" });
  });
});
