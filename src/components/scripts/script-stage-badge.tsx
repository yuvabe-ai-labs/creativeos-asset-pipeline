import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SCRIPT_STAGE_LABEL, type ScriptStage } from "@/lib/scripts/constants";

// Approved is the one stage that reads as done, so it alone takes the strong treatment.
const TONE: Record<ScriptStage, string> = {
  generate: "",
  visualise: "border-primary/20 bg-primary/5 text-primary",
  in_review: "",
  approved: "border-foreground bg-foreground text-background",
};

export function ScriptStageBadge({ stage }: { stage: ScriptStage }) {
  return (
    <Badge variant={stage === "in_review" ? "secondary" : "default"} className={cn("font-medium", TONE[stage])}>
      {SCRIPT_STAGE_LABEL[stage]}
    </Badge>
  );
}
