"use client";

import { useEffect, useState } from "react";
import type { Identity } from "@/lib/identity";
import type { PlatformRole } from "@/lib/dal-logic";

// Module-level cache + in-flight dedup: multiple components call this hook (the identity
// chip, admin nav link, plus prompt/image-gen/video-prompt focus views), and any of them
// can mount/remount independently. Without this, each mount fires its own /api/me request
// — observed firing dozens of times per canvas session. Sign-out does a full page
// navigation (redirect()), which tears down this module's state naturally, so no manual
// invalidation is needed.
type FetchResult = { identity: Identity | null; platformRole: PlatformRole | null };

let cachedIdentity: Identity | null = null;
let cachedPlatformRole: PlatformRole | null = null;
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
            }
          : { identity: null, platformRole: null },
      )
      .catch((): FetchResult => ({ identity: null, platformRole: null }));
  }
  return inFlightFetch;
}

// Reads the logged-in user's identity from the session (via /api/me). `identity`/
// `hydrated` are the frozen public API (D53) — `setIdentity` is gone, login owns identity
// now. `platformRole` is an additive sibling field (gates the admin nav link) — Identity
// itself never changes shape. `hydrated` flips true once the fetch resolves; until then
// identity/platformRole === null means "not checked yet", so consumers must wait for
// `hydrated` before acting on null.
export function useIdentity(): {
  identity: Identity | null;
  hydrated: boolean;
  platformRole: PlatformRole | null;
} {
  const [identity, setIdentity] = useState<Identity | null>(cachedIdentity);
  const [platformRole, setPlatformRole] = useState<PlatformRole | null>(cachedPlatformRole);
  const [hydrated, setHydrated] = useState(cachedHydrated);

  useEffect(() => {
    if (cachedHydrated) {
      // Already resolved by an earlier mount — sync immediately, no new fetch.
      setIdentity(cachedIdentity);
      setPlatformRole(cachedPlatformRole);
      setHydrated(true);
      return;
    }
    let cancelled = false;
    fetchIdentity().then((result) => {
      cachedIdentity = result.identity;
      cachedPlatformRole = result.platformRole;
      cachedHydrated = true;
      if (!cancelled) {
        setIdentity(result.identity);
        setPlatformRole(result.platformRole);
        setHydrated(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { identity, hydrated, platformRole };
}
