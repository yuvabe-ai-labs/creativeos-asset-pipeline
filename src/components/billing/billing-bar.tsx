"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gift, TriangleAlert, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIdentity } from "@/hooks/use-identity";
import { formatDay, lastDayOf } from "@/lib/billing/dates";
import type { OwnerBillingSummary } from "@/lib/billing/summary";
import { cn } from "@/lib/utils";

// The one line at the top of the workspace about credits (D523). Owners of a paying agency see free
// credits and their end, "pick a plan", a due payment, credits used up, or 80% used. Members see a
// line only when AI runs are paused, and are told to ask the owner. Nothing for managed agencies,
// and nowhere it would repeat the page (billing) or doesn't belong (sign-in, Admin).
const HIDDEN = ["/login", "/invite", "/onboarding", "/admin", "/billing", "/r/"];

type Line = { tone: "brand" | "warn" | "quiet"; icon: typeof Zap; text: string; action?: { label: string; href: string } };

const n = (v: number) => v.toLocaleString("en-IN");

export function ownerLine(s: OwnerBillingSummary): Line | null {
  switch (s.state) {
    case "payment_due":
      return { tone: "warn", icon: TriangleAlert, text: "Your payment didn't go through, so AI runs are paused. Nothing is lost.", action: { label: "Open billing", href: "/billing" } };
    case "no_plan":
      return { tone: "brand", icon: Zap, text: "Pick a plan to start generating.", action: { label: "See plans", href: "/billing/plans" } };
    case "free":
      return {
        tone: "brand",
        icon: Gift,
        text: `You have ${n(s.freeLeft)} free credits${s.freeEndsAt ? ` until ${formatDay(lastDayOf(s.freeEndsAt))}` : ""}.`,
        action: { label: "See plans", href: "/billing/plans" },
      };
    case "used_up":
      return { tone: "warn", icon: TriangleAlert, text: "You've used this month's credits, so AI runs are paused.", action: { label: "Top up", href: "/billing" } };
    case "low":
      return { tone: "quiet", icon: Zap, text: `You've used 80% of this month's credits. ${n(s.left)} left.`, action: { label: "Top up", href: "/billing" } };
    default:
      return null;
  }
}

const TONE = {
  brand: "border-primary/15 bg-primary/5 text-foreground",
  warn: "border-amber-500/20 bg-amber-500/10 text-foreground",
  quiet: "border-border bg-muted/40 text-foreground",
} as const;

export function BillingBar() {
  const { billing } = useIdentity();
  const pathname = usePathname() ?? "";
  if (!billing || billing.mode !== "plans" || HIDDEN.some((p) => pathname.startsWith(p))) return null;
  const line: Line | null =
    "state" in billing
      ? ownerLine(billing)
      : billing.paused
        ? { tone: "warn", icon: TriangleAlert, text: "AI runs are paused for your agency. Ask your agency owner." }
        : null;
  if (!line) return null;
  const Icon = line.icon;
  return (
    <div className={cn("border-b", TONE[line.tone])} role="status">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-2 text-sm">
        <span className="flex items-center gap-2">
          <Icon className={cn("size-4 shrink-0", line.tone === "warn" ? "text-amber-600" : "text-primary")} strokeWidth={1.5} />
          {line.text}
        </span>
        {line.action && (
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={line.action.href} />}>
            {line.action.label}
          </Button>
        )}
      </div>
    </div>
  );
}
