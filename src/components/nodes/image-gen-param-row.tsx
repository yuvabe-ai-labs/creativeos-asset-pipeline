"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type Props = {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
};

// One param cell: label above its control (the ShotControlsRow pattern), so a
// parent can lay several out in a single `flex gap-3` row or stack them.
export function ImageGenParamRow({ icon: Icon, label, children }: Props) {
  return (
    <label className="block min-w-0 flex-1">
      <span className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="size-3.5 shrink-0" strokeWidth={1.5} />
        <span className="truncate">{label}</span>
      </span>
      {/* Flex so `flex-1` controls stretch to the cell's full width. */}
      <span className="flex min-w-0">{children}</span>
    </label>
  );
}
