"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AVATAR_DEFAULT_SHEET_MODEL_ID, AVATAR_SHEET_ASPECT } from "@/lib/avatars/constants";
import { estimateAvatarImageCredits } from "@/lib/avatars/generation";
import { AvatarCreditCost } from "./avatar-credit-cost";
import { AvatarModelSelect } from "./avatar-model-select";

// Generates the profile sheet from the front image (D288). The model is the operator's choice;
// the default is the one the handoff design uses for model sheets.
export function AvatarSheetGenerate({
  hasSheet, generating, disabled, onGenerate,
}: {
  hasSheet: boolean;
  generating: boolean;
  disabled: boolean;
  onGenerate: (modelId: string) => void;
}) {
  const [modelId, setModelId] = useState(AVATAR_DEFAULT_SHEET_MODEL_ID);
  const credits = estimateAvatarImageCredits({ modelId, aspect: AVATAR_SHEET_ASPECT, referenceCount: 1 });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <AvatarModelSelect id="avatar-sheet-model" value={modelId} onChange={setModelId} />
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
