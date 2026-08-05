import { describe, it, expect } from "vitest";
import { gptImage2Params, gptImage1Params } from "../openai";
import { buildZodFromParams } from "../../schema-builder";

// Regression coverage: gpt-image-2 doesn't support transparent backgrounds (OpenAI's Image
// Generation Guide — "gpt-image-2 doesn't currently support transparent backgrounds. Requests
// with background: 'transparent' aren't supported for this model."), but this was previously
// aliased to gpt-image-1's param set, which does support it, letting the UI offer an option
// that always 400s at OpenAI.
function backgroundOptions(params: typeof gptImage2Params): string[] {
  const spec = params.find((p) => p.name === "background");
  if (!spec || spec.constraints.type !== "select") throw new Error("no background select param");
  return spec.constraints.options;
}

describe("gpt-image param background options", () => {
  it("gpt-image-2 does not offer transparent", () => {
    expect(backgroundOptions(gptImage2Params)).toEqual(["auto", "opaque"]);
  });

  it("gpt-image-1 still offers transparent", () => {
    expect(backgroundOptions(gptImage1Params)).toEqual(["auto", "opaque", "transparent"]);
  });

  it("gpt-image-2's schema rejects background: transparent", () => {
    const schema = buildZodFromParams(gptImage2Params);
    const result = schema.safeParse({ background: "transparent" });
    expect(result.success).toBe(false);
  });

  it("gpt-image-1's schema accepts background: transparent", () => {
    const schema = buildZodFromParams(gptImage1Params);
    const result = schema.safeParse({ background: "transparent" });
    expect(result.success).toBe(true);
  });
});
