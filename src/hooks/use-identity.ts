"use client";

import { useCallback, useEffect, useState } from "react";
import {
  IDENTITY_KEY,
  parseIdentity,
  serializeIdentity,
  type Identity,
} from "@/lib/identity";

// The browser's "storage" event fires only in OTHER tabs, so two useIdentity()
// consumers in the SAME tab (e.g. the gate and the chip) won't see each other's
// setIdentity without an explicit in-page broadcast. This custom event bridges that.
const IDENTITY_EVENT = "creativeos:identity";

// Reads the soft identity from localStorage and keeps every consumer in sync — across
// tabs (storage event) and within the tab (our broadcast). When auth lands (spec §5.2)
// this hook's innards swap to read the session — call sites stay put.
export function useIdentity(): {
  identity: Identity | null;
  setIdentity: (id: Identity) => void;
} {
  const [identity, setState] = useState<Identity | null>(null);

  useEffect(() => {
    const sync = () => setState(parseIdentity(localStorage.getItem(IDENTITY_KEY)));
    sync(); // hydrate on mount
    window.addEventListener("storage", sync); // cross-tab
    window.addEventListener(IDENTITY_EVENT, sync); // same-tab
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(IDENTITY_EVENT, sync);
    };
  }, []);

  const setIdentity = useCallback((id: Identity) => {
    localStorage.setItem(IDENTITY_KEY, serializeIdentity(id));
    setState(id); // update this instance immediately
    window.dispatchEvent(new Event(IDENTITY_EVENT)); // notify all other instances in this tab
  }, []);

  return { identity, setIdentity };
}
