"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { enterImpersonationAction } from "@/lib/actions/impersonation";

export function EnterImpersonationButton({ orgId }: { orgId: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() => startTransition(() => enterImpersonationAction(orgId))}
    >
      Enter as this org
    </Button>
  );
}
