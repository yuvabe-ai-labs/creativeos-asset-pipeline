"use client";

import { useMemo } from "react";
import { useMe } from "@/hooks/queries/me";
import type { Identity } from "@/lib/identity";
import type { OrgRole, PlatformRole } from "@/lib/dal-logic";

// The signed-in person, read from the one /api/me query (D499). Kept as a hook so its ~20
// consumers don't change. `hydrated` is false until something is known (a seeded payload, a
// fetch result or a failed fetch); until then the nulls mean "not checked yet".
export function useIdentity(): {
  identity: Identity | null;
  hydrated: boolean;
  platformRole: PlatformRole | null;
  orgId: string | null;
  orgName: string | null;
  orgRole: OrgRole | null;
  presetName: string | null;
  creditsUsed: number | null;
  monthlyCreditLimit: number | null;
} {
  const { data, status } = useMe();
  return useMemo(
    () => ({
      identity: data ? { name: data.name, role: data.role } : null,
      hydrated: status !== "pending",
      platformRole: data?.platformRole ?? null,
      orgId: data?.orgId ?? null,
      orgName: data?.orgName ?? null,
      orgRole: data?.orgRole ?? null,
      presetName: data?.presetName ?? null,
      creditsUsed: data?.creditsUsed ?? null,
      monthlyCreditLimit: data?.monthlyCreditLimit ?? null,
    }),
    [data, status],
  );
}
