"use client";

import { useEffect, useState } from "react";
import type { Identity } from "@/lib/identity";

// Module-level cache + in-flight dedup: multiple components call this hook (the identity
// chip, plus prompt/image-gen/video-prompt focus views), and any of them can mount/remount
// independently. Without this, each mount fires its own /api/me request — observed firing
// dozens of times per canvas session. Sign-out does a full page navigation (redirect()),
// which tears down this module's state naturally, so no manual invalidation is needed.
let cachedIdentity: Identity | null = null;
let cachedHydrated = false;
let inFlightFetch: Promise<Identity | null> | null = null;

function fetchIdentity(): Promise<Identity | null> {
  if (!inFlightFetch) {
    inFlightFetch = fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) =>
        data && typeof data.name === "string"
          ? ({ name: data.name, role: data.role } as Identity)
          : null,
      )
      .catch(() => null);
  }
  return inFlightFetch;
}

// Reads the logged-in user's identity from the session (via /api/me). Public API is
// frozen (D53): { identity, hydrated }. `setIdentity` is gone — login owns identity now.
// `hydrated` flips true once the fetch resolves; until then identity === null means
// "not checked yet", so consumers must wait for `hydrated` before acting on null.
export function useIdentity(): {
  identity: Identity | null;
  hydrated: boolean;
} {
  const [identity, setIdentity] = useState<Identity | null>(cachedIdentity);
  const [hydrated, setHydrated] = useState(cachedHydrated);

  useEffect(() => {
    if (cachedHydrated) {
      // Already resolved by an earlier mount — sync immediately, no new fetch.
      setIdentity(cachedIdentity);
      setHydrated(true);
      return;
    }
    let cancelled = false;
    fetchIdentity().then((result) => {
      cachedIdentity = result;
      cachedHydrated = true;
      if (!cancelled) {
        setIdentity(result);
        setHydrated(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { identity, hydrated };
}
