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
    // Warning tokens rather than raw amber-*: hardcoded palette values don't follow the theme
    // and had no dark-mode answer. text-warning-text is the darkened step — the yellow-500 fill
    // colour measures 1.53:1 on a light surface and would be illegible as body text.
    <div className="flex flex-col gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5">
      {Array.from(reasons).map((reason) => (
        <div key={reason} className="flex items-start gap-1.5">
          <Info className="mt-0.5 size-3 shrink-0 text-warning-text" strokeWidth={1.5} />
          <span className="text-xs leading-snug text-warning-text">{reason}</span>
        </div>
      ))}
    </div>
  );
}
