import { describe, it, expect } from "vitest";
import { smartMergeParams } from "../merge";
import type { ClientModelSpec } from "../../types";

function makeModel(params: Array<{ name: string; options?: string[]; min?: number; max?: number; defaultValue: unknown }>): ClientModelSpec {
  return {
    id: "test:model",
    provider: "test",
    mediaType: "image",
    label: "Test Model",
    providerLabel: "Test",
    maxReferenceImages: 0,
    maxReferenceSizeBytes: 0,
    params: params.map((p) => ({
      name: p.name,
      label: p.name,
      component: p.options ? "select" as const : "slider" as const,
      group: "primary" as const,
      order: 0,
      visible: true,
      defaultValue: p.defaultValue,
      constraints: p.options
        ? { type: "select" as const, options: p.options }
        : { type: "slider" as const, min: p.min ?? 0, max: p.max ?? 100, step: 1 },
    })),
    schema: {} as never,
  };
}

describe("smartMergeParams", () => {
  it("keeps a select param value that is valid in the new model", () => {
    const current = { quality: "high", size: "1024x1024" };
    const newModel = makeModel([
      { name: "quality", options: ["low", "medium", "high"], defaultValue: "medium" },
    ]);
    const result = smartMergeParams(current, newModel);
    expect(result.quality).toBe("high");
  });

  it("resets a select param when the value is not in the new model's options", () => {
    const current = { size: "auto" };
    const newModel = makeModel([
      { name: "size", options: ["1024x1024", "1536x1024"], defaultValue: "1024x1024" },
    ]);
    const result = smartMergeParams(current, newModel);
    expect(result.size).toBe("1024x1024");
  });

  it("keeps a slider param value within the new model's range", () => {
    const current = { compression: 60 };
    const newModel = makeModel([
      { name: "compression", min: 0, max: 100, defaultValue: 80 },
    ]);
    const result = smartMergeParams(current, newModel);
    expect(result.compression).toBe(60);
  });

  it("resets a slider param when value is outside the new model's range", () => {
    const current = { compression: 150 };
    const newModel = makeModel([
      { name: "compression", min: 0, max: 100, defaultValue: 80 },
    ]);
    const result = smartMergeParams(current, newModel);
    expect(result.compression).toBe(80);
  });

  it("uses default for params that did not exist in the old model", () => {
    const current = {};
    const newModel = makeModel([
      { name: "background", options: ["auto", "opaque"], defaultValue: "auto" },
    ]);
    const result = smartMergeParams(current, newModel);
    expect(result.background).toBe("auto");
  });

  it("excludes old params not present in the new model", () => {
    const current = { oldParam: "value" };
    const newModel = makeModel([
      { name: "quality", options: ["low", "high"], defaultValue: "low" },
    ]);
    const result = smartMergeParams(current, newModel);
    expect(result).not.toHaveProperty("oldParam");
  });
});
