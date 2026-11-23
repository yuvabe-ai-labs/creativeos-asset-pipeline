"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { logoutAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

// Spec §6.3: the header (with its sign-out) is hidden on /invite, so someone signed in as another
// email signs out here. As in profile-popover.tsx, the query cache is cleared and the page fully
// reloaded so nothing from the old account survives; reloading keeps them on this invite link,
// which then shows the sign-up form.
export function InviteSignOutButton() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    queryClient.clear();
    try {
      await logoutAction();
      window.location.reload();
    } catch {
      setPending(false);
    }
  }

  return (
    <Button onClick={signOut} disabled={pending}>
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
