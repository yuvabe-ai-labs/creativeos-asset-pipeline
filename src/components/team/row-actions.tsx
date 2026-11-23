"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type RowMenuItem = {
  key: string;
  label: string;
  /** Removals: red, and set apart below a line. */
  destructive?: boolean;
  disabled?: boolean;
} & ({ onSelect: () => void; href?: never } | { href: string; onSelect?: never });

// A people row's actions: at most one button (`primary`), the rest in a ⋯ menu. Nothing renders
// when there is nothing to offer, so a viewer never sees a menu they can't use.
export function RowActions({ primary, items, label }: { primary?: ReactNode; items: RowMenuItem[]; label: string }) {
  const regular = items.filter((i) => !i.destructive);
  const destructive = items.filter((i) => i.destructive);
  const item = (i: RowMenuItem) => (
    <DropdownMenuItem
      key={i.key}
      disabled={i.disabled}
      className={cn(i.destructive && "text-destructive data-highlighted:text-destructive")}
      {...(i.href ? { render: <Link href={i.href} /> } : { onClick: i.onSelect })}
    >
      {i.label}
    </DropdownMenuItem>
  );

  return (
    <div className="flex items-center justify-end gap-1.5">
      {primary}
      {items.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} />}>
            <MoreHorizontal strokeWidth={1.5} />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-52">
            {regular.map(item)}
            {regular.length > 0 && destructive.length > 0 && <DropdownMenuSeparator />}
            {destructive.map(item)}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
