"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { TeamNavLink } from "@/components/identity/team-nav-link";
import { BillingNavLink } from "@/components/identity/billing-nav-link";
import { AdminNavLink } from "@/components/identity/admin-nav-link";
import { ReviewInbox } from "@/components/identity/review-inbox";
import { ProfilePopover } from "@/components/identity/profile-popover";
import { HelpMenu } from "@/components/help/help-menu";

// Hidden on /login — there's no session to reflect on the sign-in form itself, so
// showing "signed in as X" / an admin link / sign-out there is just confusing chrome,
// independent of whether a session happens to still be technically live at that moment.
// The invite sign-up page (/invite/*) is the same: the person has no account yet, and the
// inbox and profile reads would fail without a session.
export function HeaderActions() {
  const pathname = usePathname();
  if (pathname === "/login" || pathname.startsWith("/invite/")) return null;

  return (
    <div className="flex items-center gap-3">
      {/* Suspense: HelpMenu reads useSearchParams, which opts its subtree out of
          static rendering unless a boundary contains it. */}
      <Suspense fallback={null}>
        <HelpMenu />
      </Suspense>
      {/* D165/R9.6: org-wide "waiting on you". Lives in the chrome because the work it
          points at spans canvases and clients. Renders nothing when the list is empty. */}
      <ReviewInbox />
      <TeamNavLink />
      <BillingNavLink />
      <AdminNavLink />
      <ProfilePopover />
    </div>
  );
}
