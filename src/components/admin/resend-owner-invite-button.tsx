"use client";

import { useState } from "react";
import { resendOwnerInviteAction, type OwnerInviteResult } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { LinkSentNotice } from "@/components/shared/link-sent-notice";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// The agencies list's Resend for an owner who hasn't signed up (spec §6.6): a new link, emailed
// and shown to copy (the old link stops working). The result opens in the same "invite sent"
// screen as Add an agency, so the row itself never grows.
export function ResendOwnerInviteButton({ orgId }: { orgId: string }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<OwnerInviteResult | null>(null);
  return (
    <>
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
      <Dialog open={result !== null} onOpenChange={(open) => { if (!open) setResult(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{result?.link ? "Owner invite sent again" : "Couldn't resend"}</DialogTitle>
            <DialogDescription>
              {result?.link ? "The earlier link stops working." : (result?.error ?? "")}
            </DialogDescription>
          </DialogHeader>
          {result?.link && (
            <LinkSentNotice emailed={result.emailed ?? false} email={result.email ?? ""} label="Owner's sign-up link" link={result.link} />
          )}
          <DialogFooter><Button onClick={() => setResult(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
