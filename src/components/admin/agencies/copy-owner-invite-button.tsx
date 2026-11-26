"use client";

import { useEffect, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** How long the button says Copied. */
const COPIED_MS = 2000;

// The agencies list's fix for an owner who hasn't joined: copies the stored link (the same link
// every time, no request), and the button says Copied for a moment.
export function CopyOwnerInviteButton({ link, email, className }: { link: string; email: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast(`Invite link copied. Send it to ${email}.`);
    } catch {
      toast.error("Couldn't copy the link. Try again.");
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => void copy()}
      className={cn(copied && "border-success/45 bg-success/10 text-success-text hover:bg-success/10 hover:text-success-text", className)}
    >
      {copied ? <Check strokeWidth={1.5} /> : <Link2 strokeWidth={1.5} />}
      {copied ? "Copied" : "Copy invite link"}
    </Button>
  );
}
