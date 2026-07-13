"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// One entry in a focus view's left rail. `icon` is a pre-rendered element so both
// Lucide icons and the connected-node <NodeIcon> can be passed uniformly.
export function RailItem({
  icon,
  label,
  active,
  onClick,
  badge,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className={cn(
        "h-auto w-full justify-start gap-2 px-2.5 py-2 text-sm font-normal",
        active
          ? "border-primary/25 bg-primary/8 font-medium text-foreground hover:bg-primary/8"
          : "text-muted-foreground",
      )}
    >
      <span className="flex w-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {badge}
    </Button>
  );
}
