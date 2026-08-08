"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";

// Supabase refresh tokens are single-use/rotating: whichever request refreshes an expired
// one first invalidates it for everyone else. auth-js's own lock only serializes refresh
// attempts made through ONE client instance — it cannot coordinate across the separate
// server requests this app's independent hooks fire (useIdentity, useNodeCost per node,
// etc.). A tab backgrounded long enough for the access token to expire, then foregrounded
// again, fires a burst of these; each would otherwise race the same rotating refresh token,
// and every loser gets "Invalid Refresh Token" — indistinguishable from being logged out.
//
// The fix: route everyone through this ONE call first. createBrowserSupabase() is a
// singleton, so auth-js's lock genuinely serializes concurrent callers here. getSession()
// is a cheap local read when the token is still valid, and does exactly one refresh — via
// the lock — when it's expired, writing the fresh tokens into the same cookies the server
// reads. By the time a caller's own fetch() reaches the server, there is nothing left for
// the server to race over.
let inFlight: Promise<void> | null = null;

function checkSession(): Promise<void> {
  if (!inFlight) {
    inFlight = createBrowserSupabase()
      .auth.getSession()
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        inFlight = null;
      });
  }
  // Non-null: the branch above just set it when it was null; the .finally() that clears it
  // back to null runs strictly after this synchronous return, not before.
  return inFlight!;
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void checkSession();
  });
}

// Await this before any request that depends on being authenticated. Deduped: many
// concurrent callers (e.g. one useNodeCost per node on a canvas) share the same in-flight
// check instead of each doing their own.
export function ensureFreshSession(): Promise<void> {
  return checkSession();
}

// Drop-in fetch() replacement for every authenticated client-side call to this app's own
// /api/* routes. Routes the request through ensureFreshSession() first so it can never be
// one of the racing callers described above — call this instead of bare fetch(), don't
// await ensureFreshSession() yourself and then call fetch() separately (that reintroduces
// the exact race this exists to close if a new call site copies the pattern wrong).
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  await ensureFreshSession();
  return fetch(input, init);
}
