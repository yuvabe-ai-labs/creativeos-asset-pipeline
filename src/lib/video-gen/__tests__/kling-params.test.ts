import { describe, it, expect } from "vitest";
import { kling30Params, klingO1Params, KLING_NEGATIVE_DEFAULT } from "../params/kling";
import type { ParamSpec } from "@/lib/image-gen/types";

function names(params: ParamSpec[]) {
  return params.map((p) => p.name);
}

describe("kling30Params", () => {
  it("has resolution, duration, audio, and multi_shot", () => {
    expect(names(kling30Params)).toEqual(
      expect.arrayContaining(["resolution", "duration", "audio", "multi_shot"]),
    );
  });

  it("resolution includes 4k", () => {
    const p = kling30Params.find((p) => p.name === "resolution")!;
    expect(p.constraints).toEqual({ type: "select", options: ["720p", "1080p", "4k"] });
  });

  it("multi_shot is a toggle defaulting OFF", () => {
    const p = kling30Params.find((p) => p.name === "multi_shot")!;
    expect(p.component).toBe("toggle");
    expect(p.constraints).toEqual({ type: "toggle" });
    expect(p.defaultValue).toBe(false);
  });

  it("duration is a 3–15s slider, not a 13-option select", () => {
    const p = kling30Params.find((p) => p.name === "duration")!;
    expect(p.component).toBe("slider");
    expect(p.constraints).toEqual({ type: "slider", min: 3, max: 15, step: 1 });
  });
});

describe("klingO1Params", () => {
  it("has resolution, duration, and audio (no multi_shot)", () => {
    expect(names(klingO1Params)).toEqual(
      expect.arrayContaining(["resolution", "duration", "audio"]),
    );
    expect(names(klingO1Params)).not.toContain("multi_shot");
  });

  // The omni endpoint documents native/original/off. The previous original/off pair came from
  // fal.ai's O1 wrapper, not from Kling.
  it("audio options are native/original/off", () => {
    const p = klingO1Params.find((p) => p.name === "audio")!;
    expect(p.constraints).toEqual({
      type: "select",
      options: ["native", "original", "off"],
    });
  });

  it("resolution includes 4k", () => {
    const p = klingO1Params.find((p) => p.name === "resolution")!;
    expect(p.constraints).toEqual({ type: "select", options: ["720p", "1080p", "4k"] });
  });

  // Rule OM12, from a live 400: "Duration only supports 5 or 10 seconds when no refer_image
  // is provided" (code 1201, 2026-07-27). A discrete select, not the 3.0 slider.
  it("duration is a 5/10 select, not a slider", () => {
    const p = klingO1Params.find((p) => p.name === "duration")!;
    expect(p.component).toBe("select");
    expect(p.constraints).toEqual({ type: "select", options: ["5", "10"] });
    expect(p.defaultValue).toBe("5");
  });
});

// Kling 3.0's slider stores a number where the old select stored a string; SliderControl
// coerces legacy string values so saved nodes keep their duration.
describe("duration value handling", () => {
  it("kling 3.0 defaults to a number so SliderControl renders it directly", () => {
    const p = kling30Params.find((p) => p.name === "duration")!;
    expect(typeof p.defaultValue).toBe("number");
    expect(p.defaultValue).toBe(5);
  });

  // O1's select stores strings; both builders coerce with Number(), so either survives the
  // round trip to the provider.
  it("O1 defaults to a string, matching its select options", () => {
    const p = klingO1Params.find((p) => p.name === "duration")!;
    expect(typeof p.defaultValue).toBe("string");
  });
});

// Regression guard: the union-roster merge silently dropped negative_prompt from every Kling
// param set (the guard test was replaced alongside the param file). Both surviving models must
// carry it, prefilled — see the D78 consolidation design §7.
describe("negative_prompt", () => {
  it.each([
    ["kling30Params", kling30Params],
    ["klingO1Params", klingO1Params],
  ])("%s has a prefilled negative_prompt textarea", (_label, params) => {
    const p = params.find((p) => p.name === "negative_prompt");
    expect(p).toBeDefined();
    expect(p!.component).toBe("textarea");
    expect(p!.visible).toBe(true);
    expect(p!.defaultValue).toBe(KLING_NEGATIVE_DEFAULT);
    expect(p!.constraints).toEqual({ type: "textarea", maxLength: 2500 });
  });

  it("preserves label text/logo rather than negating them (product-shot tuning)", () => {
    const items = KLING_NEGATIVE_DEFAULT.split(",").map((s) => s.trim());
    expect(items).not.toContain("text");
    expect(items).not.toContain("logo");
    expect(items).toContain("warped label");
  });

  // Stays out of the Advanced accordion: it is tuned per shot, so it must be visible without
  // expanding anything. Audio / Multi-Shot are the only params behind Advanced.
  it("is a primary param, not hidden behind Advanced", () => {
    for (const params of [kling30Params, klingO1Params]) {
      expect(params.find((p) => p.name === "negative_prompt")!.group).toBe("primary");
    }
    expect(
      kling30Params.filter((p) => p.group === "advanced").map((p) => p.name).sort(),
    ).toEqual(["audio", "multi_shot"]);
    expect(klingO1Params.filter((p) => p.group === "advanced").map((p) => p.name)).toEqual([
      "audio",
    ]);
  });

  it("sorts last within primary so the textarea renders below the paired controls", () => {
    for (const params of [kling30Params, klingO1Params]) {
      const primary = params.filter((p) => p.group === "primary");
      const maxOther = Math.max(
        ...primary.filter((p) => p.name !== "negative_prompt").map((p) => p.order),
      );
      const neg = primary.find((p) => p.name === "negative_prompt")!;
      expect(neg.order).toBeGreaterThan(maxOther);
    }
  });
});

describe("all model param sets", () => {
  it("are all visible", () => {
    for (const params of [kling30Params, klingO1Params]) {
      expect(params.every((p) => p.visible)).toBe(true);
    }
  });
});
