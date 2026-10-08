// src/components/script-review/team/scope-options.tsx
"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SHARE_SCOPES, SHARE_SCOPE_LABEL, type ShareScope } from "@/lib/script-review/constants";

const HINT: Record<ShareScope, string> = {
  script: "For comments on the words.",
  avatars: "For comments. Adds each cast member's avatar and voice.",
  panels: "The full reel, with each shot's picked panel. The client can approve it.",
};

/** Spec 4 §3 step 2: what the share includes. Pressed buttons, as the library's stage filter. */
export function ScopeOptions({ value, onChange }: { value: ShareScope; onChange: (scope: ShareScope) => void }) {
  return (
    <div role="group" aria-label="What the share includes" className="flex flex-col gap-2">
      {SHARE_SCOPES.map((scope) => (
        <Button
          key={scope}
          variant="outline"
          aria-pressed={value === scope}
          onClick={() => onChange(scope)}
          className={cn(
            "h-auto flex-col items-start gap-0.5 whitespace-normal px-3 py-2.5 text-left",
            value === scope && "border-primary bg-primary/5",
          )}
        >
          <span className="font-medium">{SHARE_SCOPE_LABEL[scope]}</span>
          <span className="text-xs font-normal text-muted-foreground">{HINT[scope]}</span>
        </Button>
      ))}
    </div>
  );
}
