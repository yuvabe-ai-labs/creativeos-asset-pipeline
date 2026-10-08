import { describe, it, expect } from "vitest";
import type { Avatar } from "@/lib/avatars/schema";
import { makeViews } from "@/lib/avatars/__tests__/fixtures";
import type { ScriptDoc } from "@/lib/scripts/schema";
import { panelInputs, panelReferenceCap, type PanelInputs } from "../panel-inputs";
import {
  generateAllLabel, generateAllPlan, panelView, promptForDraw, visualiseReadiness, waitingMessage,
  type PanelView,
} from "../state";
import type { PanelTake } from "../schema";
import { PANEL_TIMED_OUT } from "../constants";
import {
  avatarMap, HUSBAND_AVATAR, linkedDoc, makeTake, MEENAKSHI_AVATAR, readyAvatar, reel01Doc,
} from "./fixtures";

const NOW = Date.parse("2026-10-08T12:00:00.000Z");
const meenakshi = readyAvatar(MEENAKSHI_AVATAR, "meenakshi");
const husband = readyAvatar(HUSBAND_AVATAR, "husband");

function inputsFor(doc: ScriptDoc, avatars: Map<string, Avatar>): Map<string, PanelInputs> {
  return new Map(doc.shots.map((shot) => [shot.id, panelInputs({ doc, shot, avatars, kits: [], cap: panelReferenceCap() })]));
}

/** A drawn, picked take for every shot of `doc`, as the draw route would have stored it. */
function drawEverything(doc: ScriptDoc, avatars: Map<string, Avatar>) {
  const takes: PanelTake[] = [];
  const picks: Record<string, string> = {};
  for (const [shotId, inputs] of inputsFor(doc, avatars)) {
    const take = makeTake({ id: `t-${shotId}`, shotId, shotKey: inputs.shotKey, faces: inputs.faces, prompt: inputs.prompt });
    takes.push(take);
    picks[shotId] = take.id;
  }
  return { takes, picks };
}

function viewsFor(doc: ScriptDoc, avatars: Map<string, Avatar>, takes: PanelTake[], picks: Record<string, string>) {
  const inputs = inputsFor(doc, avatars);
  return new Map<string, PanelView>(doc.shots.map((s) => [s.id, panelView({
    inputs: inputs.get(s.id)!, takes: takes.filter((t) => t.shotId === s.id), pickId: picks[s.id], drawing: false, now: NOW,
  })]));
}

