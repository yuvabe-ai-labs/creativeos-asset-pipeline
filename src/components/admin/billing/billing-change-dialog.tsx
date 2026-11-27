"use client";

import { useState, type ReactElement, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { BillingActionResult } from "@/lib/actions/billing-admin";

type Submit = (reason: string) => Promise<BillingActionResult>;

// Every billing change in Admin: its own fields, then a reason for the billing log (shown unless
// `askReason` is false, e.g. adding a new plan), then Save. The body remounts on each opening so a finished change never shows
// again, as in the Add an agency popup.
export function BillingChangeDialog({
  trigger,
  title,
  description,
  saveLabel,
  children,
  askReason = true,
  onOpen,
  onSubmit,
}: {
  trigger: ReactElement;
  title: string;
  description?: ReactNode;
  saveLabel: string;
  /** The change's own fields. */
  children?: ReactNode;
  /** False hides the reason field (nothing changes that needs explaining). */
  askReason?: boolean;
  /** Clears the change's own fields on each opening (their state lives with the caller). */
  onOpen?: () => void;
  onSubmit: Submit;
}) {
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(0);
  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) { setOpening((n) => n + 1); onOpen?.(); } }}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <ChangeBody key={opening} title={title} description={description} saveLabel={saveLabel} askReason={askReason} onSubmit={onSubmit} onDone={() => setOpen(false)}>
          {children}
        </ChangeBody>
      </DialogContent>
    </Dialog>
  );
}

function ChangeBody({
  title,
  description,
  saveLabel,
  children,
  askReason,
  onSubmit,
  onDone,
}: {
  title: string;
  description?: ReactNode;
  saveLabel: string;
  children?: ReactNode;
  askReason: boolean;
  onSubmit: Submit;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const result = await onSubmit(reason);
    setSaving(false);
    if (result.error) setError(result.error);
    else onDone();
  }

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      {children}
      {askReason && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="billing-reason">Reason</Label>
          <Textarea id="billing-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Shown in the billing log" rows={2} />
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : saveLabel}</Button>
      </DialogFooter>
    </div>
  );
}
