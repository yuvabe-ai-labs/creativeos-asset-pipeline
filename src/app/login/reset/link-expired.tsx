import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LINK_EXPIRED } from "@/lib/auth/password-reset-schema";

/** A reset link with no token, or one that was refused on submit (D598). */
export function LinkExpired() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{LINK_EXPIRED}</h1>
        <p className="text-sm text-muted-foreground">Ask for a new link to set your password.</p>
      </div>
      <Button nativeButton={false} render={<Link href="/login/forgot">Send a new link</Link>} />
    </div>
  );
}
