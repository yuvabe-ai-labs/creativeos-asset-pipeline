"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

// D493 — the top of an edit panel: back to the generate settings, and what this panel is.
export function VideoGenEditPanelHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2.5">
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Back to video" title="Back to video" onClick={onBack}>
        <ArrowLeft className="size-4" strokeWidth={1.5} />
      </Button>
      <h2 className="text-base font-medium text-foreground">{title}</h2>
    </div>
  );
}
