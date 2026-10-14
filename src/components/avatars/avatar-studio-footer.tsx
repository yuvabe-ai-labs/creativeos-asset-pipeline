"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type Action = { label: string; onClick: () => void; disabled?: boolean };

type Props = {
  back: Action | null;
  /** The one primary action. `forward` marks a Continue, which carries the arrow. */
  primary: Action & { forward?: boolean };
  /** Why the primary action is not available yet, said beside it. */
  reason?: string | null;
};

// D297 — the panel's footer, pinned to its bottom: Back, and exactly one primary action. On an
// optional step, Continue is also how the step is skipped, so there is no separate Skip button.
export function AvatarStudioFooter({ back, primary, reason }: Props) {
  return (
    <div className="sticky bottom-0 flex flex-wrap items-center gap-2 rounded-b-xl border-t bg-card px-4 py-3">
      {back && (
        <Button variant="ghost" onClick={back.onClick}>
          <ChevronLeft className="size-4" strokeWidth={1.5} />
          {back.label}
        </Button>
      )}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
        {reason && <span className="text-xs text-muted-foreground">{reason}</span>}
        <Button onClick={primary.onClick} disabled={primary.disabled}>
          {primary.label}
          {primary.forward && <ChevronRight className="size-4" strokeWidth={1.5} />}
        </Button>
      </div>
    </div>
  );
}
