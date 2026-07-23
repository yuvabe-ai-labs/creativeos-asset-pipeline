"use client";

import { usePathname } from "next/navigation";
import { AdminNavLink } from "@/components/identity/admin-nav-link";
import { IdentityChip } from "@/components/identity/identity-chip";

// Hidden on /login — there's no session to reflect on the sign-in form itself, so
// showing "signed in as X" / an admin link / sign-out there is just confusing chrome,
// independent of whether a session happens to still be technically live at that moment.
export function HeaderActions() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <div className="flex items-center gap-3">
      <AdminNavLink />
      <IdentityChip />
    </div>
  );
}
