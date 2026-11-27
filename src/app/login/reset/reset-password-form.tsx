"use client";

import { useActionState } from "react";
import { resetPasswordAction, type ResetPasswordState } from "@/lib/actions/password-reset";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { LinkExpired } from "./link-expired";

export function ResetPasswordForm({ tokenHash }: { tokenHash: string }) {
  const [state, action, pending] = useActionState<ResetPasswordState, FormData>(
    resetPasswordAction.bind(null, tokenHash),
    undefined,
  );

  if (state?.expired) return <LinkExpired />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Set a new password</h1>
        <p className="text-sm text-muted-foreground">Choose a password with at least 8 characters.</p>
      </div>
      <form action={action} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">New password</Label>
          <PasswordInput id="password" name="password" autoComplete="new-password" autoFocus required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" required />
        </div>
        {state?.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="mt-2 w-full">
          {pending ? "Saving…" : "Set password"}
        </Button>
      </form>
    </div>
  );
}
