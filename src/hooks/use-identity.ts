"use client";

import { useEffect, useState } from "react";
import type { Identity } from "@/lib/identity";

// Reads the logged-in user's identity from the session (via /api/me). Public API is
// frozen (D53): { identity, hydrated }. `setIdentity` is gone — login owns identity now.
// `hydrated` flips true once the fetch resolves; until then identity === null means
// "not checked yet", so consumers must wait for `hydrated` before acting on null.
export function useIdentity(): {
  identity: Identity | null;
  hydrated: boolean;
} {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data && typeof data.name === "string") {
          setIdentity({ name: data.name, role: data.role });
        }
        setHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { identity, hydrated };
}
