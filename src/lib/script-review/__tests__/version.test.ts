// src/lib/script-review/__tests__/version.test.ts
import { describe, it, expect } from "vitest";
import { describeChanges, diffVersions, joinWithAnd } from "../version";
import type { PanelSnapshot } from "../types";
import { avatarSnapshot, content, reelDoc } from "./fixtures";

const allPanels = (take: string): Record<string, PanelSnapshot> =>
  Object.fromEntries(reelDoc().shots.map((s) => [s.id, { takeId: `${take}-${s.id}`, url: `https://cdn/${take}/${s.id}.png` }]));

describe("diffVersions", () => {
  it("has nothing to say about a first share", () => {
    expect(diffVersions(null, content())).toEqual([]);
  });

  it("finds nothing when the same thing is shared again", () => {
    expect(diffVersions(content(), content())).toEqual([]);
  });

  it("names edited shots in script order", () => {
    const next = content();
    next.doc.shots[3].vo = "A new line";
    next.doc.shots[0].visual = "A new opening";
    const changes = diffVersions(content(), next);
    expect(changes.map((c) => `${c.label} ${c.change}`)).toEqual(["S1 revised", "S4 revised"]);
    expect(changes[0].part).toEqual({ kind: "shot", shotId: "s01" });
    expect(describeChanges(changes)).toBe("S1 and S4 revised");
  });

  it("labels a removed shot by its number in the version it left", () => {
    const next = content();
    next.doc.shots = next.doc.shots.filter((s) => s.id !== "s09");
    const changes = diffVersions(content(), next);
    expect(changes).toEqual([{ part: { kind: "shot", shotId: "s09" }, change: "removed", label: "S9" }]);
  });

  it("on a split, the first half keeps the shot and the new half is added", () => {
    const next = content();
    const s05 = next.doc.shots[4];
    next.doc.shots.splice(4, 1, { ...s05, visual: "First half", lengthSeconds: 2 }, { ...s05, id: "s05b", visual: "Second half", lengthSeconds: 2 });
    const changes = diffVersions(content(), next);
    expect(changes.map((c) => `${c.label} ${c.change}`)).toEqual(["S5 revised", "S6 added"]);
  });

  it("puts the context first when the header or the context card changed", () => {
    const next = content();
    next.doc.context.purpose = "A sharper purpose";
    next.doc.shots[1].vo = "Edited";
    expect(describeChanges(diffVersions(content(), next))).toBe("Context and S2 revised");
  });

  it("does not list fourteen changes when a share only widens to panels (Review Focus)", () => {
    const prev = content({ scope: "avatars", visuals: { avatars: { meenakshi: avatarSnapshot() }, panels: {} } });
    const next = content({ scope: "panels", visuals: { avatars: { meenakshi: avatarSnapshot() }, panels: allPanels("a") } });
    expect(diffVersions(prev, next)).toEqual([]);
  });

  it("counts a new picked panel as a change to its shot when both shares had panels", () => {
    const prevPanels = allPanels("a");
    const nextPanels = { ...prevPanels, s07: { takeId: "b-s07", url: "https://cdn/b/s07.png" } };
    const prev = content({ scope: "panels", visuals: { avatars: {}, panels: prevPanels } });
    const next = content({ scope: "panels", visuals: { avatars: {}, panels: nextPanels } });
    expect(describeChanges(diffVersions(prev, next))).toBe("S7 revised");
  });

  it("counts new avatar images as a change to that cast member when both shares had avatars", () => {
    const prev = content({ scope: "avatars", visuals: { avatars: { meenakshi: avatarSnapshot({ front: "f1" }) }, panels: {} } });
    const next = content({ scope: "avatars", visuals: { avatars: { meenakshi: avatarSnapshot({ front: "f2" }) }, panels: {} } });
    expect(diffVersions(prev, next)).toEqual([{ part: { kind: "cast", castId: "meenakshi" }, change: "revised", label: "Meenakshi" }]);
  });

  it("reads like the board: shots first, then the avatar", () => {
    const prev = content({ scope: "avatars", visuals: { avatars: { meenakshi: avatarSnapshot({ front: "f1" }) }, panels: {} } });
    const next = content({ scope: "avatars", visuals: { avatars: { meenakshi: avatarSnapshot({ front: "f2" }) }, panels: {} } });
    for (const i of [0, 3, 4]) next.doc.shots[i].onScreenText = "New card";
    expect(describeChanges(diffVersions(prev, next))).toBe("S1, S4, S5 and Meenakshi revised");
  });
});

describe("describeChanges", () => {
  it("groups by kind of change", () => {
    expect(
      describeChanges([
        { part: { kind: "shot", shotId: "a" }, change: "revised", label: "S1" },
        { part: { kind: "shot", shotId: "b" }, change: "added", label: "S6" },
        { part: { kind: "shot", shotId: "c" }, change: "removed", label: "S9" },
      ]),
    ).toBe("S1 revised · S6 added · S9 removed");
  });
  it("is null when nothing changed", () => {
    expect(describeChanges([])).toBeNull();
  });
});

describe("joinWithAnd", () => {
  it("joins lists the way a sentence does", () => {
    expect(joinWithAnd([])).toBe("");
    expect(joinWithAnd(["S1"])).toBe("S1");
    expect(joinWithAnd(["S1", "S4"])).toBe("S1 and S4");
    expect(joinWithAnd(["S1", "S4", "S5"])).toBe("S1, S4 and S5");
  });
});
