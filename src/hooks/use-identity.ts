"use client";

import { useCallback, useEffect, useState } from "react";
import {
  IDENTITY_KEY,
  parseIdentity,
  serializeIdentity,
  type Identity,
} from "@/lib/identity";

// Reads the soft identity from localStorage and keeps it in sync across tabs. When auth
// lands (spec §5.2) this hook's innards swap to read the session — call sites stay put.
export function useIdentity(): {
  identity: Identity | null;
  setIdentity: (id: Identity) => void;
} {
  const [identity, setState] = useState<Identity | null>(null);

  useEffect(() => {
    setState(parseIdentity(localStorage.getItem(IDENTITY_KEY)));
    function onStorage(e: StorageEvent) {
      if (e.key === IDENTITY_KEY) setState(parseIdentity(e.newValue));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setIdentity = useCallback((id: Identity) => {
    localStorage.setItem(IDENTITY_KEY, serializeIdentity(id));
    setState(id);
  }, []);

  return { identity, setIdentity };
}
