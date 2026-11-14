"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { InviteDialogAddStep } from "./invite-dialog-add-step";
import { InviteDialogEmailStep } from "./invite-dialog-email-step";

// Spec §6.2: Invite opens a popup, the same one for the owner, Invite holders and Admin. Step 1
// adds people already in the agency; "Invite someone new" opens step 2. Each opening starts at
// step 1 (the body remounts on its key). canManage only picks who step 2 says sets permissions.
export function InviteDialog({ orgId, client, canManage }: {
  orgId: string;
  client: { id: string; name: string };
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"add" | "email">("add");
  const [opening, setOpening] = useState(0);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setStep("add");
      setOpening((n) => n + 1);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button><UserPlus className="size-4" strokeWidth={1.5} />Invite</Button>} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add people to {client.name}</DialogTitle>
          <DialogDescription>People you add see this client with the permissions they have on the Team page.</DialogDescription>
        </DialogHeader>
        {step === "add" ? (
          <InviteDialogAddStep key={opening} orgId={orgId} client={client} onInviteNew={() => setStep("email")} onDone={() => setOpen(false)} />
        ) : (
          <InviteDialogEmailStep key={`email-${opening}`} orgId={orgId} client={client} canManage={canManage} onBack={() => setStep("add")} />
        )}
      </DialogContent>
    </Dialog>
  );
}
