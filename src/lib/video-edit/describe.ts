import { readVideoEdit, videoEditLimitsFor } from "./record";
import { instructionForDisplay } from "./prompt";

// D483 — an edited version's provenance for History, as describeVoiceChange does for D284.
export function describeVideoEdit(
  inputsUsed: Record<string, unknown> | undefined,
  labelById: Map<string, string>,
): { title: string; detail: string } | null {
  const ve = readVideoEdit(inputsUsed?.videoEdit);
  if (!ve) return null;
  const refs = ve.referenceUrls.length;
  return {
    title: `Edit: ${instructionForDisplay(ve.instruction)}`,
    detail: [
      `edited from ${labelById.get(ve.baseVersionId) ?? "an earlier version"}`,
      // Edits from before the model choice (D484) carry none.
      ...(ve.modelId ? [videoEditLimitsFor(ve.modelId).label] : []),
      `${refs} ${refs === 1 ? "reference" : "references"}`,
      ve.resolution,
    ].join(" · "),
  };
}
