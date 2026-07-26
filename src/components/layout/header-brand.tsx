"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIdentity } from "@/hooks/use-identity";
import { HeaderCredits } from "./header-credits";

// The wordmark always shows. The agency name is appended once identity resolves — never on
// /login (no session to reflect there, same reasoning as HeaderActions), never before
// hydration (avoids a flash of a previous/wrong agency name on first paint), and never when
// it's literally "Yuvabe Studios" — that's already the static brand eyebrow just to its
// left, so showing the org name too would visibly duplicate it (only happens for Yuvabe's
// own org, which is both the platform operator and a tenant on its own platform). Credits
// used this month (HeaderCredits) sits right after it, same visibility gate.
export function HeaderBrand() {
  const pathname = usePathname();
  const { hydrated, orgName } = useIdentity();
  const showOrgName =
    pathname !== "/login" && hydrated && orgName && orgName !== "Yuvabe Studios";

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
          <span className="h-4 w-px bg-border" aria-hidden="true" />
          <HeaderCredits />
        </>
      )}
    </div>
  );
}
