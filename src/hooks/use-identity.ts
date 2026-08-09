"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { Identity } from "@/lib/identity";
import type { OrgRole, PlatformRole } from "@/lib/dal-logic";
import { authFetch } from "@/lib/supabase/session-ready";

// Module-level cache + in-flight dedup: multiple components call this hook (the profile
// popover, admin nav link, plus prompt/image-gen/video-prompt focus views), and
// any of them can mount/remount independently. Without this, each mount fires its own
// /api/me request — observed firing dozens of times per canvas session.
//
// IMPORTANT: logoutAction()'s redirect("/") is a Server Action redirect — Next's App Router
// performs that as a soft, client-side transition, NOT a full browser page reload. This
// module's state survives it completely intact. (An earlier version of this comment assumed
// otherwise — that was wrong, and was the root cause of a real bug: sign out of org A, sign
// in as org B in the same tab, and the header kept showing org A's name/credits until a
// manual refresh, because cachedHydrated was still true and the hook just re-synced from the
// stale cache instead of fetching.) resetIdentityCache() below is what actually invalidates
// this on sign-out — call it explicitly, do not rely on navigation to do it for you.
type FetchResult = {
  identity: Identity | null;
  platformRole: PlatformRole | null;
  orgId: string | null;
  orgName: string | null;
  orgRole: OrgRole | null;
  creditsUsed: number | null;
  monthlyCreditLimit: number | null;
};

let cachedIdentity: Identity | null = null;
let cachedPlatformRole: PlatformRole | null = null;
let cachedOrgId: string | null = null;
let cachedOrgName: string | null = null;
let cachedOrgRole: OrgRole | null = null;
let cachedCreditsUsed: number | null = null;
let cachedMonthlyCreditLimit: number | null = null;
let cachedHydrated = false;
let inFlightFetch: Promise<FetchResult> | null = null;

// Call this at the moment sign-out happens (see profile-popover.tsx), client-side, before/as
// the redirect fires. Without it, a subsequent sign-in as a different account in the same
// tab sees cachedHydrated still true and silently reuses the previous account's identity —
// see the module comment above.
export function resetIdentityCache(): void {
  cachedIdentity = null;
  cachedPlatformRole = null;
  cachedOrgId = null;
  cachedOrgName = null;
  cachedOrgRole = null;
  cachedCreditsUsed = null;
  cachedMonthlyCreditLimit = null;
  cachedHydrated = false;
  inFlightFetch = null;
}

function fetchIdentity(): Promise<FetchResult> {
  if (!inFlightFetch) {
    // cache: "no-store" is load-bearing, not defensive boilerplate — a plain fetch() here
    // is subject to the browser's normal HTTP cache, and /api/me's route handler sends no
    // explicit no-cache response headers. Without this, the FIRST /api/me call in a tab
    // gets cached and silently reused across every later auth-state change (login, sign
    // out + sign back in as someone else, this feature's forced password change) until a
    // hard refresh — the exact "stale identity until I refresh" bug this fixes.
    //
    // authFetch() (not bare fetch()): if the tab was backgrounded long enough for the
    // access token to expire, it refreshes first — through the browser client's own lock,
    // so it can't race any other hook's fetch doing the same thing. See session-ready.ts.
    inFlightFetch = authFetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data): FetchResult =>
        data && typeof data.name === "string"
          ? {
              identity: { name: data.name, role: data.role } as Identity,
              platformRole: (data.platformRole as PlatformRole | undefined) ?? null,
              orgId: (data.orgId as string | undefined) ?? null,
              orgName: (data.orgName as string | undefined) ?? null,
              orgRole: (data.orgRole as OrgRole | undefined) ?? null,
              creditsUsed: (data.creditsUsed as number | undefined) ?? null,
              monthlyCreditLimit: (data.monthlyCreditLimit as number | undefined) ?? null,
            }
          : {
              identity: null,
              platformRole: null,
              orgId: null,
              orgName: null,
              orgRole: null,
              creditsUsed: null,
              monthlyCreditLimit: null,
            },
      )
      .catch(
        (): FetchResult => ({
          identity: null,
          platformRole: null,
          orgId: null,
          orgName: null,
          orgRole: null,
          creditsUsed: null,
          monthlyCreditLimit: null,
        }),
      );
  }
  return inFlightFetch;
}

