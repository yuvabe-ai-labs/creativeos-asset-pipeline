"use client";

import { useIdentity } from "@/hooks/use-identity";
import { needsIdentityGate } from "./gate-logic";
import { IdentityDialog } from "./identity-dialog";

// Renders children, but overlays a blocking "who are you?" dialog until an identity is set.
// One-time per browser (persisted); switching later is via IdentityChip.
export function IdentityGate({ children }: { children: React.ReactNode }) {
  const { identity, setIdentity } = useIdentity();
  return (
    <>
      {children}
      <IdentityDialog
        open={needsIdentityGate(identity)}
        dismissable={false}
        onSubmit={setIdentity}
      />
    </>
  );
}
