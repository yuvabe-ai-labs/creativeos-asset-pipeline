"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useIdentity } from "@/hooks/use-identity";

/** The Billing page is rendered on the server. When the header's billing figures change (new
 *  credits or a plan change heard live, or a re-read on returning to the tab), re-render the page
 *  once so its credits and plan never disagree with the header (D586). */
export function RefreshOnBillingChange() {
  const { billing } = useIdentity();
  const router = useRouter();
  const key =
    billing && "state" in billing
      ? `${billing.left}|${billing.total}|${billing.state}|${billing.freeEndsAt}|${billing.planEndsAt}`
      : null;
  const seen = useRef(key);

  useEffect(() => {
    if (key === null || key === seen.current) return;
    seen.current = key;
    router.refresh();
  }, [key, router]);

  return null;
}
