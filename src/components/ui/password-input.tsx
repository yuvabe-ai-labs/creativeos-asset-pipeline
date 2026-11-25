"use client";

import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";

/** A password field with a show/hide eye. The sign-in and invite sign-up forms both use it. */
export function PasswordInput({ id, ...props }: Omit<ComponentProps<typeof InputGroupInput>, "type"> & { id: string }) {
  const [shown, setShown] = useState(false);
  return (
    // InputGroup rather than an absolutely-positioned button: it already owns the focus ring
    // and invalid states for the whole field, so the toggle sits inside the border instead of
    // floating over it. InputGroupButton wraps the shadcn Button, so this stays primitive-only.
    <InputGroup>
      <InputGroupInput id={id} type={shown ? "text" : "password"} {...props} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          onClick={() => setShown((s) => !s)}
          // Inside a form, so it must never submit it; and it is decoration for the field, so it
          // stays out of the tab order between the password and the submit button.
          type="button"
          tabIndex={-1}
          aria-controls={id}
          aria-pressed={shown}
          aria-label={shown ? "Hide password" : "Show password"}
        >
          {shown ? <EyeOff className="size-4" strokeWidth={1.5} /> : <Eye className="size-4" strokeWidth={1.5} />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
