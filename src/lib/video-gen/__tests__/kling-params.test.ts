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
  it("has resolution, duration, audio, and multi_shot", () => {
    expect(names(klingO1Params)).toEqual(
      expect.arrayContaining(["resolution", "duration", "audio", "multi_shot"]),
    );
  });

  // The omni enum is native | original | off, but `original` only retains a reference video's
  // own soundtrack and we never send a video — so it produced silence. `native` is the only
  // value that yields audio in our flow; offering `original` made audio unreachable on O1.
  it("audio offers native, not the reference-video-only original", () => {
    const p = klingO1Params.find((p) => p.name === "audio")!;
    expect(p.constraints).toEqual({ type: "select", options: ["native", "off"] });
  });

  // Kling defaults multi_shot to true server-side, so this must be present and default false —
  // omitting it opted every O1 clip into multi-shot cuts.
  it("multi_shot is exposed and defaults OFF, matching 3.0", () => {
    const p = klingO1Params.find((p) => p.name === "multi_shot")!;
    expect(p.component).toBe("toggle");
    expect(p.defaultValue).toBe(false);
  });

  // Not a slider like 3.0: Kling's /omni-video endpoint accepts an arbitrary duration only when
  // a refer_image is supplied, and we only ever send first_frame — so 5 and 10 are the sole
  // legal values, and two non-contiguous stops cannot be a range control.
  it("duration is a 5/10 select, not a continuous slider", () => {
    const p = klingO1Params.find((p) => p.name === "duration")!;
    expect(p.component).toBe("select");
    expect(p.constraints).toEqual({ type: "select", options: ["5", "10"] });
  });

  // OM8: required on the references-only path. It lived in the `advanced` group, which no
  // component renders since the Advanced accordion was removed from the focus view (7e1c643) —
  // so the control existed in the spec and nowhere on screen. Primary is the only group that
  // reaches the UI today, and framing belongs beside resolution/duration anyway.
  it("exposes aspect_ratio as a PRIMARY param so the UI actually renders it", () => {
    const p = klingO1Params.find((p) => p.name === "aspect_ratio")!;
    expect(p).toBeDefined();
    expect(p.group).toBe("primary");
    expect(p.visible).toBe(true);
    expect(p.constraints).toEqual({ type: "select", options: ["16:9", "9:16", "1:1"] });
    expect(p.defaultValue).toBe("16:9");
  });

  // 3.0 is first-frame-only, so Kling always derives the ratio from that image — an
  // aspect_ratio chip group there would be a control that changes nothing.
  it("is O1-only: 3.0 declares no aspect_ratio", () => {
    expect(kling30Params.some((p) => p.name === "aspect_ratio")).toBe(false);
  });

  it("offers no duration Kling would reject with code 1201", () => {
    const p = klingO1Params.find((p) => p.name === "duration")!;
    const options = p.constraints.type === "select" ? p.constraints.options : [];
    expect(options).not.toContain("3");
    expect(options).not.toContain("4");
    expect(options).not.toContain("8");
  });
});

// The slider stores a number where the select stored a string. Both must survive the round
// trip to the provider, or a node saved before this change generates at the wrong length.
describe("duration value handling", () => {
  it("3.0 defaults to a number so SliderControl renders it directly", () => {
    const p = kling30Params.find((p) => p.name === "duration")!;
    expect(typeof p.defaultValue).toBe("number");
    expect(p.defaultValue).toBe(5);
  });

  // O1 is a chip select, and ParamChipGroup compares String(value) against the option list —
  // so its default is a string, matching every other select param here.
  it("O1 defaults to a string matching one of its options", () => {
    const p = klingO1Params.find((p) => p.name === "duration")!;
    expect(p.defaultValue).toBe("5");
    const options = p.constraints.type === "select" ? p.constraints.options : [];
    expect(options).toContain(p.defaultValue);
  });

  // Both models agree on 5s, so switching between them keeps the length the user chose.
  it("both models default to 5 seconds regardless of value type", () => {
    for (const params of [kling30Params, klingO1Params]) {
      const p = params.find((p) => p.name === "duration")!;
      expect(Number(p.defaultValue)).toBe(5);
    }
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

  // Stays out of the Advanced group: it is tuned per shot, so it must be visible without
  // expanding anything. Audio / Multi-Shot are the only params left in Advanced — and note
  // that no component renders that group at present (see the aspect_ratio case above).
  it("is a primary param, not hidden behind Advanced", () => {
    for (const params of [kling30Params, klingO1Params]) {
      expect(params.find((p) => p.name === "negative_prompt")!.group).toBe("primary");
    }
    expect(
      kling30Params.filter((p) => p.group === "advanced").map((p) => p.name).sort(),
    ).toEqual(["audio", "multi_shot"]);
    expect(
      klingO1Params.filter((p) => p.group === "advanced").map((p) => p.name).sort(),
    ).toEqual(["audio", "multi_shot"]);
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
