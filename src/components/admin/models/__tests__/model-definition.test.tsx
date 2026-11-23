import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ModelDefinition } from "../model-definition";
import type { ParamSpec } from "@/lib/image-gen/types";
import type { ConstraintRule } from "@/lib/video-gen/types";

const params: ParamSpec[] = [
  {
    name: "aspect_ratio", label: "Aspect ratio", component: "select", group: "primary", order: 1,
    visible: true, defaultValue: "1:1", constraints: { type: "select", options: ["1:1", "16:9"] },
  },
  {
    name: "duration", label: "Length", component: "slider", group: "primary", order: 2,
    visible: true, defaultValue: 5, constraints: { type: "slider", min: 3, max: 12, step: 1 },
  },
  {
    name: "seed_mode", label: "Seed mode", component: "toggle", group: "advanced", order: 1,
    visible: false, defaultValue: false, constraints: { type: "toggle" },
  },
];
const rules: ConstraintRule[] = [
  {
    id: "r1", when: { field: "hasEndFrame", op: "eq", value: true },
    effect: { disableRefs: true }, reason: "End frames cannot be mixed with references",
  },
];
const capabilities = { supportsMask: true, imageInputs: { maxReferenceImages: 4 } };

describe("ModelDefinition", () => {
  const html = renderToStaticMarkup(
    <ModelDefinition params={params} rules={rules} capabilities={capabilities} />,
  );

  it("lists each param with label, name, type and options or range", () => {
    expect(html).toContain("Aspect ratio");
    expect(html).toContain("aspect_ratio");
    expect(html).toContain("select");
    expect(html).toContain("1:1, 16:9");
    expect(html).toContain("Length");
    expect(html).toContain("3 to 12");
  });

  it("marks hidden params", () => {
    expect(html).toContain("hidden");
  });

  it("lists each rule's reason", () => {
    expect(html).toContain("End frames cannot be mixed with references");
  });

  it("flattens nested capabilities", () => {
    expect(html).toContain("supportsMask");
    expect(html).toContain("imageInputs.maxReferenceImages");
  });

  it("has no editable control", () => {
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("<textarea");
  });
});
