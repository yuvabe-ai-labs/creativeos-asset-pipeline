"use client";

import { useState } from "react";
import { resendOwnerInviteAction, type OwnerInviteResult } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { CopyRow } from "@/components/shared/copy-row";

// The agencies list's Resend for an owner who hasn't signed up (spec §6.6): a new link, emailed
// and shown to copy (the old link stops working).
export function ResendOwnerInviteButton({ orgId }: { orgId: string }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<OwnerInviteResult | null>(null);
  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          try {
            setResult(await resendOwnerInviteAction(orgId));
          } catch {
            setResult({ error: "Could not send the invite." });
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "Sending…" : "Resend"}
      </Button>
      {result?.error && <p className="text-xs text-destructive">{result.error}</p>}
      {result?.link && (
        <div className="w-72">
          <CopyRow label={result.emailed ? "Sent again" : "Email not sent. Copy the link"} value={result.link} />
        </div>
      )}
    </div>
  );
}
