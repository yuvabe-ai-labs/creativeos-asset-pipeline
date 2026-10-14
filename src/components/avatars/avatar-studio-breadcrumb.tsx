"use client";

import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

// The same trail as the client's other pages (Avatars, Brand KB, Market), one level deeper. The
// last crumb follows the name as it is typed, so it lives in the Studio rather than the page.
export function AvatarStudioBreadcrumb({ clientSlug, clientName, name }: {
  clientSlug: string;
  clientName: string;
  name: string;
}) {
  return (
    <Breadcrumb className="animate-rise shrink-0">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink render={<Link href="/">Clients</Link>} />
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink render={<Link href={`/clients/${clientSlug}`}>{clientName}</Link>} />
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink render={<Link href={`/clients/${clientSlug}/avatars`}>Avatars</Link>} />
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage className="max-w-[24ch] truncate">{name.trim() || "Untitled avatar"}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