// Reads the logged-in user's identity from the session (via /api/me). `identity`/
// `hydrated` are the frozen public API (D53) — `setIdentity` is gone, login owns identity
// now. `platformRole`/`orgId`/`orgName`/`creditsUsed`/`monthlyCreditLimit` are additive
// sibling fields (gate the admin nav link / scope Realtime subscriptions / show the agency
// name and monthly usage in the header) — Identity itself never changes shape. `hydrated`
// flips true once the fetch resolves; until then identity/platformRole/orgId/orgName/
// creditsUsed/monthlyCreditLimit === null means "not checked yet", so consumers must wait
// for `hydrated` before acting on null.
export function useIdentity(): {
  identity: Identity | null;
  hydrated: boolean;
  platformRole: PlatformRole | null;
  orgId: string | null;
  orgName: string | null;
  orgRole: OrgRole | null;
  creditsUsed: number | null;
  monthlyCreditLimit: number | null;
} {
  const [identity, setIdentity] = useState<Identity | null>(cachedIdentity);
  const [platformRole, setPlatformRole] = useState<PlatformRole | null>(cachedPlatformRole);
  const [orgId, setOrgId] = useState<string | null>(cachedOrgId);
  const [orgName, setOrgName] = useState<string | null>(cachedOrgName);
  const [orgRole, setOrgRole] = useState<OrgRole | null>(cachedOrgRole);
  const [creditsUsed, setCreditsUsed] = useState<number | null>(cachedCreditsUsed);
  const [monthlyCreditLimit, setMonthlyCreditLimit] = useState<number | null>(
    cachedMonthlyCreditLimit,
  );
  const [hydrated, setHydrated] = useState(cachedHydrated);
  const pathname = usePathname();

  useEffect(() => {
    // ProfilePopover (rendered from HeaderActions, which itself skips /login) calls this
    // hook on every other page, including /account/password. /login: there's no session to
    // check yet, and nothing renders there to call this hook anyway. /account/password:
    // proxy.ts actively 403s /api/me for a user who still owes a password change (it's an
    // /api path, not under /account/password's own exclusion) — so fetching here wouldn't
    // just be premature, it would DETERMINISTICALLY get blocked and cache a false "logged
    // out" result at module scope. Either way, changePasswordAction's/loginAction's
    // redirect("/") is a soft navigation (no full page reload), so that stale cache would
    // survive it and every consumer would show "no identity" until a hard refresh cleared
    // the module. Skipping the fetch on both pages means the first real fetch happens once
    // pathname actually changes away from them.
    if (pathname === "/login" || pathname === "/account/password") return;
    if (cachedHydrated) {
      // Already resolved by an earlier mount — sync immediately, no new fetch.
      setIdentity(cachedIdentity);
      setPlatformRole(cachedPlatformRole);
      setOrgId(cachedOrgId);
      setOrgName(cachedOrgName);
      setOrgRole(cachedOrgRole);
      setCreditsUsed(cachedCreditsUsed);
      setMonthlyCreditLimit(cachedMonthlyCreditLimit);
      setHydrated(true);
      return;
    }
    let cancelled = false;
    fetchIdentity().then((result) => {
      cachedIdentity = result.identity;
      cachedPlatformRole = result.platformRole;
      cachedOrgId = result.orgId;
      cachedOrgName = result.orgName;
      cachedOrgRole = result.orgRole;
      cachedCreditsUsed = result.creditsUsed;
      cachedMonthlyCreditLimit = result.monthlyCreditLimit;
      cachedHydrated = true;
      if (!cancelled) {
        setIdentity(result.identity);
        setPlatformRole(result.platformRole);
        setOrgId(result.orgId);
        setOrgName(result.orgName);
        setOrgRole(result.orgRole);
        setCreditsUsed(result.creditsUsed);
        setMonthlyCreditLimit(result.monthlyCreditLimit);
        setHydrated(true);
      }
    });
    return () => {
      cancelled = true;
    };
    // pathname is a real dependency (not just exhaustive-deps box-ticking): it's what
    // re-fires this effect the moment a redirect leaves /login or /account/password,
    // triggering the first real fetch instead of leaving the hook permanently un-hydrated.
  }, [pathname]);

  return { identity, hydrated, platformRole, orgId, orgName, orgRole, creditsUsed, monthlyCreditLimit };
}
