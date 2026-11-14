"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { createAgencyAction, type CreateAgencyState } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyRow } from "@/components/shared/copy-row";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

// Remounted (key) on every opening: useActionState has no reset, and a finished create must not
// show again next time.
function AddAgencyBody({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState<CreateAgencyState, FormData>(createAgencyAction, undefined);
  const created = state?.result;
  if (created) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Agency added</DialogTitle>
          <DialogDescription>
            {created.emailed ? `We emailed ${created.email} a link to sign up.` : `The email wasn't sent. Copy the link and send it to ${created.email}.`}
          </DialogDescription>
        </DialogHeader>
        <CopyRow label="Owner's sign-up link" value={created.link} />
        <DialogFooter><Button onClick={onDone}>Done</Button></DialogFooter>
      </>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Add an agency</DialogTitle>
        <DialogDescription>The owner gets an email to sign up, and can do everything in this agency.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Agency name</Label>
        <Input id="name" name="name" autoFocus />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Owner&apos;s email</Label>
        <Input id="email" name="email" type="email" />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add agency"}</Button>
      </DialogFooter>
    </form>
  );
}

export function AddAgencyDialog() {
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(0);
  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) setOpening((n) => n + 1); }}>
      <DialogTrigger render={<Button><Plus className="size-4" strokeWidth={1.5} />Add an agency</Button>} />
      <DialogContent className="sm:max-w-md">
        <AddAgencyBody key={opening} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
