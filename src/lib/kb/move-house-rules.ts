import type { KBField, TraceableBrandKB } from "./schema";

// Brand-neutral spec §3.5 — a client's script house rules were pasted into the image analysis's
// consistency notes for the demo (spec 2, answer 2c.1). They move to Content Rules, their own field,
// which the image analyser never writes. A one-off, run per client by scripts/move-house-rules.ts.

/** The KB with its pasted house rules copied into an empty Content Rules (marked edited, as a
 *  person wrote them). A filled Content Rules is never overwritten; the notes are left as they are. */
export function withHouseRulesMoved(kb: TraceableBrandKB): { kb: TraceableBrandKB; moved: boolean } {
  const raw: unknown = kb.image_analysis?.brand_consistency_notes?.value;
  const notes = (Array.isArray(raw) ? raw.join(", ") : typeof raw === "string" ? raw : "").trim();
  const existing: unknown = kb.compliance?.content_rules?.value;
  const filled = Array.isArray(existing) ? existing.length > 0 : typeof existing === "string" && existing.trim() !== "";
  if (!notes || filled) return { kb, moved: false };
  const content_rules: KBField<string> = { value: notes, confidence: "high", evidence_type: "explicit", status: "edited" };
  return { kb: { ...kb, compliance: { ...kb.compliance, content_rules } }, moved: true };
}
