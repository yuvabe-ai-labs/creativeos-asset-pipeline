import { z } from "zod";
import { TraceableBrandKBSchema, type KBField } from "./schema";

// One change to one field of the brand KB: where the field is, and the parts of it that change.
// Whatever the patch leaves out stays as stored.

export type KBFieldPatch = {
  path: string[];
  patch: Partial<Pick<KBField<unknown>, "value" | "status" | "confidence" | "evidence_type">>;
};

/** The most fields one save may carry: every field of the KB, with room to spare. */
export const KB_FIELD_PATCHES_MAX = 60;

export const kbFieldPatchSchema = z.object({
  path: z.array(z.string().min(1)).min(2).max(3),
  patch: z.strictObject({
    value: z.union([z.string(), z.array(z.string()), z.null()]).optional(),
    status: z.enum(["needs_review", "approved", "edited", "rejected"]).optional(),
    confidence: z.enum(["high", "medium", "low"]).optional(),
    evidence_type: z.enum(["explicit", "inferred"]).optional(),
  }).refine((patch) => Object.keys(patch).length > 0, "A patch must change something."),
});

/** Whether `path` names one field of the brand KB: a field of a section, never a section itself,
 *  the root brand name, or a part of a field. Read from the schema, so it never falls out of step. */
export function isPatchablePath(path: string[]): boolean {
  if (path.length < 2) return false;
  let node: z.ZodTypeAny | undefined = TraceableBrandKBSchema;
  for (const key of path) {
    node = node instanceof z.ZodObject ? (node as z.ZodObject<Record<string, z.ZodTypeAny>>).shape[key] : undefined;
    if (!node) return false;
  }
  // A field is the object that holds `value` and `status`.
  return node instanceof z.ZodObject && "status" in node.shape && "value" in node.shape;
}
