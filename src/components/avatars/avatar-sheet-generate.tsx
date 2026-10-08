"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { estimateSheetCredits } from "@/lib/avatars/generation";
import { AvatarCreditCost } from "./avatar-credit-cost";
import { AvatarAdvancedSettings } from "./avatar-advanced-settings";
import { AvatarModelSelect } from "./avatar-model-select";

// D339 — makes the four views from the front image: all four, or only the missing ones when the
// sheet is current. The model defaults to Nano Banana 2 and sits under Advanced; the choice lives
// in useAvatarGeneration so it survives leaving the step.
export function AvatarSheetGenerate({
  label, count, generating, disabled, modelId, onModelChange, onGenerate,
}: {
  /** "Generate the four views", "Regenerate the four views", "Make the missing view". */
  label: string;
  /** How many views the click makes, for its cost. */
  count: number;
  generating: boolean;
  disabled: boolean;
  modelId: string;
  onModelChange: (modelId: string) => void;
  onGenerate: (modelId: string) => void;
}) {
  const credits = estimateSheetCredits(modelId, count);
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
