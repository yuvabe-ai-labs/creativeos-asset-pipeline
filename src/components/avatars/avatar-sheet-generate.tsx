"use client";

import { Button } from "@/components/ui/button";
import { AVATAR_SHEET_ASPECT } from "@/lib/avatars/constants";
import { estimateAvatarImageCredits } from "@/lib/avatars/generation";
import { AvatarCreditCost } from "./avatar-credit-cost";
import { AvatarModelSelect } from "./avatar-model-select";

// Generates the profile sheet from the front image (D288). The model is the operator's choice;
// the choice is lifted into useAvatarGeneration (spec §4.1 review) so it survives leaving and
// returning to this step, not local state that would reset to the default every time.
export function AvatarSheetGenerate({
  hasSheet, generating, disabled, modelId, onModelChange, onGenerate,
}: {
  hasSheet: boolean;
  generating: boolean;
  disabled: boolean;
  modelId: string;
  onModelChange: (modelId: string) => void;
  onGenerate: (modelId: string) => void;
}) {
  const credits = estimateAvatarImageCredits({ modelId, aspect: AVATAR_SHEET_ASPECT, referenceCount: 1 });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <AvatarModelSelect id="avatar-sheet-model" value={modelId} onChange={onModelChange} />
      <Button
        variant={hasSheet ? "outline" : "default"}
        disabled={disabled || generating || credits === null}
        onClick={() => onGenerate(modelId)}
      >
        {generating ? "Generating…" : hasSheet ? "Regenerate from the front image" : "Generate from the front image"}
        <AvatarCreditCost credits={credits} />
      </Button>
    </div>
  );
}
