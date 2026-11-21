"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "/admin", label: "Agencies", active: (p: string) => p === "/admin" || p.startsWith("/admin/orgs") },
  { href: "/admin/plans", label: "Plans and prices", active: (p: string) => p.startsWith("/admin/plans") },
  { href: "/admin/payments", label: "Payments", active: (p: string) => p.startsWith("/admin/payments") },
];

// Admin's sections, at the top of each Admin page. Underlined like the header's Admin link.
export function AdminSectionNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="Admin" className="mb-8 flex gap-1">
      {SECTIONS.map((s) => {
        const active = s.active(pathname);
        return (
          <Button
            key={s.href}
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link href={s.href}>{s.label}</Link>}
            aria-current={active ? "page" : undefined}
            className={cn(
              "underline decoration-2 underline-offset-4",
              active ? "text-foreground decoration-primary" : "text-muted-foreground decoration-transparent",
            )}
          />
        );
      })}
    </nav>
  );
}
