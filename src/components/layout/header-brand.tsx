"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIdentity } from "@/hooks/use-identity";
import { HeaderCredits } from "./header-credits";

// The wordmark always shows. showIdentity (never on /login or /account/password, never
// before hydration — avoids a flash of a previous/wrong org's credits on first paint, and
// there's nothing meaningful to show on either page anyway: /account/password is a
// locked-down "set your password" gate — see use-identity.ts's pathname skip for why) gates
// the credits pill. The org name itself now lives in ProfilePopover, not here — see
// docs/superpowers/specs/2026-08-05-profile-popover-header-design.md.
const IDENTITY_HIDDEN_PATHS = ["/login", "/account/password"];

export function HeaderBrand() {
  const pathname = usePathname();
  const { hydrated, orgName } = useIdentity();
  const showIdentity = !IDENTITY_HIDDEN_PATHS.includes(pathname) && hydrated && Boolean(orgName);

  return (
    <div className="flex items-center gap-3">
      <Link href="/" className="flex items-center gap-3">
        <span className="font-display text-xl font-semibold tracking-tight">
          Creative<span className="text-primary">OS</span>
        </span>
      </Link>
      <span className="text-eyebrow hidden sm:block">Yuvabe Studios</span>
      {showIdentity && <HeaderCredits />}
    </div>
  );
}
