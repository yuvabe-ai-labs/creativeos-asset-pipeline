"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useCan } from "@/components/permissions/use-can";
import { useIdentity } from "@/hooks/use-identity";
import { cn } from "@/lib/utils";

// The owner's way to Billing (D523), beside Team. Only for an agency that pays for a plan: a
// managed agency has nothing to buy, and its credits stay in the profile popover. A dot marks a
// payment that needs attention. Rides on /api/me; no request of its own.
export function BillingNavLink() {
  const canSee = useCan("view_credits");
  const { billing } = useIdentity();
  const pathname = usePathname();
  if (!canSee || !billing || billing.mode !== "plans") return null;
  const isActive = pathname?.startsWith("/billing") ?? false;
  const attention = "state" in billing && (billing.state === "payment_due" || billing.state === "no_plan" || billing.state === "used_up");
  return (
    <Button
      variant="ghost"
      size="sm"
      nativeButton={false}
      render={<Link href="/billing" />}
      className={cn("gap-1.5 underline decoration-2 underline-offset-4", isActive ? "text-foreground decoration-primary" : "text-muted-foreground decoration-transparent")}
    >
      Billing
      {attention && <span className="size-1.5 rounded-full bg-primary" aria-label="Needs attention" />}
    </Button>
  );
}
