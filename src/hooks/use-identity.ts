"use client";

import { useMemo } from "react";
import { useMe } from "@/hooks/queries/me";
import type { Identity } from "@/lib/identity";
import type { PlatformRole } from "@/lib/dal-logic";

// The signed-in person, read from the one /api/me query. Kept as a hook so its consumers don't
// change. `hydrated` is false until something is known (a seeded payload, a fetch result or a
// failed fetch); until then the nulls mean "not checked yet". What the person may do is useCan().
export function useIdentity(): {
  identity: Identity | null;
  hydrated: boolean;
  platformRole: PlatformRole | null;
  orgId: string | null;
  orgName: string | null;
  isOwner: boolean | null;
  creditsUsed: number | null;
  monthlyCreditLimit: number | null;
  signedUpCount: number | null;
} {
  const { data, status } = useMe();
  return useMemo(
    () => ({
      identity: data ? { name: data.name } : null,
      hydrated: status !== "pending",
      platformRole: data?.platformRole ?? null,
      orgId: data?.orgId ?? null,
      orgName: data?.orgName ?? null,
      isOwner: data?.isOwner ?? null,
      creditsUsed: data?.creditsUsed ?? null,
      monthlyCreditLimit: data?.monthlyCreditLimit ?? null,
      signedUpCount: data?.signedUpCount ?? null,
    }),
    [data, status],
  );
}
