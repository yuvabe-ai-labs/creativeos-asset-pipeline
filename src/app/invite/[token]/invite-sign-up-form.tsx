"use client";

import { useActionState } from "react";
import { acceptInviteAction, type AcceptInviteState } from "@/lib/actions/invites";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

export function InviteSignUpForm({ token, email, agency }: { token: string; email: string; agency: string }) {
  const [state, action, pending] = useActionState<AcceptInviteState, FormData>(acceptInviteAction.bind(null, token), undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={email} disabled readOnly />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Your name</Label>
        <Input id="name" name="name" autoComplete="name" autoFocus />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <PasswordInput id="password" name="password" autoComplete="new-password" />
      </div>
      {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Creating your account…" : "Create account"}</Button>
      <p className="text-xs text-muted-foreground">You&apos;re joining {agency}.</p>
    </form>
  );
}
