"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ADMIN_CONTAINER } from "@/components/admin/admin-page";

const TABS = [
  {
    label: "Agencies",
    href: "/admin",
    active: (p: string) => p === "/admin" || p.startsWith("/admin/orgs"),
  },
  {
    label: "Models",
    href: "/admin/models",
    active: (p: string) => p.startsWith("/admin/models"),
  },
  {
    label: "Credits",
    href: "/admin/credits",
    active: (p: string) => p.startsWith("/admin/credits"),
  },
  {
    label: "Plans and prices",
    href: "/admin/plans",
    active: (p: string) => p.startsWith("/admin/plans"),
  },
  {
    label: "Payments",
    href: "/admin/payments",
    active: (p: string) => p.startsWith("/admin/payments"),
  },
];

export function AdminSectionNav() {
  const pathname = usePathname() ?? "";
  return (
    <div className={cn(ADMIN_CONTAINER, "pt-8")}>
      {/* -ml-2.5 takes back the first tab's own padding, so its text starts where the page title does. */}
      <nav
        aria-label="Admin sections"
        className="-ml-2.5 flex flex-wrap items-center gap-1"
      >
        {TABS.map((tab) => (
          <Button
            key={tab.href}
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link href={tab.href}>{tab.label}</Link>}
            aria-current={tab.active(pathname) ? "page" : undefined}
            className={cn(
              "underline decoration-2 underline-offset-4",
              tab.active(pathname)
                ? "text-foreground decoration-primary"
                : "text-muted-foreground decoration-transparent",
            )}
          />
        ))}
      </nav>
    </div>
  );
}
