"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import { AvatarCreditCost } from "@/components/avatars/avatar-credit-cost";
import { estimateSheetCredits } from "@/lib/avatars/generation";
import { missingViews } from "@/lib/avatars/utils";
import type { Avatar } from "@/lib/avatars/schema";
import { estimateMakeCredits, nextMakerStep } from "@/lib/scripts/visualise/maker";

// Spec §5.2 — AI-generated: made from the person's description, with avatar instructions and
// Regenerate avatar. A generated face that belongs to the library changes in every script.
export function CastSlotAiMaker({ avatar, modelId, busy, onMake }: {
  /** The linked avatar when its face is generated (or it has none yet); otherwise null. */
  avatar: Avatar | null;
  /** The image model chosen under Advanced, for the cost. */
  modelId: string;
  busy: boolean;
  onMake: (instructions: string, fresh: boolean) => void;
}) {
  const [instructions, setInstructions] = useState("");
  const id = useId();
  const next = nextMakerStep(avatar);
  const hasFace = Boolean(avatar?.front);
  const viewCount = avatar ? missingViews(avatar).length : 4;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="sr-only">Avatar instructions</Label>
      <InputGroup>
        <InputGroupInput
          id={id}
          value={instructions}
          maxLength={300}
          disabled={busy}
          className="text-sm"
          placeholder="Instructions, e.g. greyer at the temples"
          onChange={(e) => setInstructions(e.target.value)}
        />
      </InputGroup>
      <div className="flex flex-col gap-2">
        {!hasFace ? (
          <Button className="w-full" disabled={busy} onClick={() => onMake(instructions, false)}>
            Make avatar <AvatarCreditCost credits={estimateMakeCredits(modelId)} />
          </Button>
        ) : (
          <>
            {next === "views" && (
              <Button className="w-full" disabled={busy} onClick={() => onMake("", false)}>
                Make the four views <AvatarCreditCost credits={estimateSheetCredits(modelId, viewCount)} />
              </Button>
            )}
            {next === "save" && <Button className="w-full" disabled={busy} onClick={() => onMake("", false)}>Save to Avatars</Button>}
            {/* The CTA is the card's next step; once saved, that is Regenerate. */}
            <Button className="w-full" variant={next ? "outline" : "default"} disabled={busy} onClick={() => onMake(instructions, true)}>
              Regenerate avatar <AvatarCreditCost credits={estimateMakeCredits(modelId)} />
            </Button>
          </>
        )}
      </div>
      {hasFace && avatar?.status === "ready" && (
        <p className="text-xs text-muted-foreground">Regenerating changes this avatar in every script that uses it.</p>
      )}
    </div>
  );
}
