"use client";

import { Fragment, type MouseEvent } from "react";
import Link from "next/link";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import type { Crumb } from "@/lib/people/nav";

// A page's breadcrumb trail, the last crumb (no href) being where you are. onNavigate takes over a
// plain click (a tab on the same page changes the address with the History API instead of a
// server render); a modified click still opens the link.
export function PageCrumbs({ items, onNavigate }: { items: readonly Crumb[]; onNavigate?: (href: string) => void }) {
  const handle = (href: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (!onNavigate || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onNavigate(href);
  };
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((c, i) => (
          <Fragment key={`${i}:${c.label}`}>
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {c.href ? (
                <BreadcrumbLink render={<Link href={c.href} onClick={handle(c.href)}>{c.label}</Link>} />
              ) : (
                <BreadcrumbPage>{c.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
