"use client";

import { useActionState } from "react";
import { createOrgAction, type CreateOrgState } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export function NewOrgForm() {
  const [state, action, pending] = useActionState<CreateOrgState, FormData>(
    createOrgAction,
    undefined,
  );

  if (state?.result) {
    return (
      <Card className="p-6 shadow-card">
        <h2 className="font-medium">Agency created</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Share these credentials with the agency out-of-band (Slack, email). Shown once —
          this page will not show the password again.
        </p>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="font-mono">{state.result.email}</dd>
          <dt className="text-muted-foreground">Temp password</dt>
          <dd className="font-mono">{state.result.tempPassword}</dd>
        </dl>
      </Card>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field name="name" label="Agency name" />
      <Field name="email" label="Owner email" type="email" />
      <Field name="displayName" label="Owner display name" />
      <Field name="creditLimit" label="Monthly credit limit (blank = unlimited)" />
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Creating…" : "Create agency"}
      </Button>
    </form>
  );
}

function Field({
  name,
  label,
  type = "text",
}: {
  name: string;
  label: string;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} />
    </div>
  );
}
