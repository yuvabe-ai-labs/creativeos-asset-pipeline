import { describe, it, expect } from "vitest";
import { makeViews } from "@/lib/avatars/__tests__/fixtures";
import { faceKey, fingerprint, shotKey } from "../keys";
import { readyAvatar, reel01Doc, MEENAKSHI_AVATAR } from "./fixtures";

describe("fingerprint", () => {
  it("is stable, short, and changes with the text", () => {
    expect(fingerprint("abc")).toBe(fingerprint("abc"));
    expect(fingerprint("abc")).toMatch(/^[0-9a-f]{8}$/);
    expect(fingerprint("abc")).not.toBe(fingerprint("abd"));
  });
});

describe("shotKey (D344)", () => {
  const doc = reel01Doc();
  const s06 = doc.shots.find((s) => s.id === "s06")!;

  it("changes when what is drawn changes: the visual, who is on screen, how they are described", () => {
    const base = shotKey(doc, s06);
    expect(shotKey(doc, { ...s06, visual: "She sets the bowl down." })).not.toBe(base);
    expect(shotKey(doc, { ...s06, onScreen: ["meenakshi"] })).not.toBe(base);
    const redescribed = { ...doc, cast: doc.cast.map((c) => (c.id === "husband" ? { ...c, description: "Her husband, 60." } : c)) };
    expect(shotKey(redescribed, s06)).not.toBe(base);
  });

  it("does not change for what is never drawn: the VO and the length", () => {
    const base = shotKey(doc, s06);
    expect(shotKey(doc, { ...s06, vo: "Something else.", lengthSeconds: 5 })).toBe(base);
  });

  it("ignores a change to someone who is not in the shot", () => {
    const s01 = doc.shots.find((s) => s.id === "s01")!;
    const redescribed = { ...doc, cast: doc.cast.map((c) => (c.id === "husband" ? { ...c, description: "Her husband, 60." } : c)) };
    expect(shotKey(redescribed, s01)).toBe(shotKey(doc, s01));
  });
});

describe("faceKey (D344)", () => {
  it("changes when the front or any view changes, and only then", () => {
    const a = readyAvatar(MEENAKSHI_AVATAR, "meenakshi");
    const renamed = { ...a, name: "Renamed", voice: null };
    expect(faceKey(renamed)).toBe(faceKey(a));
    expect(faceKey({ ...a, sheetViews: { ...a.sheetViews!, left: makeViews("new").left } })).not.toBe(faceKey(a));
    expect(faceKey({ ...a, front: { ...a.front!, url: "https://x/new.png" } })).not.toBe(faceKey(a));
  });
});
