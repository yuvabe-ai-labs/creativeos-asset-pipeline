"use client";

import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// The editors' full-width Generate, pinned to the bottom of the form column. Not yet connected.
export function AvatarGenerateButton({ disabled }: { disabled: boolean }) {
  return (
    <div className="mt-auto pt-4">
      <Button
        size="lg"
        className="h-12 w-full gap-2 text-base"
        disabled={disabled}
        onClick={() => toast.info("Generation isn't connected yet.")}
      >
        <Sparkles className="size-4" strokeWidth={1.5} />
        Generate
      </Button>
    </div>
  );
}
