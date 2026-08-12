"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";
import { notifyIfReadOnlyBlocked } from "@/lib/auth/read-only-notice";

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

// Real connectivity loss (WiFi handoff, laptop sleep/wake, mobile network switch) is the
// same failure shape as a backgrounded tab: requests queue up while offline, then all fire
// together the moment the browser comes back — racing the same rotating refresh token.
// visibilitychange alone misses this (the tab can stay visible the whole time), so the
// browser's own connectivity signal needs its own proactive check.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => void checkSession());
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
  const res = await fetch(input, init);
  // Surface an impersonation write-block here rather than leaving each call site to
  // report it as its own generic failure. Reads and every other status fall straight
  // through — this only inspects 403s.
  await notifyIfReadOnlyBlocked(res);
  return res;
}
