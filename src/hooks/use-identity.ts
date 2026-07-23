"use client";

import { useEffect, useState } from "react";
import type { Identity } from "@/lib/identity";
import type { PlatformRole } from "@/lib/dal-logic";

// Module-level cache + in-flight dedup: multiple components call this hook (the identity
// chip, admin nav link, header brand, plus prompt/image-gen/video-prompt focus views), and
// any of them can mount/remount independently. Without this, each mount fires its own
// /api/me request — observed firing dozens of times per canvas session. Sign-out does a
// full page navigation (redirect()), which tears down this module's state naturally, so no
// manual invalidation is needed.
type FetchResult = {
  identity: Identity | null;
  platformRole: PlatformRole | null;
  orgName: string | null;
};

let cachedIdentity: Identity | null = null;
let cachedPlatformRole: PlatformRole | null = null;
let cachedOrgName: string | null = null;
let cachedHydrated = false;
let inFlightFetch: Promise<FetchResult> | null = null;

function fetchIdentity(): Promise<FetchResult> {
  if (!inFlightFetch) {
    inFlightFetch = fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data): FetchResult =>
        data && typeof data.name === "string"
          ? {
              identity: { name: data.name, role: data.role } as Identity,
              platformRole: (data.platformRole as PlatformRole | undefined) ?? null,
              orgName: (data.orgName as string | undefined) ?? null,
            }
          : { identity: null, platformRole: null, orgName: null },
      )
      .catch((): FetchResult => ({ identity: null, platformRole: null, orgName: null }));
  }
  return inFlightFetch;
}

// Reads the logged-in user's identity from the session (via /api/me). `identity`/
// `hydrated` are the frozen public API (D53) — `setIdentity` is gone, login owns identity
// now. `platformRole`/`orgName` are additive sibling fields (gate the admin nav link / show
// the agency name in the header) — Identity itself never changes shape. `hydrated` flips
// true once the fetch resolves; until then identity/platformRole/orgName === null means
// "not checked yet", so consumers must wait for `hydrated` before acting on null.
export function useIdentity(): {
  identity: Identity | null;
  hydrated: boolean;
  platformRole: PlatformRole | null;
  orgName: string | null;
} {
  const [identity, setIdentity] = useState<Identity | null>(cachedIdentity);
  const [platformRole, setPlatformRole] = useState<PlatformRole | null>(cachedPlatformRole);
  const [orgName, setOrgName] = useState<string | null>(cachedOrgName);
  const [hydrated, setHydrated] = useState(cachedHydrated);

  useEffect(() => {
    if (cachedHydrated) {
      // Already resolved by an earlier mount — sync immediately, no new fetch.
      setIdentity(cachedIdentity);
      setPlatformRole(cachedPlatformRole);
      setOrgName(cachedOrgName);
      setHydrated(true);
      return;
    }
    let cancelled = false;
    fetchIdentity().then((result) => {
      cachedIdentity = result.identity;
      cachedPlatformRole = result.platformRole;
      cachedOrgName = result.orgName;
      cachedHydrated = true;
      if (!cancelled) {
        setIdentity(result.identity);
        setPlatformRole(result.platformRole);
        setOrgName(result.orgName);
        setHydrated(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { identity, hydrated, platformRole, orgName };
}
