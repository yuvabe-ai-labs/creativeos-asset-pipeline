import { Info } from "lucide-react";
import type { EvaluatedConstraints } from "@/lib/video-gen/types";

type Props = {
  constraints: EvaluatedConstraints;
};

export function ActiveRulesCard({ constraints }: Props) {
  // Collect all active reason strings, deduplicating identical messages
  const reasons = new Set<string>();

  if (constraints.disableFrameInputsReason) {
    reasons.add(constraints.disableFrameInputsReason);
  }
  if (constraints.disableRefsReason) {
    reasons.add(constraints.disableRefsReason);
  }
  if (constraints.disableGenerateReason) {
    reasons.add(constraints.disableGenerateReason);
  }
  for (const reason of Object.values(constraints.lockedParamReasons)) {
    reasons.add(reason);
  }

  if (reasons.size === 0) return null;

  return (
    <div className="border border-amber-300 bg-amber-50 rounded-md px-3 py-2.5 flex flex-col gap-1.5">
      {Array.from(reasons).map((reason) => (
        <div key={reason} className="flex items-start gap-1.5">
          <Info className="size-3 shrink-0 mt-0.5 text-amber-600" strokeWidth={1.5} />
          <span className="text-xs text-amber-800 leading-snug">{reason}</span>
        </div>
      ))}
    </div>
  );
}
