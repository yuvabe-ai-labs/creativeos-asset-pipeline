"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordResetAction, type ForgotPasswordState } from "@/lib/actions/password-reset";
import { RESET_LINK_SENT } from "@/lib/auth/password-reset-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<ForgotPasswordState, FormData>(
    requestPasswordResetAction,
    undefined,
  );

  if (state?.sent) {
    return (
      <div className="flex flex-col gap-6">
        <p role="status" className="text-sm">{RESET_LINK_SENT}</p>
        <Button variant="outline" nativeButton={false} render={<Link href="/login">Back to sign in</Link>} />
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          defaultValue={state?.email ?? email}
          autoFocus
          required
        />
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="mt-2 w-full">
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      <Link
        href="/login"
        className="self-center text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
      >
        Back to sign in
      </Link>
    </form>
  );
}
