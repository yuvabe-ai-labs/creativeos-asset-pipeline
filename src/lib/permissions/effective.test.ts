import { describe, it, expect } from "vitest";
import { computeEffective } from "./effective";
import { ALL_PERMISSION_KEYS } from "./catalogue";

describe("computeEffective (D489 §2.3)", () => {
  it("gives an owner every key, whatever the rows say", () => {
    const set = computeEffective({ isOwner: true, presetKeys: [], granted: [], revoked: ["scripts.view"] });
    expect(set.size).toBe(ALL_PERMISSION_KEYS.length);
  });

  it("adds granted ticks and removes revoked ones", () => {
    const set = computeEffective({
      isOwner: false,
      presetKeys: ["scripts.view", "scripts.edit", "image_generation.approve"],
      granted: ["team.view"],
      revoked: ["image_generation.approve"],
    });
    expect(set.has("team.view")).toBe(true);
    expect(set.has("image_generation.approve")).toBe(false);
    expect(set.has("scripts.edit")).toBe(true);
  });

  it("turns on an area's view when any tick in it is on", () => {
    const set = computeEffective({ isOwner: false, presetKeys: ["avatars.generate"], granted: [], revoked: ["avatars.view"] });
    expect(set.has("avatars.view")).toBe(true);
  });

  it("does not invent a view the area does not offer", () => {
    const set = computeEffective({ isOwner: false, presetKeys: ["image_generation.generate"], granted: [], revoked: [] });
    expect([...set]).toEqual(["image_generation.generate"]);
  });

  it("ignores keys the catalogue no longer knows", () => {
    const set = computeEffective({ isOwner: false, presetKeys: ["old_area.view"], granted: ["scripts.share"], revoked: [] });
    expect(set.size).toBe(0);
  });
});
