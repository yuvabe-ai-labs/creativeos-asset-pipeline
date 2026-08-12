"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { loginAction, type AuthActionState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [state, action, pending] = useActionState<AuthActionState, FormData>(
    loginAction,
    undefined,
  );
  const [showPassword, setShowPassword] = useState(false);
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
        {/* InputGroup rather than an absolutely-positioned button: it already owns the
            focus ring and invalid states for the whole field, so the toggle sits inside
            the border instead of floating over it. InputGroupButton wraps the shadcn
            Button, so this stays primitive-only. */}
        <InputGroup>
          <InputGroupInput
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              onClick={() => setShowPassword((shown) => !shown)}
              // The button is inside the form, so it must never submit it — and it is
              // decoration for the field, so it stays out of the tab order between the
              // password and the submit button.
              type="button"
              tabIndex={-1}
              aria-controls="password"
              aria-pressed={showPassword}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="size-4" strokeWidth={1.5} />
              ) : (
                <Eye className="size-4" strokeWidth={1.5} />
              )}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
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
