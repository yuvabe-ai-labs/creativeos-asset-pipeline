"use client";

import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

// D487 — the slim header on an edit tool's panel (Edit video, Change voice): what it is, and a
// Close that returns the centre column to the generate settings.
export function VideoGenModeHeader({ icon: Icon, title, onClose }: { icon: LucideIcon; title: string; onClose: () => void }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card px-6 py-3">
      <Icon className="size-4 text-primary" strokeWidth={1.5} />
      <span className="text-sm font-semibold text-foreground">{title}</span>
      <Button type="button" variant="ghost" size="xs" onClick={onClose} className="ml-auto text-muted-foreground">
        <X className="size-3.5" strokeWidth={1.5} />
        Close
      </Button>
    </div>
  );
}
