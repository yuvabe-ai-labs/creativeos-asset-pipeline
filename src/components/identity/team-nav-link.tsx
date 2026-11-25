"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useCan } from "@/components/permissions/use-can";
import { useIdentity } from "@/hooks/use-identity";
import { cn } from "@/lib/utils";

// Spec §6.1: the owner's way to the Team page, with how many people signed up and wait for
// permissions. The count rides on /api/me, so this makes no request of its own.
export function TeamNavLink() {
  const canManage = useCan("manage_team");
  const { signedUpCount } = useIdentity();
  const pathname = usePathname();
  if (!canManage) return null;
  const isActive = pathname?.startsWith("/team") ?? false;
  return (
    <Button
      variant="ghost"
      size="sm"
      nativeButton={false}
      render={<Link href="/team" />}
      className={cn("gap-1.5 underline decoration-2 underline-offset-4", isActive ? "text-foreground decoration-primary" : "text-muted-foreground decoration-transparent")}
    >
      Team
      {signedUpCount !== null && signedUpCount > 0 && (
        <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[0.65rem] font-semibold text-primary-foreground">{signedUpCount}</span>
      )}
    </Button>
  );
}
