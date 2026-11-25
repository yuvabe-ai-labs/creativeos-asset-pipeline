import { z } from "zod";
import { defaultEmptyImageAnalysis, TraceableBrandKBSchema, type KBField, type TraceableBrandKB } from "../schema";

// A whole brand KB for tests: every field of the six document sections stated, filled and
// unreviewed, unless overridden by its dotted path.

const SECTIONS: string[][] = [
  ["brand_profile"], ["visual_identity"], ["target_audience"],
  ["creative_direction", "image"], ["creative_direction", "video"], ["compliance"],
];

type Shape = Record<string, z.ZodObject<Record<string, z.ZodTypeAny>>>;

function sectionShape(path: string[]): Shape {
  let node: z.ZodTypeAny = TraceableBrandKBSchema;
  for (const key of path) node = (node as z.ZodObject<Record<string, z.ZodTypeAny>>).shape[key];
  return (node as z.ZodObject<Shape>).shape;
}

const isList = (field: z.ZodObject<Record<string, z.ZodTypeAny>>) =>
  (field.shape.value as z.ZodNullable<z.ZodTypeAny>).unwrap() instanceof z.ZodArray;

export function kbWith(overrides: Record<string, Partial<KBField<unknown>>>): TraceableBrandKB {
  const kb: Record<string, unknown> = {
    brand: { value: "Acme", confidence: "high", evidence_type: "explicit", status: "needs_review" },
    creative_direction: {},
    image_analysis: defaultEmptyImageAnalysis(),
  };
  for (const path of SECTIONS) {
    const section: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(sectionShape(path))) {
      section[key] = {
        value: isList(field) ? ["x"] : "x", confidence: "high", evidence_type: "explicit", status: "needs_review",
        ...overrides[[...path, key].join(".")],
      };
    }
    if (path.length === 1) kb[path[0]] = section;
    else (kb[path[0]] as Record<string, unknown>)[path[1]] = section;
  }
  return kb as unknown as TraceableBrandKB;
}

export function withImageAnalysis(kb: TraceableBrandKB, over: Record<string, Partial<KBField<unknown>>>): TraceableBrandKB {
  const section = { ...kb.image_analysis } as Record<string, KBField<unknown>>;
  for (const [key, patch] of Object.entries(over)) section[key] = { ...section[key], ...patch };
  return { ...kb, image_analysis: section as unknown as TraceableBrandKB["image_analysis"] };
}