describe("panelView (spec §6.4)", () => {
  const doc = linkedDoc();
  const avatars = avatarMap(meenakshi, husband);
  const inputs = inputsFor(doc, avatars);
  const view = (shotId: string, takes: PanelTake[], pickId?: string, drawing = false) =>
    panelView({ inputs: inputs.get(shotId)!, takes, pickId, drawing, now: NOW });

  it("is Not yet with no takes, and Waiting when someone on screen has no avatar", () => {
    expect(view("s01", []).status).toBe("not_yet");
    const unlinked = reel01Doc();
    const waiting = panelView({ inputs: inputsFor(unlinked, new Map()).get("s06")!, takes: [], pickId: undefined, drawing: false, now: NOW });
    expect(waiting).toMatchObject({ status: "waiting", canGenerate: false, waitingFor: ["Meenakshi", "Meenakshi's husband"] });
  });

  it("is Generating while this browser waits on a draw, or a take is still running", () => {
    expect(view("s01", [], undefined, true).status).toBe("generating");
    expect(view("s01", [makeTake({ status: "running", createdAt: "2026-10-08T11:59:00.000Z" })]).status).toBe("generating");
  });

  it("shows a take still running after ten minutes as failed, so it can be drawn again", () => {
    const stuck = makeTake({ status: "running", createdAt: "2026-10-08T11:40:00.000Z" });
    expect(view("s01", [stuck])).toMatchObject({ status: "failed", failure: PANEL_TIMED_OUT });
  });

  it("is Ready on a current pick, and keeps the earlier takes oldest first", () => {
    const i = inputs.get("s01")!;
    const older = makeTake({ id: "a", shotKey: i.shotKey, faces: i.faces, createdAt: "2026-10-08T10:00:00.000Z" });
    const newer = makeTake({ id: "b", shotKey: i.shotKey, faces: i.faces, createdAt: "2026-10-08T11:00:00.000Z" });
    const v = view("s01", [newer, older], "a");
    expect(v.status).toBe("ready");
    expect(v.pick?.id).toBe("a");
    expect(v.takes.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("is Failed with the provider's message when nothing was ever drawn, and keeps the pick when a redraw fails", () => {
    expect(view("s01", [makeTake({ status: "failed", url: null, error: "Content blocked" })])).toMatchObject({
      status: "failed", failure: "Content blocked",
    });
    const i = inputs.get("s01")!;
    const good = makeTake({ id: "a", shotKey: i.shotKey, faces: i.faces, createdAt: "2026-10-08T10:00:00.000Z" });
    const bad = makeTake({ id: "b", status: "failed", url: null, error: "Content blocked", createdAt: "2026-10-08T11:00:00.000Z" });
    expect(view("s01", [good, bad], "a")).toMatchObject({ status: "ready", failure: "Content blocked" });
  });
});

describe("out of date (D343, spec §3.6)", () => {
  it("refining Meenakshi's avatar marks exactly her nine panels, and Generate all redraws only those", () => {
    const doc = linkedDoc();
    const before = avatarMap(meenakshi, husband);
    const { takes, picks } = drawEverything(doc, before);
    const refined = avatarMap({ ...meenakshi, sheetViews: makeViews("meenakshi-2") }, husband);
    const views = viewsFor(doc, refined, takes, picks);

    const stale = doc.shots.filter((s) => views.get(s.id)!.status === "out_of_date").map((s) => s.id);
    expect(stale).toEqual(["s01", "s02", "s05", "s06", "s07", "s08", "s10", "s11", "s12"]);
    expect(views.get("s06")!.staleBecause).toEqual(["avatar"]);

    const plan = generateAllPlan(doc, views, () => 10);
    expect(plan.shotIds).toEqual(stale);
    expect(generateAllLabel(plan)).toBe("Redraw 9 panels · about 90 credits");
  });

  it("a script back from Reopen: edited and split-first-half out of date, split-second-half and new empty, removed gone", () => {
    const before = linkedDoc();
    const avatars = avatarMap(meenakshi, husband);
    const { takes, picks } = drawEverything(before, avatars);

    const after = linkedDoc();
    const s03 = after.shots.findIndex((s) => s.id === "s03");
    after.shots[s03] = { ...after.shots[s03], visual: "The same morning, in the kitchen. Only the tawa." };
    const s07 = after.shots.findIndex((s) => s.id === "s07");
    after.shots.splice(s07, 1,
      { ...after.shots[s07], lengthSeconds: 3, visual: "Top-down on the bowl. She levels one tablespoon." },
      { ...after.shots[s07], id: "s07b", lengthSeconds: 3, visual: "She levels the second and stirs." });
    after.shots = after.shots.filter((s) => s.id !== "s14");
    after.shots.push({ id: "s15", beat: "OUTRO", lengthSeconds: 4, visual: "The brass lamp, lit.", vo: "", onScreenText: "", onScreen: [] });

    const views = viewsFor(after, avatars, takes, picks);
    expect(views.get("s03")).toMatchObject({ status: "out_of_date", staleBecause: ["shot"] });
    expect(views.get("s07")!.status).toBe("out_of_date");
    expect(views.get("s07b")!.status).toBe("not_yet");
    expect(views.get("s15")!.status).toBe("not_yet");
    expect(views.has("s14")).toBe(false);
    expect(views.get("s01")!.status).toBe("ready");

    const readiness = visualiseReadiness(after, avatars, views);
    expect(readiness).toEqual({ castReady: 2, castTotal: 2, panelsCurrent: 11, shotsTotal: 15 });
    expect(generateAllPlan(after, views, () => 10).shotIds).toEqual(["s03", "s07", "s07b", "s15"]);
  });

  it("an edited shot redraws from a fresh prompt; its hand-edited prompt stays with the old take", () => {
    const doc = linkedDoc();
    const avatars = avatarMap(meenakshi, husband);
    const i = inputsFor(doc, avatars).get("s03")!;
    const edited = makeTake({ shotId: "s03", shotKey: i.shotKey, prompt: "closer on the tawa", promptEdited: true });
    expect(promptForDraw({ kind: "draw" }, edited, i)).toEqual({ ok: true, prompt: "closer on the tawa", edited: true });
    const changed = { ...i, shotKey: "different", prompt: "fresh from the new text" };
    expect(promptForDraw({ kind: "draw" }, edited, changed)).toEqual({ ok: true, prompt: "fresh from the new text", edited: false });
  });
});

describe("promptForDraw (D344)", () => {
  const i = { prompt: "built", shotKey: "k" };

  it("uses the edited prompt, or resets to the built one", () => {
    expect(promptForDraw({ kind: "edited", prompt: "  closer on her hands  " }, null, i)).toEqual({ ok: true, prompt: "closer on her hands", edited: true });
    expect(promptForDraw({ kind: "edited", prompt: "built" }, null, i)).toEqual({ ok: true, prompt: "built", edited: false });
    expect(promptForDraw({ kind: "reset" }, makeTake({ promptEdited: true, shotKey: "k" }), i)).toEqual({ ok: true, prompt: "built", edited: false });
  });

  it("refuses an empty or overlong prompt", () => {
    expect(promptForDraw({ kind: "edited", prompt: "   " }, null, i)).toEqual({ ok: false, error: "The prompt is empty." });
    expect(promptForDraw({ kind: "edited", prompt: "x".repeat(8001) }, null, i).ok).toBe(false);
  });
});

describe("readiness and Generate all (spec §6.5, §7)", () => {
  it("counts cast with an avatar and shots with a current panel, and leaves waiting shots out of Generate all", () => {
    const doc = reel01Doc();
    const views = viewsFor(doc, new Map(), [], {});
    expect(visualiseReadiness(doc, new Map(), views)).toEqual({ castReady: 0, castTotal: 2, panelsCurrent: 0, shotsTotal: 14 });
    const plan = generateAllPlan(doc, views, () => 7);
    expect(plan.shotIds).toEqual(["s03", "s04", "s09", "s13", "s14"]);
    expect(plan.waiting).toBe(9);
    expect(generateAllLabel(plan)).toBe("Generate 5 panels · about 35 credits");
  });

  it("has no total when a shot has no price", () => {
    const doc = reel01Doc();
    const views = viewsFor(doc, new Map(), [], {});
    expect(generateAllPlan(doc, views, () => null).credits).toBeNull();
  });

  it("words the wait for avatars", () => {
    expect(waitingMessage(["Meenakshi"])).toBe("Meenakshi needs an avatar with its four views first.");
    expect(waitingMessage(["Meenakshi", "Meenakshi's husband"])).toBe("Meenakshi and Meenakshi's husband need an avatar with its four views first.");
  });
});
