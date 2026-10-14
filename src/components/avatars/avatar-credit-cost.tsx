import { Sparkles } from "lucide-react";

// The credit cost shown on a generate control — the same number the route will reserve.
// Renders nothing when there is no priced estimate for the model.
export function AvatarCreditCost({ credits }: { credits: number | null }) {
  if (credits === null) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-normal opacity-85 tabular-nums">
      <Sparkles className="size-3" strokeWidth={1.5} />
      {credits.toLocaleString()}
    </span>
  );
}
