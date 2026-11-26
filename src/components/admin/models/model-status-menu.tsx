"use client";

import { Check, ChevronDown } from "lucide-react";
import { STATUS_HELP, STATUS_ORDER, STATUS_TEXT } from "@/lib/admin/model-page";
import { ModelStatusBadge } from "@/components/admin/models/model-status-badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** The status badge in the header strip; picking a status opens the pending change below it, which waits for Save. */
export function ModelStatusMenu({
  status,
  onPick,
  triggerRef,
}: {
  status: string;
  onPick: (status: string) => void;
  /** Focus comes back here when the pending change closes. */
  triggerRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            ref={triggerRef}
            variant="ghost"
            size="xs"
            className="-mx-1 gap-0.5 rounded-full px-1 text-muted-foreground hover:bg-transparent aria-expanded:bg-transparent"
            aria-label={`Status: ${STATUS_TEXT[status] ?? status}. Change`}
          />
        }
      >
        <ModelStatusBadge status={status} />
        <ChevronDown aria-hidden strokeWidth={1.5} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" aria-label="Status">
        {STATUS_ORDER.map((s) => (
          <DropdownMenuItem key={s} onClick={() => onPick(s)} className="items-start">
            <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
              <ModelStatusBadge status={s} />
              <span className="text-xs text-muted-foreground">{STATUS_HELP[s]}</span>
            </div>
            {s === status && <Check aria-label="Current" strokeWidth={1.5} className="mt-0.5 size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
