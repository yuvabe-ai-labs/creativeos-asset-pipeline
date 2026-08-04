import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { resolveCallerContext } from "@/lib/dal";
import { logImpersonationEvent } from "@/lib/db/impersonation-audit";
import {
  encodeImpersonationCookie,
  decodeImpersonationCookie,
  type ImpersonationPayload,
} from "./impersonation-logic";

export type ImpersonationState =
  | { isImpersonating: false }
  | { isImpersonating: true; operatorId: string; targetOrgId: string; elevated: boolean };

const COOKIE_NAME = "impersonation";
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// Missing secret fails closed (nobody can be impersonating) rather than throwing —
// this runs on every request via resolveOrgId(), so a missing env var must degrade to
// "impersonation unavailable," not "the entire app 500s."
function getSecret(): string | null {
  const secret = process.env.IMPERSONATION_COOKIE_SECRET;
  if (!secret) {
    console.error("IMPERSONATION_COOKIE_SECRET is not set — impersonation is disabled");
    return null;
  }
  return secret;
}

async function readPayload(): Promise<ImpersonationPayload | null> {
  const secret = getSecret();
  if (!secret) return null;
  const store = await cookies();
  const raw = store.get(COOKIE_NAME);
  if (!raw) return null;
  return decodeImpersonationCookie(raw.value, secret, new Date());
}

// Cached per request like resolveCallerContext/resolveOrgId — this reads the cookie
// AND re-validates the operator's live super_admin status (D81: revoking the role mid-
// session must end impersonation on the very next request, not just at cookie-set time).
export const resolveImpersonationState = cache(async (): Promise<ImpersonationState> => {
  const payload = await readPayload();
  if (!payload) return { isImpersonating: false };

  const caller = await resolveCallerContext();
  if (caller.userId !== payload.operatorId || caller.platformRole !== "super_admin") {
    return { isImpersonating: false };
  }

  return {
    isImpersonating: true,
    operatorId: payload.operatorId,
    targetOrgId: payload.targetOrgId,
    elevated: payload.elevated,
  };
});

// Shared by startImpersonation and enterElevatedMode — same options object both times
// (two call sites: extract, per this project's reuse rule).
async function setImpersonationCookie(payload: ImpersonationPayload, secret: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, encodeImpersonationCookie(payload, secret), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(payload.expiresAt),
  });
}

// Called from the "Enter as this org" server action (Task 8). Caller must already be
// verified super_admin (requireSuperAdmin()) — this function trusts its caller.
export async function startImpersonation(targetOrgId: string): Promise<void> {
  const secret = getSecret();
  if (!secret) return;
  const caller = await resolveCallerContext();
  const payload: ImpersonationPayload = {
    operatorId: caller.userId,
    targetOrgId,
    elevated: false,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  };
  await setImpersonationCookie(payload, secret);
  await logImpersonationEvent({
    operatorId: payload.operatorId,
    targetOrgId,
    eventType: "session_started",
  });
}

// Flips elevated: true on the existing cookie, keeping the same expiresAt (elevated
// mode doesn't extend the 2h session TTL). No-ops if there's no active session — the
// "Enter elevated mode" button should be unreachable in that state anyway (Task 9),
// this is defense against a stale client re-submitting the action.
export async function enterElevatedMode(): Promise<void> {
  const secret = getSecret();
  if (!secret) return;
  const payload = await readPayload();
  if (!payload) return;
  await setImpersonationCookie({ ...payload, elevated: true }, secret);
  await logImpersonationEvent({
    operatorId: payload.operatorId,
    targetOrgId: payload.targetOrgId,
    eventType: "elevated_mode_entered",
  });
}

// No-ops if there's no active impersonation session — nothing to clear, and logging an
// end event with no corresponding start would pollute the audit trail.
export async function endImpersonation(): Promise<void> {
  const secret = getSecret();
  const payload = secret ? await readPayload() : null;
  if (!payload) return;
  const store = await cookies();
  store.delete(COOKIE_NAME);
  await logImpersonationEvent({
    operatorId: payload.operatorId,
    targetOrgId: payload.targetOrgId,
    eventType: "session_ended",
  });
}
