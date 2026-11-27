"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { loginAction, type AuthActionState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

export function LoginForm() {
  const [state, action, pending] = useActionState<AuthActionState, FormData>(
    loginAction,
    undefined,
  );
  // Only so "Forgot password?" can carry the email typed so far to the next page.
  const [email, setEmail] = useState("");
  const forgotHref = email.trim() ? `/login/forgot?email=${encodeURIComponent(email.trim())}` : "/login/forgot";
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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="password">Password</Label>
          <Link
            href={forgotHref}
            className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <PasswordInput id="password" name="password" autoComplete="current-password" required />
      </div>
      {/* Base UI's Checkbox renders a span plus its own hidden input, so it posts with
          the form exactly like a native one — no native control needed. Defaulted on:
          every session was persistent before this existed, so leaving it unticked by
          default would silently shorten sessions for people who never asked. */}
      <div className="mt-1 flex items-center gap-2.5">
        <Checkbox id="remember" name="remember" defaultChecked />
        <Label htmlFor="remember" className="cursor-pointer font-normal">
          Keep me signed in
        </Label>
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="mt-2 w-full">
        {pending ? "Signing in…" : "Sign in"}
        {!pending && <ArrowRight className="size-4" strokeWidth={1.5} />}
      </Button>
    </form>
  );
}
