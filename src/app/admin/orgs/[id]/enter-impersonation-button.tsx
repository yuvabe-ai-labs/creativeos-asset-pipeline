"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { Button } from "@/components/ui/button";
import { enterImpersonationAction } from "@/lib/actions/impersonation";

export function EnterImpersonationButton({ orgId }: { orgId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              await enterImpersonationAction(orgId);
            } catch (e) {
              // enterImpersonationAction redirects on success, which Next.js implements by
              // rejecting this promise with an internal control-flow error — rethrow it
              // unexamined so the framework's redirect handling still runs; only a genuine
              // thrown error (e.g. "Organization not found") should reach setError below.
              unstable_rethrow(e);
              setError(e instanceof Error ? e.message : "Failed to enter impersonation.");
            }
          })
        }
      >
        Enter as this org
      </Button>
      {error && <span className="text-destructive">{error}</span>}
    </div>
  );
}
