"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { estimateSheetCredits } from "@/lib/avatars/generation";
import { AvatarCreditCost } from "./avatar-credit-cost";
import { AvatarAdvancedSettings } from "./avatar-advanced-settings";
import { AvatarModelSelect } from "./avatar-model-select";

// D395 — makes the turnaround sheet from the front image, and the four views cut from it. The
// model defaults to Nano Banana 2.1 (D425) and sits under Advanced; the choice lives in useAvatarGeneration
// so it survives leaving the step.
export function AvatarSheetGenerate({
  label, generating, disabled, modelId, onModelChange, onGenerate,
}: {
  /** "Generate the four views" or "Regenerate the four views". */
  label: string;
  generating: boolean;
  disabled: boolean;
  modelId: string;
  onModelChange: (modelId: string) => void;
  onGenerate: (modelId: string) => void;
}) {
  const credits = estimateSheetCredits(modelId);
  return (
    <div className="flex flex-col items-start gap-1">
      <Button disabled={disabled || generating || credits === null} onClick={() => onGenerate(modelId)}>
        {generating ? "Generating…" : label}
        <AvatarCreditCost credits={credits} />
      </Button>
      <AvatarAdvancedSettings className="w-full max-w-sm">
        <Label htmlFor="avatar-sheet-model" className="text-xs text-muted-foreground">Image model</Label>
        <AvatarModelSelect id="avatar-sheet-model" value={modelId} onChange={onModelChange} />
      </AvatarAdvancedSettings>
    </div>
  );
}
