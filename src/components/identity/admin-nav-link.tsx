"use client";

import Link from "next/link";
import { useIdentity } from "@/hooks/use-identity";
import { Button } from "@/components/ui/button";

// Only rendered for platform-level super_admins — a regular org owner (including one
// created via /admin/orgs/new) never sees this. Not a redirect: a super_admin's default
// landing stays the normal app, scoped to their own org (D85) — /admin is an
// always-available side destination, not a takeover.
export function AdminNavLink() {
  const { hydrated, platformRole } = useIdentity();
  if (!hydrated || platformRole !== "super_admin") return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      nativeButton={false}
      render={<Link href="/admin">Admin</Link>}
    />
  );
}
