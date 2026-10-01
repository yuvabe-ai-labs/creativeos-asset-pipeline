"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AVATAR_SHEET_ASPECT } from "@/lib/avatars/constants";
import { estimateAvatarImageCredits } from "@/lib/avatars/generation";
import { AvatarCreditCost } from "./avatar-credit-cost";
import { AvatarAdvancedSettings } from "./avatar-advanced-settings";
import { AvatarModelSelect } from "./avatar-model-select";

// Generates the profile sheet from the front image (D288). The model defaults to Nano Banana 2 and
// sits under Advanced. A changed choice is lifted into useAvatarGeneration (spec §4.1 review), so
// it survives leaving and returning to this step rather than resetting to the default.
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
    <div className="flex flex-col items-start gap-1">
      <Button
        variant={hasSheet ? "outline" : "default"}
        disabled={disabled || generating || credits === null}
        onClick={() => onGenerate(modelId)}
      >
        {generating ? "Generating…" : hasSheet ? "Regenerate from the front image" : "Generate from the front image"}
        <AvatarCreditCost credits={credits} />
      </Button>
      <AvatarAdvancedSettings className="w-full max-w-sm">
        <Label htmlFor="avatar-sheet-model" className="text-xs text-muted-foreground">Image model</Label>
        <AvatarModelSelect id="avatar-sheet-model" value={modelId} onChange={onModelChange} />
      </AvatarAdvancedSettings>
    </div>
  );
}
