"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isPublicReviewPath } from "@/lib/client-review/paths";
import { HeaderBrand } from "./header-brand";
import { HeaderActions } from "./header-actions";

// The app chrome, minus the public client review page (D279): a client has no session,
// so the inbox/profile would 401, and the page must read as the studio's deliverable.
export function AppHeader({ className }: { className?: string }) {
  const pathname = usePathname();
  if (isPublicReviewPath(pathname)) return null;

  return (
    <header
      className={cn(
        "sticky z-40 flex h-16 shrink-0 items-center justify-between border-b border-border/80 bg-background/80 px-6 backdrop-blur-md",
        className,
      )}
    >
      <HeaderBrand />
      <HeaderActions />
    </header>
  );
}
