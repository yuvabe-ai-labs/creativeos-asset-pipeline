import { describe, it, expect } from "vitest";
import {
  kling30TurboParams,
  kling26Params,
  kling25TurboParams,
  kling30Params,
  klingO1Params,
} from "../params/kling";

function names(params: typeof kling30TurboParams) {
  return params.map((p) => p.name);
}

describe("kling30TurboParams", () => {
  it("has resolution and duration only, no audio or multi_shot", () => {
    expect(names(kling30TurboParams)).toEqual(["resolution", "duration"]);
  });

  it("resolution options are 720p/1080p", () => {
    const p = kling30TurboParams.find((p) => p.name === "resolution")!;
    expect(p.constraints).toEqual({ type: "select", options: ["720p", "1080p"] });
  });

  it("duration options are 3 through 15", () => {
    const p = kling30TurboParams.find((p) => p.name === "duration")!;
    expect(p.constraints).toEqual({
      type: "select",
      options: ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"],
    });
  });
});

describe("kling26Params", () => {
  it("has resolution, duration, and audio", () => {
    expect(names(kling26Params)).toEqual(
      expect.arrayContaining(["resolution", "duration", "audio"]),
    );
    expect(names(kling26Params)).not.toContain("multi_shot");
  });

  it("duration options are 5 and 10 only", () => {
    const p = kling26Params.find((p) => p.name === "duration")!;
    expect(p.constraints).toEqual({ type: "select", options: ["5", "10"] });
  });

  it("audio options are native/off, default off", () => {
    const p = kling26Params.find((p) => p.name === "audio")!;
    expect(p.constraints).toEqual({ type: "select", options: ["native", "off"] });
    expect(p.defaultValue).toBe("off");
  });
});

describe("kling25TurboParams", () => {
  it("has resolution and duration only", () => {
    expect(names(kling25TurboParams)).toEqual(["resolution", "duration"]);
  });

  it("duration options are 5 and 10 only", () => {
    const p = kling25TurboParams.find((p) => p.name === "duration")!;
    expect(p.constraints).toEqual({ type: "select", options: ["5", "10"] });
  });
});

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

  it("multi_shot is a toggle defaulting true", () => {
    const p = kling30Params.find((p) => p.name === "multi_shot")!;
    expect(p.component).toBe("toggle");
    expect(p.constraints).toEqual({ type: "toggle" });
    expect(p.defaultValue).toBe(true);
  });
});

describe("klingO1Params", () => {
  it("has resolution, duration, and audio (no multi_shot)", () => {
    expect(names(klingO1Params)).toEqual(
      expect.arrayContaining(["resolution", "duration", "audio"]),
    );
    expect(names(klingO1Params)).not.toContain("multi_shot");
  });

  it("audio options are original/off, distinct from 2.6/3.0's native/off", () => {
    const p = klingO1Params.find((p) => p.name === "audio")!;
    expect(p.constraints).toEqual({ type: "select", options: ["original", "off"] });
  });

  it("duration options are 3 through 10", () => {
    const p = klingO1Params.find((p) => p.name === "duration")!;
    expect(p.constraints).toEqual({
      type: "select",
      options: ["3", "4", "5", "6", "7", "8", "9", "10"],
    });
  });
});

describe("all model param sets", () => {
  it("are all visible", () => {
    for (const params of [
      kling30TurboParams,
      kling26Params,
      kling25TurboParams,
      kling30Params,
      klingO1Params,
    ]) {
      expect(params.every((p) => p.visible)).toBe(true);
    }
  });
});
