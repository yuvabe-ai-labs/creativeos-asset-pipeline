"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AvatarCreditCost } from "@/components/avatars/avatar-credit-cost";
import { PANEL_PROMPT_MAX } from "@/lib/scripts/visualise/constants";

type Props = {
  /** The exact prompt the picked take was drawn with, or the built one before any take. */
  prompt: string;
  /** The prompt the script builds today: what Reset goes back to. */
  builtPrompt: string;
  credits: number | null;
  busy: boolean;
  onRegenerate: (prompt: string) => void;
  onReset: () => void;
};

// D344 — hidden by default. For how the frame is drawn ("closer on her hands"); a change to what
// happens belongs in the shot's visual line, through Reopen.
export function PanelPromptBox({ prompt, builtPrompt, credits, busy, onRegenerate, onReset }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(prompt);
  const id = useId();
  // A new take brings a new prompt: start the draft from it (adjusting state while rendering, as
  // react.dev advises, rather than in an effect).
  const [shown, setShown] = useState(prompt);
  if (shown !== prompt) {
    setShown(prompt);
    setDraft(prompt);
  }
  const empty = draft.trim().length === 0;

  return (
    <div className="flex flex-col gap-2">
      <Button variant="ghost" size="sm" className="self-start" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ChevronDown className={open ? "size-4 rotate-180" : "size-4"} strokeWidth={1.5} />
        {open ? "Hide the prompt" : "Show the prompt"}
      </Button>
      {open && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={id} className="text-xs text-muted-foreground">The exact prompt sent to draw this frame</Label>
          <Textarea id={id} value={draft} maxLength={PANEL_PROMPT_MAX} rows={10} onChange={(e) => setDraft(e.target.value)} className="font-sans text-xs" />
          <p className="text-xs text-muted-foreground">
            For how the frame is drawn. A change to what happens belongs in the shot, through Reopen.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy || empty} onClick={() => onRegenerate(draft)}>
              Regenerate with this prompt <AvatarCreditCost credits={credits} />
            </Button>
            {(draft.trim() !== builtPrompt || prompt !== builtPrompt) && (
              <Button size="sm" variant="outline" disabled={busy} onClick={onReset}>
                Reset to the script&apos;s prompt <AvatarCreditCost credits={credits} />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
