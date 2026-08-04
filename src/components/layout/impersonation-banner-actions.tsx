"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  enterElevatedModeAction,
  exitImpersonationAction,
} from "@/lib/actions/impersonation";

export function ImpersonationBannerActions({
  orgId,
  elevated,
}: {
  orgId: string;
  elevated: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {elevated ? (
        <Badge variant="destructive">Elevated</Badge>
      ) : (
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              try {
                await enterElevatedModeAction();
              } catch {
                setError("Failed to enter elevated mode.");
              }
            })
          }
        >
          Enter elevated mode
        </Button>
      )}
      <Button
        type="button"
        size="xs"
        variant="ghost"
        disabled={isPending}
        onClick={() => startTransition(() => exitImpersonationAction(orgId))}
      >
        Exit
      </Button>
      {error && <span className="text-destructive">{error}</span>}
    </div>
  );
}
