"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type Props = {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
};

export function ImageGenParamRow({ icon: Icon, label, children }: Props) {
  return (
    <label className="flex items-center gap-2">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
