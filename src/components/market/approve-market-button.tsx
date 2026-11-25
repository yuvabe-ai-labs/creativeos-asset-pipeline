"use client";

import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useApproveMarket } from "@/hooks/queries/clients";

/** A person approves the client's market research, which opens new scripts (copilot journey spec
 *  §5.2). Once approved it is a plain line: there is nothing left to press. */
export function ApproveMarketButton({ clientId, approved }: { clientId: string; approved: boolean }) {
  const approve = useApproveMarket(clientId);

  if (approved) {
    return (
      <p className="flex shrink-0 items-center gap-2 text-sm font-medium text-success-text">
        <Check className="size-4" strokeWidth={1.5} aria-hidden />
        Market research approved
      </p>
    );
  }

  return (
    <Button
      className="shrink-0"
      disabled={approve.isPending}
      onClick={() => approve.mutate(undefined, { onError: (e) => toast.error(e.message) })}
    >
      {approve.isPending && <Loader2 className="animate-spin" strokeWidth={1.5} />}
      Approve market research
    </Button>
  );
}
