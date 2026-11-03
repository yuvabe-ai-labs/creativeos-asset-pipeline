"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AvatarOption, Suggestion } from "@/lib/scripts/copilot/suggestions";
import { CopilotAvatarPickDialog } from "./copilot-avatar-pick-dialog";

const CHIP = "h-auto max-w-full whitespace-normal rounded-full border-dashed border-primary/40 py-1 text-left text-primary hover:bg-primary/5";

/** One-tap suggestions under the copilot's newest message: send at once, fill the box to finish by
 *  hand, or open the avatars to choose from (D474). */
export function CopilotSuggestions({ suggestions, onSend, onFill, onLink }: {
  suggestions: Suggestion[];
  onSend: (text: string, leadAvatarId?: string) => void;
  onFill: (text: string) => void;
  onLink: (castId: string, avatarId: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  if (suggestions.length === 0) return null;
  const pick = suggestions.find((s) => s.pick)?.pick;
  const choose = (option: AvatarOption) => {
    if (pick?.castId) onLink(pick.castId, option.id);
    else onSend(option.name, option.id);
  };
  return (
    <div aria-label="Suggestions" className="-mt-1 flex flex-wrap gap-1.5 px-4 pb-4">
      {suggestions.map((s) => (
        <Button
          key={s.label}
          variant="outline"
          size="xs"
          className={CHIP}
          onClick={() => (s.pick ? setPicking(true) : s.send ? onSend(s.text) : onFill(s.text))}
        >
          {s.pick && <UserRound strokeWidth={1.5} />}
          {s.label}
        </Button>
      ))}
      {pick && <CopilotAvatarPickDialog pick={pick} open={picking} onOpenChange={setPicking} onChoose={choose} />}
    </div>
  );
}
