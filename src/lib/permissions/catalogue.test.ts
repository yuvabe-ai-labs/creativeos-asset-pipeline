import { describe, it, expect } from "vitest";
import {
  AREAS,
  GROUPS,
  ALL_PERMISSION_KEYS,
  isPermissionKey,
  splitKey,
  isClientScopedKey,
  areaHasLevel,
} from "./catalogue";
import { SENIOR_DEFAULT_KEYS, DESIGNER_DEFAULT_KEYS, MEDIA_APPROVE_KEYS } from "./presets";

describe("permission catalogue", () => {
  it("has 59 unique keys of the form area.level", () => {
    expect(ALL_PERMISSION_KEYS).toHaveLength(59);
    expect(new Set(ALL_PERMISSION_KEYS).size).toBe(59);
    for (const k of ALL_PERMISSION_KEYS) expect(k).toMatch(/^[a-z_]+\.(view|edit|generate|approve|share|delete)$/);
  });

  it("puts every area in a known group, with unique area keys", () => {
    const groups = new Set(GROUPS.map((g) => g.key));
    for (const a of AREAS) expect(groups.has(a.group)).toBe(true);
    expect(new Set(AREAS.map((a) => a.key)).size).toBe(AREAS.length);
  });

  it("marks only clients, team and credits as agency-wide", () => {
    const agency = AREAS.filter((a) => !a.clientScoped).map((a) => a.key).sort();
    expect(agency).toEqual(["clients", "credits", "team"]);
    expect(isClientScopedKey("scripts.edit")).toBe(true);
    expect(isClientScopedKey("team.edit")).toBe(false);
  });

  it("recognises real keys only", () => {
    expect(isPermissionKey("scripts.approve")).toBe(true);
    expect(isPermissionKey("scripts.share")).toBe(false);
    expect(isPermissionKey("nonsense")).toBe(false);
  });

  it("splits a key into area and level", () => {
    expect(splitKey("video_generation.generate")).toEqual({ area: "video_generation", level: "generate" });
  });

  it("knows which levels an area offers", () => {
    expect(areaHasLevel("canvases", "generate")).toBe(true);
    expect(areaHasLevel("image_generation", "view")).toBe(false);
  });
});

describe("preset defaults", () => {
  it("senior has every key except team", () => {
    expect(SENIOR_DEFAULT_KEYS).toHaveLength(56);
    expect(SENIOR_DEFAULT_KEYS.some((k) => k.startsWith("team."))).toBe(false);
  });

  it("designer is senior minus image, video and audio approve, and keeps scripts.approve", () => {
    expect(MEDIA_APPROVE_KEYS).toEqual(["image_generation.approve", "video_generation.approve", "audio.approve"]);
    expect(DESIGNER_DEFAULT_KEYS).toHaveLength(53);
    for (const k of MEDIA_APPROVE_KEYS) expect(DESIGNER_DEFAULT_KEYS).not.toContain(k);
    expect(DESIGNER_DEFAULT_KEYS).toContain("scripts.approve");
  });
});
