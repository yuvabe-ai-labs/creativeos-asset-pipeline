"use client";

import type { ReactNode } from "react";
import type { TargetState } from "@/hooks/use-follow-copilot";
import { cn } from "@/lib/utils";

/** Something on a page the copilot can work on (D520). Tagged with its target id, so the page can be
 *  brought to it; swept while it is being changed, and highlighted when the change lands. Only a
 *  change marks it: a field the copilot is just asking about looks as it always does (D528). Purple
 *  only at low opacity: the loud brand shimmer belongs to the copilot's own working line. */
export function CopilotTarget({ id, state, className, children }: {
  id: string; state: TargetState; className?: string; children: ReactNode;
}) {
  return (
    <div data-copilot-target={id} className={cn("relative rounded-xl", className)}>
      {/* Re-mounted once per change, so a half-typed edit of this target gives way to the copilot's
          stored change (spec §3.2). Its key and the highlight's carry the same count, so each is
          prefixed: siblings sharing a key make React duplicate the content. */}
      <div key={`content-${state.version}`}>{children}</div>
      {state.writing && (
        <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
          <span className="animate-target-sweep absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent" />
        </span>
      )}
      {state.landed !== null && (
        <span key={`landed-${state.landed}`} aria-hidden className="animate-target-land pointer-events-none absolute inset-0 rounded-xl bg-primary/10" />
      )}
    </div>
  );
}
