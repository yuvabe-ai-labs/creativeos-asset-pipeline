"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
import { useIdentity } from "@/hooks/use-identity";
import { IdentityDialog } from "./identity-dialog";

// Shows the current identity; click to switch (e.g. a senior at the intern's machine).
export function IdentityChip() {
  const { identity, setIdentity } = useIdentity();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <UserRound className="size-3.5" strokeWidth={1.5} />
        {identity
          ? `${identity.name} · ${identity.role === "senior" ? "Senior" : "Designer"}`
          : "Set who you are"}
      </button>
      <IdentityDialog
        open={open}
        initial={identity}
        dismissable
        onOpenChange={setOpen}
        onSubmit={(id) => {
          setIdentity(id);
          setOpen(false);
        }}
      />
    </>
  );
}
