"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIdentity } from "@/hooks/use-identity";
import { HeaderCredits } from "./header-credits";

// The wordmark always shows. Two independent gates below it: showIdentity (never on
// /login, never before hydration — avoids a flash of a previous/wrong agency name on first
// paint) controls the agency name AND credits as a pair; showOrgName further hides just the
// name when it's literally "Yuvabe Studios" — that's already the static brand eyebrow to
// its left, so showing the org name too would visibly duplicate it (only happens for
// Yuvabe's own org, which is both the platform operator and a tenant on its own platform).
// Credits must NOT be nested inside showOrgName's block — that previously hid the whole
// credits display for Yuvabe's own org along with the (correctly) hidden duplicate name.
// No divider before HeaderCredits — its own bordered pill shape already separates it.
export function HeaderBrand() {
  const pathname = usePathname();
  const { hydrated, orgName } = useIdentity();
  const showIdentity = pathname !== "/login" && hydrated && Boolean(orgName);
  const showOrgName = showIdentity && orgName !== "Yuvabe Studios";

  return (
    <div className="flex items-center gap-3">
      <Link href="/" className="flex items-center gap-3">
        <span className="font-display text-xl font-semibold tracking-tight">
          Creative<span className="text-primary">OS</span>
        </span>
      </Link>
      <span className="text-eyebrow hidden sm:block">Yuvabe Studios</span>
      {showOrgName && (
        <>
          <span className="h-4 w-px bg-border" aria-hidden="true" />
          <span className="text-sm font-medium text-muted-foreground">{orgName}</span>
        </>
      )}
      {showIdentity && <HeaderCredits />}
    </div>
  );
}
