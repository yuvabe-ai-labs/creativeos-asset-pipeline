// D529 — a catalog row is checked before the app uses it. A row that fails is left out of the
// catalog (the loader logs it), never half used.
import { z } from "zod";
import type { ParamSpec } from "@/lib/image-gen/types";
import type { ConstraintRule } from "@/lib/video-gen/types";
import { AI_MODEL_KINDS, AI_MODEL_STATUSES, METERS, type AiModel, type AiModelKind, type AiModelPrice, type PriceLine } from "./types";

export const MODEL_COLUMNS =
  "id, provider, kind, label, picker_label, provider_label, description, status, replaced_by, " +
  "sort_order, adapter_key, provider_model_id, params, rules, capabilities, updated_at";
export const PRICE_COLUMNS = "id, model_id, effective_from, lines, estimate, source_url, note";

const paramConstraintsSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("select"), options: z.array(z.string()) }),
  z.object({ type: z.literal("slider"), min: z.number(), max: z.number(), step: z.number().optional() }),
  z.object({ type: z.literal("toggle") }),
  z.object({
    type: z.literal("number"),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
  }),
  z.object({ type: z.literal("textarea"), maxLength: z.number().optional() }),
]);

const paramSpecSchema = z.object({
  name: z.string().min(1),
  label: z.string(),
  component: z.enum(["select", "slider", "toggle", "number", "textarea"]),
  group: z.enum(["primary", "advanced"]),
  order: z.number(),
  visible: z.boolean(),
  defaultValue: z.unknown(),
  constraints: paramConstraintsSchema,
  description: z.string().optional(),
});

const leafConditionSchema = z.object({
  field: z.enum(["referenceCount", "hasEndFrame", "hasStartFrame", "duration"]),
  op: z.enum(["gt", "gte", "eq"]),
  value: z.union([z.number(), z.boolean()]),
});

type ConditionShape =
  | z.infer<typeof leafConditionSchema>
  | { op: "and" | "or"; conditions: ConditionShape[] };

const conditionSchema: z.ZodType<ConditionShape> = z.lazy(() =>
  z.union([
    leafConditionSchema,
    z.object({ op: z.enum(["and", "or"]), conditions: z.array(conditionSchema) }),
  ]),
);

const constraintRuleSchema = z.object({
  id: z.string().min(1),
  when: conditionSchema,
  effect: z.object({
    lockParams: z.array(z.object({ name: z.string(), value: z.unknown() })).optional(),
    disableFrameInputs: z.boolean().optional(),
    disableRefs: z.boolean().optional(),
    disableGenerate: z.boolean().optional(),
  }),
  reason: z.string(),
});

// D539 — what a model can take, by kind: ClientModelSpec's limits for an image model, and
// VideoGenClientModelSpec's maxDurationSeconds / imageInputs for a video model, field for field.
// A key this build doesn't know is dropped rather than refused, so a row written by a newer
// build still loads in an older one.
const imageCapabilitiesSchema = z.object({
  maxReferenceImages: z.number().int().nonnegative(),
  maxReferenceSizeBytes: z.number().nonnegative(),
  maxTotalReferenceSizeBytes: z.number().positive().optional(),
  maxImageEdgePx: z.number().positive().optional(),
  maxAspectRatio: z.number().positive().optional(),
  minDimensionMultiple: z.number().int().positive().optional(),
  supportsMask: z.boolean().optional(),
});

const videoCapabilitiesSchema = z.object({
  maxDurationSeconds: z.number().positive(),
  imageInputs: z.object({
    startFrame: z.boolean(),
    endFrame: z.boolean(),
    maxReferenceImages: z.number().int().nonnegative(),
    maxImagesWithFrames: z.number().int().positive().optional(),
  }),
});

export type ImageCapabilities = z.infer<typeof imageCapabilitiesSchema>;
export type VideoCapabilities = z.infer<typeof videoCapabilitiesSchema>;

/** Image and video rows are checked; the other kinds carry no capabilities today. */
function parseCapabilities(kind: AiModelKind, value: Record<string, unknown>): Record<string, unknown> | null {
  if (kind === "image") {
    const parsed = imageCapabilitiesSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  }
  if (kind === "video") {
    const parsed = videoCapabilitiesSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  }
  return value;
}

const aiModelRowSchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  kind: z.enum(AI_MODEL_KINDS),
  label: z.string(),
  picker_label: z.string().nullable(),
  provider_label: z.string(),
  description: z.string().nullable(),
  status: z.enum(AI_MODEL_STATUSES),
  replaced_by: z.string().nullable(),
  sort_order: z.number().int(),
  adapter_key: z.string().min(1),
  provider_model_id: z.string().min(1).nullable(),
  params: z.array(paramSpecSchema),
  rules: z.array(constraintRuleSchema),
  capabilities: z.record(z.string(), z.unknown()),
  updated_at: z.string(),
});

const priceLineSchema = z.object({
  meter: z.enum(METERS),
  unit_usd: z.number().nonnegative(),
  when: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

const aiModelPriceRowSchema = z.object({
  id: z.string().min(1),
  model_id: z.string().min(1),
  effective_from: z.string(),
  lines: z.array(priceLineSchema).min(1),
  estimate: z.record(z.string(), z.number().nonnegative()),
  source_url: z.string().nullable(),
  note: z.string().nullable(),
});

/** The one check a model row goes through. `problems` lists each issue as `path: message`. */
export function checkAiModelRow(row: unknown): { model: AiModel | null; problems: string[] } {
  const parsed = aiModelRowSchema.safeParse(row);
  if (!parsed.success) {
    return { model: null, problems: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  const r = parsed.data;
  const capabilities = parseCapabilities(r.kind, r.capabilities);
  if (!capabilities) return { model: null, problems: ["capabilities: not valid for this kind"] };
  return {
    model: {
      id: r.id,
      provider: r.provider,
      kind: r.kind,
      label: r.label,
      pickerLabel: r.picker_label,
      providerLabel: r.provider_label,
      description: r.description,
      status: r.status,
      replacedBy: r.replaced_by,
      sortOrder: r.sort_order,
      adapterKey: r.adapter_key,
      providerModelId: r.provider_model_id,
      // The Zod shapes above mirror ParamSpec and ConstraintRule field for field.
      params: r.params as ParamSpec[],
      rules: r.rules as ConstraintRule[],
      capabilities,
      updatedAt: r.updated_at,
    },
    problems: [],
  };
}

export function parseAiModelRow(row: unknown): AiModel | null {
  return checkAiModelRow(row).model;
}

/** The one check a price row goes through. `problems` lists each issue as `path: message`. */
export function checkAiModelPriceRow(row: unknown): { price: AiModelPrice | null; problems: string[] } {
  const parsed = aiModelPriceRowSchema.safeParse(row);
  if (!parsed.success) {
    return { price: null, problems: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  const r = parsed.data;
  return {
    price: {
      id: r.id,
      modelId: r.model_id,
      effectiveFrom: r.effective_from,
      lines: r.lines as PriceLine[],
      estimate: r.estimate,
      sourceUrl: r.source_url,
      note: r.note,
    },
    problems: [],
  };
}

export function parseAiModelPriceRow(row: unknown): AiModelPrice | null {
  return checkAiModelPriceRow(row).price;
}
