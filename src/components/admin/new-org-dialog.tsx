"use client";

import { useActionState, useState } from "react";
import { Check, Copy } from "lucide-react";
import { createOrgAction, type CreateOrgState } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type CreditMode = "unlimited" | "set";

// One credential row: label, monospaced value, and a copy icon that flashes a checkmark for
// 2s on click — same pattern as file-llm-prompt-panel.tsx's copy button, so credentials can
// be shared without the fiddly drag-select-copy over a border-boxed field.
function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
      <div className="flex min-w-0 flex-col">
        <span className="text-eyebrow text-muted-foreground/80">{label}</span>
        <span className="truncate font-mono text-sm">{value}</span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={handleCopy}
        aria-label={`Copy ${label.toLowerCase()}`}
        className="shrink-0"
      >
        {copied ? (
          <Check className="size-3.5 text-primary" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </Button>
    </div>
  );
}

// Holds the actual useActionState — deliberately remounted (via NewOrgDialog's `key`) every
// time the dialog re-opens. useActionState has no manual reset: without remounting, closing
// the dialog after a successful create and reopening it would show the SAME stale "Agency
// created" result again instead of a fresh form, since `state` outlives the dialog's own
// open/closed visibility.
function NewOrgDialogBody({ onDone }: { onDone: () => void }) {
  const [creditMode, setCreditMode] = useState<CreditMode>("unlimited");
  const [creditDraft, setCreditDraft] = useState("");
  const [state, action, pending] = useActionState<CreateOrgState, FormData>(
    createOrgAction,
    undefined,
  );
  const created = state?.result;

  if (created) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Agency created</DialogTitle>
          <DialogDescription>
            Share these credentials with the agency out-of-band (Slack, email). Shown
            once — this dialog will not show the password again.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <CopyRow label="Email" value={created.email} />
          <CopyRow label="Temp password" value={created.tempPassword} />
        </div>
        <DialogFooter>
          <Button onClick={onDone}>Done</Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>New agency</DialogTitle>
        <DialogDescription>
          Creates the agency and its owner account in one step.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Agency name</Label>
        <Input id="name" name="name" autoFocus />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Owner email</Label>
        <Input id="email" name="email" type="email" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="displayName">Owner name</Label>
        <Input id="displayName" name="displayName" />
      </div>

      {/* Same Unlimited/Set-limit segmented toggle as the org detail page's
          CreditLimitEditor (src/app/admin/orgs/[id]/credit-limit-editor.tsx) — one
          unambiguous default, an input only appears once "Set limit" is chosen. */}
      <div className="flex flex-col gap-1.5">
        <Label>Monthly credit limit</Label>
        <div className="inline-flex w-fit gap-1 rounded-lg border border-border bg-muted/40 p-1">
          <Button
            type="button"
            size="sm"
            variant={creditMode === "unlimited" ? "default" : "ghost"}
            onClick={() => {
              setCreditMode("unlimited");
              setCreditDraft("");
            }}
          >
            Unlimited
          </Button>
          <Button
            type="button"
            size="sm"
            variant={creditMode === "set" ? "default" : "ghost"}
            onClick={() => setCreditMode("set")}
          >
            Set limit
          </Button>
        </div>
        {creditMode === "set" && (
          <Input
            autoFocus
            value={creditDraft}
            onChange={(e) => setCreditDraft(e.target.value)}
            placeholder="e.g. 500"
            className="max-w-40"
          />
        )}
        <Input type="hidden" name="creditLimit" value={creditMode === "unlimited" ? "" : creditDraft} />
      </div>

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create agency"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function NewOrgDialog() {
  const [open, setOpen] = useState(false);
  // Bumped on every close — forces NewOrgDialogBody (and its useActionState) to remount,
  // so the next open always starts from a blank form instead of a stale result.
  const [instanceKey, setInstanceKey] = useState(0);

  function handleOpenChange(o: boolean) {
    setOpen(o);
    if (!o) setInstanceKey((k) => k + 1);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button>+ New agency</Button>} />
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <NewOrgDialogBody key={instanceKey} onDone={() => handleOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
