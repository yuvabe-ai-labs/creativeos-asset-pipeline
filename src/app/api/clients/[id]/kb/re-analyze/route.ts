import { createServerSupabase } from "@/lib/supabase/server";
import { zodTextFormat } from "openai/helpers/zod";
import { createOpenAI } from "@/lib/openai/server";
import { updateKBVersionOutput } from "@/lib/db/kb";
import { setNestedField, getNestedValue } from "@/lib/kb/utils";
import {
  TraceableBrandProfileSchema,
  TraceableVisualIdentitySchema,
  TraceableTargetAudienceSchema,
  TraceableImageDirectionSchema,
  TraceableVideoDirectionSchema,
  TraceableComplianceSchema,
  ImageAnalysisSchema,
  type TraceableBrandKB,
  type KBField,
} from "@/lib/kb/schema";
import { kbReanalyzePrompt } from "@/prompts/kb-reanalyze";
import { z } from "zod";
import { apiError, apiOk, withTryCatch } from "@/lib/api/route-helpers";

type ModuleKey =
  | "brand_voice"
  | "visual_identity"
  | "image_analysis"
  | "audience_casting"
  | "image_direction"
  | "video_direction"
  | "compliance";

const MODULE_SCHEMA: Record<ModuleKey, z.ZodObject<z.ZodRawShape>> = {
  brand_voice: TraceableBrandProfileSchema,
  visual_identity: TraceableVisualIdentitySchema,
  image_analysis: ImageAnalysisSchema,
  audience_casting: TraceableTargetAudienceSchema,
  image_direction: TraceableImageDirectionSchema,
  video_direction: TraceableVideoDirectionSchema,
  compliance: TraceableComplianceSchema,
};

const MODULE_LABEL: Record<ModuleKey, string> = {
  brand_voice: "Brand Voice",
  visual_identity: "Visual Identity",
  image_analysis: "Image Analysis",
  audience_casting: "Target Audience & Casting",
  image_direction: "Image Direction",
  video_direction: "Video Direction",
  compliance: "Compliance Rules",
};

function resolveFieldPath(module: ModuleKey, fieldKey: string): string[] {
  switch (module) {
    case "brand_voice":      return ["brand_profile", fieldKey];
    case "visual_identity":  return ["visual_identity", fieldKey];
    case "image_analysis":   return ["image_analysis", fieldKey];
    case "audience_casting": return ["target_audience", fieldKey];
    case "image_direction":  return ["creative_direction", "image", fieldKey];
    case "video_direction":  return ["creative_direction", "video", fieldKey];
    case "compliance":       return ["compliance", fieldKey];
  }
}

// POST /api/clients/:id/kb/re-analyze
// Lightweight single-field reanalysis: sends only the current field value + user
// feedback to the model — no document re-processing. Returns { fieldKey, field }.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await params; // clientId not needed for this route — versionId scopes the update

  return withTryCatch("Re-analysis failed", async () => {
    const { versionId, module, fieldKey, comment } = await req.json() as {
      versionId: string;
      module: ModuleKey;
      fieldKey: string;
      comment: string;
    };

    if (!versionId || !module || !fieldKey || !comment?.trim()) {
      return apiError("Missing required fields.", 400);
    }

    if (!(module in MODULE_SCHEMA)) {
      return apiError("Invalid module.", 400);
    }

    const moduleSchema = MODULE_SCHEMA[module];
    const fieldZodSchema = (moduleSchema.shape as Record<string, z.ZodTypeAny>)[fieldKey];
    if (!fieldZodSchema) {
      return apiError(`Unknown field "${fieldKey}" in module "${module}".`, 400);
    }

    const supabase = createServerSupabase();
    const { data: versionData, error: versionErr } = await supabase
      .from("client_kb_versions")
      .select("output")
      .eq("id", versionId)
      .maybeSingle();

    if (versionErr) return apiError(versionErr.message, 500);
    if (!versionData) return apiError("Version not found.", 404);

    const currentKB = versionData.output as TraceableBrandKB;
    const fieldPath = resolveFieldPath(module, fieldKey);
    const currentField = getNestedValue(currentKB as unknown as Record<string, unknown>, fieldPath);

    const userMsg = JSON.stringify({
      field_name: fieldKey,
      section: MODULE_LABEL[module],
      field_description: (fieldZodSchema as { description?: string }).description ?? fieldKey,
      current_value: currentField ?? null,
      user_feedback: comment.trim(),
    });

    const openai = createOpenAI();
    const response = await openai.responses.parse({
      model: kbReanalyzePrompt.model,
      input: [
        { role: "system", content: kbReanalyzePrompt.system },
        { role: "user", content: userMsg },
      ],
      text: { format: zodTextFormat(fieldZodSchema, "kb_field") },
      temperature: 0.3,
    });

    const updatedField = response.output_parsed as KBField<unknown> | null;
    if (!updatedField) return apiError("Model returned no output.", 500);

    const updatedKB = setNestedField(
      currentKB as unknown as Record<string, unknown>,
      fieldPath,
      updatedField as Record<string, unknown>,
    ) as unknown as TraceableBrandKB;

    await updateKBVersionOutput(versionId, updatedKB);

    return apiOk({ fieldKey, field: updatedField });
  });
}
