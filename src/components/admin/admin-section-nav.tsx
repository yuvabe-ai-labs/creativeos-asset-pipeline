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
];

export function AdminSectionNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="Admin sections" className="flex items-center gap-1">
      {TABS.map((tab) => (
        <Button
          key={tab.href}
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href={tab.href}>{tab.label}</Link>}
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
