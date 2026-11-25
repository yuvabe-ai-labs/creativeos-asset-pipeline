import { authFetch } from "@/lib/supabase/session-ready";
import type { MePayload } from "@/lib/me/types";
import { readJson } from "./read-json";

// cache: "no-store" is load-bearing: /api/me sends no cache headers, and a browser-cached first
// response would survive every later sign-in as someone else. authFetch refreshes an expired
// session first, through the browser client's one lock (see session-ready.ts).
export async function fetchMe(): Promise<MePayload> {
  const res = await authFetch("/api/me", { cache: "no-store" });
  return readJson<MePayload>(res, "Could not load your account.");
}
