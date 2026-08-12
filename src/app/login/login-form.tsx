"use client";

import { useActionState } from "react";
import { ArrowRight } from "lucide-react";
import { loginAction, type AuthActionState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [state, action, pending] = useActionState<AuthActionState, FormData>(
    loginAction,
    undefined,
  );
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
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
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
