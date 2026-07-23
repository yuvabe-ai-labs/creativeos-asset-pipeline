"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIdentity } from "@/hooks/use-identity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Only rendered for platform-level super_admins — a regular org owner (including one
// created via /admin/orgs/new) never sees this. Not a redirect: a super_admin's default
// landing stays the normal app, scoped to their own org (D85) — /admin is an
// always-available side destination, not a takeover.
export function AdminNavLink() {
  const { hydrated, platformRole } = useIdentity();
  const pathname = usePathname();
  if (!hydrated || platformRole !== "super_admin") return null;

  // Underline it while anywhere under /admin, so it's always visually obvious you're in
  // the admin section rather than the normal per-org app.
  const isActive = pathname?.startsWith("/admin") ?? false;

  return (
    <Button
      variant="ghost"
      size="sm"
      nativeButton={false}
      render={<Link href="/admin">Admin</Link>}
      className={cn(
        "underline decoration-2 underline-offset-4",
        isActive
          ? "text-foreground decoration-primary"
          : "text-muted-foreground decoration-transparent",
      )}
    />
  );
}
