"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

// Each admin page sets its own content width; the tabs take the same width so they line up
// with the content below them.
function contentWidth(pathname: string): string {
  // The models catalog's card grid (D591); a model's own page stays narrower.
  if (pathname === "/admin/models") return "max-w-7xl";
  if (pathname.startsWith("/admin/models") || pathname.startsWith("/admin/credits")) return "max-w-5xl";
  if (pathname.startsWith("/admin/orgs")) return "max-w-4xl";
  if (pathname === "/admin") return "max-w-6xl";
  return "max-w-3xl";
}

export function AdminSectionNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav
      aria-label="Admin sections"
      className={cn("mx-auto flex w-full items-center gap-1 px-6 pt-8", contentWidth(pathname))}
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
  );
}
