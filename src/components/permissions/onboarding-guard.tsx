"use client";

import { useContext, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { meQueryOptions } from "@/hooks/queries/me";
import { accessFromMe } from "@/lib/me/access";
import { isWaiting } from "@/lib/permissions/check";
import { ONBOARDING_PATH, confirmAndSendToOnboarding } from "@/lib/permissions/onboarding-route";
import { AccessContext } from "./access-context";

// Spec §4.4 on soft navigations: the root layout sends a waiting person to /onboarding on a full
// page load, but a link click never re-renders it. Reads the one Access from context; makes a
// request only for a waiting person leaving onboarding, to confirm on fresh data.
export function OnboardingGuard() {
  const { access, orgId } = useContext(AccessContext);
  const waiting = orgId !== "" && isWaiting(access, orgId);
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    void confirmAndSendToOnboarding(
      pathname,
      waiting,
      async () => {
        const fresh = await queryClient.fetchQuery({ ...meQueryOptions(), staleTime: 0 });
        return isWaiting(accessFromMe(fresh), fresh.orgId);
      },
      () => router.replace(ONBOARDING_PATH),
    );
  }, [pathname, waiting, queryClient, router]);

  return null;
}
