# Stage 4 — Impersonation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a `super_admin` operator "view as" an agency org for support purposes — read-only
by default, audited, reversible — without a session swap or a standing cross-org bypass.

**Architecture:** A signed HttpOnly cookie carries `{ operatorId, targetOrgId, elevated,
expiresAt }`. `resolveOrgId()` (the single DAL chokepoint every org-scoped query already
calls) becomes impersonation-aware, re-validating the operator's *live* `super_admin` status
on every request. The four route-isolation helpers (`withClient`/`withCanvas`/`withNode`/
`withMoodboard`) gain a `req` parameter and use it to block writes while impersonating unless
elevated mode is on. Every session-start, elevated-mode-entry, write, and session-end writes
one row to an append-only `impersonation_audit_log` table.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + Auth), TypeScript, Vitest,
Node's built-in `crypto` (HMAC — no new signing dependency).

## Global Constraints

- Every interactive control is a shadcn primitive from `src/components/ui/*` (Base UI
  `render` prop, never `asChild`) — never a raw `<button>`.
- `apiError`/`apiOk` for all API responses; never `NextResponse.json(...)` directly.
- Follow existing file-splitting conventions: pure/testable logic separate from `server-only`
  I/O (mirrors `dal-logic.ts` vs `dal.ts`).
- 2-hour cookie TTL; elevated mode persists for the rest of the impersonation session once
  entered (does not reset per navigation).
- Design system: brand purple only on primary actions, neutrals elsewhere, easing
  `cubic-bezier(0.22,1,0.36,1)`, Lucide icons at 1.5 stroke.
- Spec: `docs/superpowers/specs/2026-08-04-impersonation-stage4-design.md`. ADR: D50, D51,
  D52, D81, D83, D85.

**Corrections from the spec, found during planning:** §4 point 3 named `copilot/actions`,
`nodes/duplicate-batch`, and `eval-bootstrap` as needing explicit standalone write-gate calls.
Verified against the actual code: `nodes/duplicate-batch` already routes through
`withCanvas()` (`route.ts:23`) and is covered by Task 7's helper change automatically.
`copilot/actions` performs no database mutation at all (D54 — the copilot only proposes,
never mutates server-side) — nothing to gate. `eval-bootstrap` is a temporary, single-hardcoded-client
dev tool explicitly marked "DELETE THIS ROUTE after the traces are generated," predates the
org-isolation system entirely (it has zero org checks today, not just zero impersonation
checks), and isn't reachable through any org-scoped route a support operator would hit —
out of scope, not a gap. This plan has no task for any of the three.

---

### Task 1: Migration — `impersonation_audit_log`

**Files:**
- Create: `supabase/migrations/0027_impersonation.sql`

**Interfaces:**
- Produces: table `impersonation_audit_log(id, operator_id, target_org_id, event_type,
  detail, occurred_at)` — consumed by Task 4's `logImpersonationEvent()`.

- [ ] **Step 1: Write the migration**

```sql
-- Stage 4 impersonation audit trail (D81). Append-only: one row per event
-- (session_started / elevated_mode_entered / write_action / session_ended), never
-- updated or deleted. No end-user read path exists or is planned — this is a support/
-- compliance trail, not app data — so RLS is enabled with zero policies, same as
-- org_memberships' Stage-1 pattern: the app's own access goes through the service-role
-- client (createServerSupabase()), which bypasses RLS regardless. This only closes the
-- direct-REST path, matching 0017_default_deny_rls.sql's rationale for every other table.

create table impersonation_audit_log (
  id             uuid primary key default gen_random_uuid(),
  operator_id    uuid not null references auth.users(id),
  target_org_id  uuid not null references organizations(id),
  event_type     text not null check (event_type in (
                   'session_started', 'elevated_mode_entered', 'write_action', 'session_ended'
                 )),
  detail         jsonb,
  occurred_at    timestamptz not null default now()
);

create index impersonation_audit_log_operator_idx on impersonation_audit_log(operator_id);
create index impersonation_audit_log_target_org_idx on impersonation_audit_log(target_org_id);

alter table impersonation_audit_log enable row level security;
```

- [ ] **Step 2: Apply to the local/staging Supabase project**

Supabase dashboard → staging project → SQL editor → paste and run. Verify:

```sql
select table_name from information_schema.tables
  where table_schema = 'public' and table_name = 'impersonation_audit_log';
-- expect 1 row

select tablename, rowsecurity from pg_tables where tablename = 'impersonation_audit_log';
-- expect rowsecurity = true

select policyname from pg_policies where tablename = 'impersonation_audit_log';
-- expect 0 rows (zero policies, deliberate — service-role only)
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0027_impersonation.sql
git commit -m "feat(db): add impersonation_audit_log (Stage 4, D81)"
```

---

### Task 2: Pure impersonation-cookie logic

**Files:**
- Create: `src/lib/auth/impersonation-logic.ts`
- Test: `src/lib/auth/impersonation-logic.test.ts`

**Interfaces:**
- Produces: `ImpersonationPayload` type, `encodeImpersonationCookie(payload, secret, now)`,
  `decodeImpersonationCookie(cookieValue, secret, now)` — consumed by Task 3.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { encodeImpersonationCookie, decodeImpersonationCookie } from "./impersonation-logic";

const SECRET = "test-secret-do-not-use-in-prod";
const NOW = new Date("2026-08-04T12:00:00.000Z");

const PAYLOAD = {
  operatorId: "op-1",
  targetOrgId: "org-2",
  elevated: false,
  expiresAt: new Date("2026-08-04T14:00:00.000Z").toISOString(), // +2h
};

describe("encodeImpersonationCookie / decodeImpersonationCookie", () => {
  it("round-trips a valid payload", () => {
    const cookie = encodeImpersonationCookie(PAYLOAD, SECRET);
    expect(decodeImpersonationCookie(cookie, SECRET, NOW)).toEqual(PAYLOAD);
  });

  it("rejects a tampered payload (signature mismatch)", () => {
    const cookie = encodeImpersonationCookie(PAYLOAD, SECRET);
    const [body] = cookie.split(".");
    const tampered = `${body}.0000000000000000000000000000000000000000000000000000000000000000`;
    expect(decodeImpersonationCookie(tampered, SECRET, NOW)).toBeNull();
  });

  it("rejects a payload signed with a different secret", () => {
    const cookie = encodeImpersonationCookie(PAYLOAD, "a-different-secret");
    expect(decodeImpersonationCookie(cookie, SECRET, NOW)).toBeNull();
  });

  it("rejects an expired payload", () => {
    const cookie = encodeImpersonationCookie(PAYLOAD, SECRET);
    const afterExpiry = new Date("2026-08-04T14:00:01.000Z");
    expect(decodeImpersonationCookie(cookie, SECRET, afterExpiry)).toBeNull();
  });

  it("accepts a payload exactly at its expiry instant", () => {
    const cookie = encodeImpersonationCookie(PAYLOAD, SECRET);
    const atExpiry = new Date(PAYLOAD.expiresAt);
    expect(decodeImpersonationCookie(cookie, SECRET, atExpiry)).toEqual(PAYLOAD);
  });

  it("rejects malformed cookie values", () => {
    expect(decodeImpersonationCookie("not-a-valid-cookie", SECRET, NOW)).toBeNull();
    expect(decodeImpersonationCookie("", SECRET, NOW)).toBeNull();
    expect(decodeImpersonationCookie("onlyonepart", SECRET, NOW)).toBeNull();
  });

  it("rejects a well-signed payload with the wrong shape", () => {
    // Signed correctly, but the JSON isn't an ImpersonationPayload (e.g. missing fields).
    const badPayload = { foo: "bar" };
    const cookie = encodeImpersonationCookie(badPayload as never, SECRET);
    expect(decodeImpersonationCookie(cookie, SECRET, NOW)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/auth/impersonation-logic.test.ts`
Expected: FAIL — `Cannot find module './impersonation-logic'`

- [ ] **Step 3: Write the implementation**

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

export type ImpersonationPayload = {
  operatorId: string;
  targetOrgId: string;
  elevated: boolean;
  expiresAt: string; // ISO 8601
};

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function isImpersonationPayload(value: unknown): value is ImpersonationPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.operatorId === "string" &&
    typeof v.targetOrgId === "string" &&
    typeof v.elevated === "boolean" &&
    typeof v.expiresAt === "string"
  );
}

// Cookie shape: base64url(JSON payload) + "." + hex(HMAC-SHA256 of that base64url string).
// No encryption — the payload isn't secret (an org id + operator id), only tamper-proof.
export function encodeImpersonationCookie(
  payload: ImpersonationPayload,
  secret: string,
): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

// Returns null (never throws) for any malformed, tampered, wrong-secret, or expired
// cookie — every failure mode collapses to "not impersonating," which is always the
// safe default. `now` is injected (not `new Date()` internally) so expiry is testable
// without faking the system clock.
export function decodeImpersonationCookie(
  cookieValue: string,
  secret: string,
  now: Date,
): ImpersonationPayload | null {
  const parts = cookieValue.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;

  const expectedSignature = sign(body, secret);
  const sigBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expectedSignature, "hex");
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!isImpersonationPayload(parsed)) return null;
  if (new Date(parsed.expiresAt).getTime() < now.getTime()) return null;

  return parsed;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/auth/impersonation-logic.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/impersonation-logic.ts src/lib/auth/impersonation-logic.test.ts
git commit -m "feat(auth): add pure impersonation cookie sign/verify logic"
```

---

### Task 3: Audit log writer

**Files:**
- Create: `src/lib/db/impersonation-audit.ts`
- Test: `src/lib/db/impersonation-audit.test.ts`

**Interfaces:**
- Consumes: `createServerSupabase()` from `@/lib/supabase/server`.
- Produces: `logImpersonationEvent(event: ImpersonationEvent): Promise<void>` — consumed by
  Task 4 (session lifecycle) and Task 6 (write-gate).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const insertMock = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    from: () => ({ insert: insertMock }),
  })),
}));

import { logImpersonationEvent } from "./impersonation-audit";

describe("logImpersonationEvent", () => {
  beforeEach(() => vi.resetAllMocks());

  it("inserts a session_started row with no detail", async () => {
    insertMock.mockResolvedValueOnce({ error: null });
    await logImpersonationEvent({
      operatorId: "op-1",
      targetOrgId: "org-2",
      eventType: "session_started",
    });
    expect(insertMock).toHaveBeenCalledWith({
      operator_id: "op-1",
      target_org_id: "org-2",
      event_type: "session_started",
      detail: null,
    });
  });

  it("inserts a write_action row with detail", async () => {
    insertMock.mockResolvedValueOnce({ error: null });
    await logImpersonationEvent({
      operatorId: "op-1",
      targetOrgId: "org-2",
      eventType: "write_action",
      detail: { method: "POST", path: "/api/clients/client-1" },
    });
    expect(insertMock).toHaveBeenCalledWith({
      operator_id: "op-1",
      target_org_id: "org-2",
      event_type: "write_action",
      detail: { method: "POST", path: "/api/clients/client-1" },
    });
  });

  it("swallows insert errors (audit logging must never break the request)", async () => {
    insertMock.mockResolvedValueOnce({ error: { message: "db down" } });
    await expect(
      logImpersonationEvent({ operatorId: "op-1", targetOrgId: "org-2", eventType: "session_ended" }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/db/impersonation-audit.test.ts`
Expected: FAIL — `Cannot find module './impersonation-audit'`

- [ ] **Step 3: Write the implementation**

```typescript
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

export type ImpersonationEventType =
  | "session_started"
  | "elevated_mode_entered"
  | "write_action"
  | "session_ended";

export type ImpersonationEvent = {
  operatorId: string;
  targetOrgId: string;
  eventType: ImpersonationEventType;
  detail?: Record<string, unknown>;
};

// Fire-and-forget from the caller's perspective: a failure to write the audit trail
// must never fail the underlying request (a blocked support operator is worse than a
// missed log line, and this table has no read path that depends on completeness for
// correctness elsewhere in the app). Logged to console so a persistently failing
// audit path is still discoverable in production logs.
export async function logImpersonationEvent(event: ImpersonationEvent): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase.from("impersonation_audit_log").insert({
    operator_id: event.operatorId,
    target_org_id: event.targetOrgId,
    event_type: event.eventType,
    detail: event.detail ?? null,
  });
  if (error) {
    console.error("Failed to write impersonation_audit_log row", event.eventType, error);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/db/impersonation-audit.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/impersonation-audit.ts src/lib/db/impersonation-audit.test.ts
git commit -m "feat(db): add impersonation audit log writer"
```

---

### Task 4: Impersonation session I/O (cookie read/write + live re-check)

**Files:**
- Create: `src/lib/auth/impersonation.ts`
- Test: `src/lib/auth/impersonation.test.ts`

**Interfaces:**
- Consumes: `encodeImpersonationCookie`/`decodeImpersonationCookie` (Task 2),
  `logImpersonationEvent` (Task 3), `resolveCallerContext` from `@/lib/dal`, `cookies` from
  `next/headers`.
- Produces: `resolveImpersonationState(): Promise<ImpersonationState>`,
  `startImpersonation(targetOrgId: string): Promise<void>`,
  `enterElevatedMode(): Promise<void>`, `endImpersonation(): Promise<void>` — consumed by
  Task 5 (`resolveOrgId`), Task 6 (route-helper gate), Task 8 (server actions), Task 9 (UI).

```typescript
export type ImpersonationState =
  | { isImpersonating: false }
  | { isImpersonating: true; operatorId: string; targetOrgId: string; elevated: boolean };
```

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// vi.hoisted() is required here: vi.mock() factories are hoisted above every other
// top-level statement (including plain `const`s), so a factory that closes over a
// later-declared `const` would read it before initialization (TDZ ReferenceError).
const { cookieStore, logMock } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
  logMock: vi.fn(async () => undefined),
}));

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));

vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({
    userId: "op-1",
    email: "op-1@yuvabe.com",
    platformRole: "super_admin",
    orgId: "yuvabe-org",
    orgRole: "owner",
    mustChangePassword: false,
  })),
}));

vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: logMock }));

import { resolveCallerContext } from "@/lib/dal";
import {
  resolveImpersonationState,
  startImpersonation,
  enterElevatedMode,
  endImpersonation,
} from "./impersonation";
import { encodeImpersonationCookie } from "./impersonation-logic";

const SECRET = "test-secret";

function validCookieValue(overrides: Partial<{ elevated: boolean; expiresAt: string }> = {}) {
  return encodeImpersonationCookie(
    {
      operatorId: "op-1",
      targetOrgId: "target-org",
      elevated: overrides.elevated ?? false,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
    SECRET,
  );
}

describe("resolveImpersonationState", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.IMPERSONATION_COOKIE_SECRET = SECRET;
  });

  it("returns not-impersonating when no cookie is set", async () => {
    cookieStore.get.mockReturnValue(undefined);
    await expect(resolveImpersonationState()).resolves.toEqual({ isImpersonating: false });
  });

  it("returns the impersonation state for a valid cookie", async () => {
    cookieStore.get.mockReturnValue({ value: validCookieValue({ elevated: true }) });
    await expect(resolveImpersonationState()).resolves.toEqual({
      isImpersonating: true,
      operatorId: "op-1",
      targetOrgId: "target-org",
      elevated: true,
    });
  });

  it("returns not-impersonating when the cookie is expired", async () => {
    cookieStore.get.mockReturnValue({
      value: validCookieValue({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
    });
    await expect(resolveImpersonationState()).resolves.toEqual({ isImpersonating: false });
  });

  it("returns not-impersonating when the operator's live role is no longer super_admin (D81)", async () => {
    cookieStore.get.mockReturnValue({ value: validCookieValue() });
    vi.mocked(resolveCallerContext).mockResolvedValueOnce({
      userId: "op-1",
      email: "op-1@yuvabe.com",
      platformRole: "member",
      orgId: "yuvabe-org",
      orgRole: "owner",
      mustChangePassword: false,
    });
    await expect(resolveImpersonationState()).resolves.toEqual({ isImpersonating: false });
  });

  it("returns not-impersonating when IMPERSONATION_COOKIE_SECRET is unset (fail closed)", async () => {
    delete process.env.IMPERSONATION_COOKIE_SECRET;
    cookieStore.get.mockReturnValue({ value: validCookieValue() });
    await expect(resolveImpersonationState()).resolves.toEqual({ isImpersonating: false });
  });
});

describe("startImpersonation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.IMPERSONATION_COOKIE_SECRET = SECRET;
  });

  it("sets the cookie and logs session_started", async () => {
    await startImpersonation("target-org");
    expect(cookieStore.set).toHaveBeenCalledTimes(1);
    const [name, value, options] = cookieStore.set.mock.calls[0];
    expect(name).toBe("impersonation");
    expect(typeof value).toBe("string");
    expect(options).toMatchObject({ httpOnly: true, path: "/" });
    expect(logMock).toHaveBeenCalledWith({
      operatorId: "op-1",
      targetOrgId: "target-org",
      eventType: "session_started",
    });
  });
});

describe("enterElevatedMode", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.IMPERSONATION_COOKIE_SECRET = SECRET;
  });

  it("re-sets the cookie with elevated: true and logs elevated_mode_entered", async () => {
    cookieStore.get.mockReturnValue({ value: validCookieValue({ elevated: false }) });
    await enterElevatedMode();
    expect(cookieStore.set).toHaveBeenCalledTimes(1);
    expect(logMock).toHaveBeenCalledWith({
      operatorId: "op-1",
      targetOrgId: "target-org",
      eventType: "elevated_mode_entered",
    });
  });

  it("no-ops when there is no active impersonation session", async () => {
    cookieStore.get.mockReturnValue(undefined);
    await enterElevatedMode();
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(logMock).not.toHaveBeenCalled();
  });
});

describe("endImpersonation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.IMPERSONATION_COOKIE_SECRET = SECRET;
  });

  it("deletes the cookie and logs session_ended", async () => {
    cookieStore.get.mockReturnValue({ value: validCookieValue() });
    await endImpersonation();
    expect(cookieStore.delete).toHaveBeenCalledWith("impersonation");
    expect(logMock).toHaveBeenCalledWith({
      operatorId: "op-1",
      targetOrgId: "target-org",
      eventType: "session_ended",
    });
  });

  it("no-ops when there is no active impersonation session", async () => {
    cookieStore.get.mockReturnValue(undefined);
    await endImpersonation();
    expect(cookieStore.delete).not.toHaveBeenCalled();
    expect(logMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/auth/impersonation.test.ts`
Expected: FAIL — `Cannot find module './impersonation'`

- [ ] **Step 3: Write the implementation**

```typescript
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

export async function endImpersonation(): Promise<void> {
  const secret = getSecret();
  const payload = secret ? await readPayload() : null;
  if (!payload) return; // no-op when there's no active session
  const store = await cookies();
  store.delete(COOKIE_NAME);
  await logImpersonationEvent({
    operatorId: payload.operatorId,
    targetOrgId: payload.targetOrgId,
    eventType: "session_ended",
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/auth/impersonation.test.ts`
Expected: PASS, 10 tests

- [ ] **Step 5: Add `IMPERSONATION_COOKIE_SECRET` to `.env.example`**

In `.env.example`, under the existing `# App` section, add:

```
# Stage 4 impersonation — HMAC secret for signing the impersonation cookie. Generate with:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
IMPERSONATION_COOKIE_SECRET=
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/impersonation.ts src/lib/auth/impersonation.test.ts .env.example
git commit -m "feat(auth): add impersonation session read/write with live role re-check"
```

---

### Task 5: `resolveOrgId()` becomes impersonation-aware

**Files:**
- Modify: `src/lib/dal.ts:53-58`
- Test: `src/lib/dal-logic.test.ts` is for pure logic only — `resolveOrgId` itself is
  exercised indirectly via Task 6's route-helper tests and Task 10's integration tests. No
  new direct test file for this task (it's a 3-line change with no new branching logic of
  its own — it delegates entirely to `resolveImpersonationState`, already covered by Task 4).

**Interfaces:**
- Consumes: `resolveImpersonationState` from `@/lib/auth/impersonation` (Task 4).
- Produces: `resolveOrgId(): Promise<string>` — unchanged signature, new behavior. Consumed
  by Task 6 (route helpers).

- [ ] **Step 1: Modify `resolveOrgId`**

Replace `src/lib/dal.ts:53-58`:

```typescript
// The org whose data the caller should see. In Stage 1C this is just their own org;
// Stage 4 layers impersonation on top by reading a cookie here.
export const resolveOrgId = cache(async (): Promise<string> => {
  const caller = await resolveCallerContext();
  return caller.orgId;
});
```

with:

```typescript
// The org whose data the caller should see. Defaults to the caller's own org; when a
// valid, live-re-checked impersonation session is active (Stage 4, D81), returns the
// target org instead. See src/lib/auth/impersonation.ts for the cookie mechanics.
export const resolveOrgId = cache(async (): Promise<string> => {
  const impersonation = await resolveImpersonationState();
  if (impersonation.isImpersonating) return impersonation.targetOrgId;

  const caller = await resolveCallerContext();
  return caller.orgId;
});
```

And add the import at the top of `src/lib/dal.ts`, alongside the existing ones:

```typescript
import { resolveImpersonationState } from "@/lib/auth/impersonation";
```

`impersonation.ts` (Task 4) also imports `resolveCallerContext` from this same file, so this
is a two-file circular import. It's safe here: both sides only reference the other's export
from inside an `async` function body (`resolveOrgId`'s and `resolveImpersonationState`'s),
never at module-evaluation time — ES module bindings are live references resolved on use, not
on import, so the cycle never gets read before it's ready. (Contrast with a cycle that reads
an import at the top level, e.g. `const X = importedValue` — that pattern breaks; a deferred
read inside a function does not.)

- [ ] **Step 2: Run the full test suite to confirm nothing broke**

Run: `npx vitest run`
Expected: same pass/fail counts as the Task 0 baseline (7 pre-existing unrelated failures in
`moodboards`/`drive-picker`/`file-upload`/`kling` tests — see the plan's baseline note below;
no *new* failures from this change, since no route yet calls `resolveOrgId()` — that's Task 6).

- [ ] **Step 3: Commit**

```bash
git add src/lib/dal.ts
git commit -m "feat(auth): wire resolveOrgId() to impersonation state (Stage 4)"
```

---

### Task 6: Write-gating in the route-isolation helpers

**Files:**
- Modify: `src/lib/api/route-helpers.ts`
- Test: Create `src/lib/api/route-helpers.test.ts`
- Modify (update existing mocks): `src/app/api/clients/[id]/moodboards/route.test.ts`,
  `src/app/api/moodboards/route.test.ts`, `src/app/api/moodboards/[id]/items/route.test.ts`,
  `src/app/api/nodes/[id]/file/drive/route.test.ts`

**Interfaces:**
- Consumes: `resolveOrgId` (Task 5), `resolveImpersonationState` (Task 4),
  `logImpersonationEvent` (Task 3).
- Produces: new signatures `withClient(req: Request, params, handler)`,
  `withCanvas(req: Request, params, handler)`, `withNode(req: Request, params, handler)`,
  `withMoodboard(req: Request, moodboardId: string, handler)` — every call site in Task 7
  must match these exactly.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/api/route-helpers.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({
    userId: "user-1",
    email: "user-1@yuvabe.com",
    platformRole: "member",
    orgId: "org-1",
    orgRole: "owner",
    mustChangePassword: false,
  })),
  resolveOrgId: vi.fn(async () => "org-1"),
}));

// vi.hoisted() required: vi.mock() factories are hoisted above plain top-level consts
// (same gotcha as Task 4's test file — see its comment for the full explanation).
const { resolveImpersonationStateMock, logMock } = vi.hoisted(() => ({
  resolveImpersonationStateMock: vi.fn(async () => ({ isImpersonating: false }) as const),
  logMock: vi.fn(async () => undefined),
}));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: resolveImpersonationStateMock,
}));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: logMock }));

vi.mock("@/lib/db/clients", () => ({
  getClientById: vi.fn(async () => ({ id: "client-1", name: "Acme", org_id: "org-1" })),
}));

import { withClient } from "./route-helpers";

const params = Promise.resolve({ id: "client-1" });
function req(method: string) {
  return new NextRequest("http://localhost/api/clients/client-1", { method });
}

describe("withClient write-gating", () => {
  beforeEach(() => vi.resetAllMocks());

  it("allows GET when not impersonating", async () => {
    resolveImpersonationStateMock.mockResolvedValue({ isImpersonating: false });
    const handler = vi.fn(async () => new Response(null, { status: 200 }));
    const res = await withClient(req("GET"), params, handler);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });

  it("allows POST when not impersonating", async () => {
    resolveImpersonationStateMock.mockResolvedValue({ isImpersonating: false });
    const handler = vi.fn(async () => new Response(null, { status: 200 }));
    const res = await withClient(req("POST"), params, handler);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });

  it("blocks POST when impersonating and not elevated", async () => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true, operatorId: "op-1", targetOrgId: "org-1", elevated: false,
    });
    const handler = vi.fn(async () => new Response(null, { status: 200 }));
    const res = await withClient(req("POST"), params, handler);
    expect(res.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("allows GET even when impersonating and not elevated", async () => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true, operatorId: "op-1", targetOrgId: "org-1", elevated: false,
    });
    const handler = vi.fn(async () => new Response(null, { status: 200 }));
    const res = await withClient(req("GET"), params, handler);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });

  it("allows POST when impersonating and elevated, and logs a write_action", async () => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true, operatorId: "op-1", targetOrgId: "org-1", elevated: true,
    });
    const handler = vi.fn(async () => new Response(null, { status: 200 }));
    const res = await withClient(req("POST"), params, handler);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith({
      operatorId: "op-1",
      targetOrgId: "org-1",
      eventType: "write_action",
      detail: { method: "POST", path: "/api/clients/client-1" },
    });
  });

  it("does not log write_action for a blocked write", async () => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true, operatorId: "op-1", targetOrgId: "org-1", elevated: false,
    });
    await withClient(req("POST"), params, vi.fn(async () => new Response(null, { status: 200 })));
    expect(logMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/api/route-helpers.test.ts`
Expected: FAIL — `withClient` doesn't accept `(req, params, handler)` yet (wrong arity /
`params.then` called on a `Request`).

- [ ] **Step 3: Modify `route-helpers.ts`**

Add near the top of the file (after the existing imports, before `unwrapEmbed`):

```typescript
import { resolveOrgId, resolveCallerContext, type CallerContext } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { logImpersonationEvent } from "@/lib/db/impersonation-audit";
```

(Replace the existing `import { resolveCallerContext, type CallerContext } from "@/lib/dal";`
line with the three-line block above — same source, adds `resolveOrgId`.)

Add this shared gate function (place it after `unwrapEmbed`, before the `RouteParams` type):

```typescript
// The Stage 4 write-gate (D81): while impersonating and not in elevated mode, every
// non-GET/HEAD request is blocked before its handler runs. Allowed writes while
// elevated are audit-logged here too, so every call site that adopts this gate gets
// both behaviors for free — no per-route bookkeeping.
async function assertImpersonationWriteAllowed(req: Request): Promise<AnyResponse | null> {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD") return null;

  const impersonation = await resolveImpersonationState();
  if (!impersonation.isImpersonating) return null;

  if (!impersonation.elevated) {
    return apiError(
      "Read-only while impersonating — enter elevated mode to make changes.",
      403,
    );
  }

  await logImpersonationEvent({
    operatorId: impersonation.operatorId,
    targetOrgId: impersonation.targetOrgId,
    eventType: "write_action",
    detail: { method, path: new URL(req.url).pathname },
  });
  return null;
}
```

Replace `withClient` (currently lines 43-60) with:

```typescript
export async function withClient(
  req: Request,
  params: Promise<{ id: string }>,
  handler: (clientId: string, client: ClientRow) => Promise<AnyResponse>,
): Promise<AnyResponse> {
  const { id: clientId } = await params;
  const client = await getClientById(clientId);
  if (!client) return apiError("Client not found.", 404);

  // Org isolation: a client outside the effective org (the caller's own org, or the
  // impersonation target when active — resolveOrgId() decides which) is a 404 (never
  // 403 — do not confirm foreign resources exist).
  const effectiveOrgId = await resolveOrgId();
  if (client.org_id !== effectiveOrgId) {
    return apiError("Client not found.", 404);
  }

  const blocked = await assertImpersonationWriteAllowed(req);
  if (blocked) return blocked;

  return handler(clientId, client);
}
```

Replace `withCanvas` (currently lines 73-95) with:

```typescript
export async function withCanvas(
  req: Request,
  params: Promise<{ id: string }>,
  handler: (canvasId: string, canvas: CanvasRow) => Promise<AnyResponse>,
): Promise<AnyResponse> {
  const { id: canvasId } = await params;
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvases")
    .select("*, clients!inner(org_id)")
    .eq("id", canvasId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return apiError("Canvas not found.", 404);

  const row = data as unknown as CanvasWithOrg;
  const client = unwrapEmbed(row.clients);
  const effectiveOrgId = await resolveOrgId();
  if (!client || client.org_id !== effectiveOrgId) {
    return apiError("Canvas not found.", 404);
  }

  const blocked = await assertImpersonationWriteAllowed(req);
  if (blocked) return blocked;

  const { clients: _clients, ...canvas } = row;
  return handler(canvasId, canvas as CanvasRow);
}
```

Replace `withNode` (currently lines 114-142) with:

```typescript
export async function withNode(
  req: Request,
  params: Promise<{ id: string }>,
  handler: (
    nodeId: string,
    node: NodeRow,
    caller: CallerContext,
    clientId: string,
  ) => Promise<AnyResponse>,
): Promise<AnyResponse> {
  const { id: nodeId } = await params;
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("nodes")
    .select("*, canvases!inner(client_id, clients!inner(org_id))")
    .eq("id", nodeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return apiError("Node not found.", 404);

  const row = data as unknown as NodeWithOrgChain;
  const canvas = unwrapEmbed(row.canvases);
  const client = canvas ? unwrapEmbed(canvas.clients) : null;
  const effectiveOrgId = await resolveOrgId();
  if (!canvas || !client || client.org_id !== effectiveOrgId) {
    return apiError("Node not found.", 404);
  }

  const blocked = await assertImpersonationWriteAllowed(req);
  if (blocked) return blocked;

  const caller = await resolveCallerContext();
  const { canvases: _canvases, ...node } = row;
  return handler(nodeId, node as NodeRow, caller, canvas.client_id);
}
```

Replace `withMoodboard` (currently lines 156-175) with:

```typescript
export async function withMoodboard(
  req: Request,
  moodboardId: string,
  handler: (moodboardId: string, caller: CallerContext) => Promise<AnyResponse>,
): Promise<AnyResponse> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("moodboards")
    .select("id, clients!inner(org_id)")
    .eq("id", moodboardId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return apiError("Moodboard not found.", 404);

  const client = unwrapEmbed((data as unknown as MoodboardWithOrg).clients);
  const effectiveOrgId = await resolveOrgId();
  if (!client || client.org_id !== effectiveOrgId) {
    return apiError("Moodboard not found.", 404);
  }

  const blocked = await assertImpersonationWriteAllowed(req);
  if (blocked) return blocked;

  const caller = await resolveCallerContext();
  return handler(moodboardId, caller);
}
```

- [ ] **Step 4: Update the 4 existing route tests' mocks**

Each of these currently has `vi.mock("@/lib/dal", () => ({ resolveCallerContext: ... }))`.
Add a `resolveOrgId` export returning the same `orgId` the mock's `resolveCallerContext`
already uses, plus mock `@/lib/auth/impersonation` and `@/lib/db/impersonation-audit` (both
default to "not impersonating" / no-op, so existing behavior is unchanged). And every
`withClient(params, ...)` / `withMoodboard(id, ...)` call inside the actual route files these
tests exercise now needs `req` threaded — that's Task 7, done together with this step so
these 4 tests go green in the same commit as Task 7's corresponding files.

In `src/app/api/clients/[id]/moodboards/route.test.ts`, `src/app/api/moodboards/route.test.ts`,
and `src/app/api/moodboards/[id]/items/route.test.ts`, change:

```typescript
vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({
    userId: "user-1",
    platformRole: "member",
    orgId: "org-1",
    orgRole: "owner",
    mustChangePassword: false,
  })),
}));
```

to:

```typescript
vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({
    userId: "user-1",
    platformRole: "member",
    orgId: "org-1",
    orgRole: "owner",
    mustChangePassword: false,
  })),
  resolveOrgId: vi.fn(async () => "org-1"),
}));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })),
}));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn(async () => undefined) }));
```

(Match each file's actual `orgId` value used in its existing mock — all three currently use
`"org-1"`, confirmed by reading each file in this task.)

`src/app/api/nodes/[id]/file/drive/route.test.ts` mocks `@/lib/dal` similarly — apply the
same three-block addition there, matching its existing `orgId` value (read the file first to
confirm the exact value before editing, per this project's edit-tool requirement).

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/lib/api/route-helpers.test.ts`
Expected: FAIL still for the 4 route tests at this point (their route files haven't been
updated to pass `req` yet — that's Task 7). `route-helpers.test.ts` itself should PASS (6
tests) since it calls `withClient` directly with the new signature.

- [ ] **Step 6: Commit**

```bash
git add src/lib/api/route-helpers.ts src/lib/api/route-helpers.test.ts \
  src/app/api/clients/[id]/moodboards/route.test.ts \
  src/app/api/moodboards/route.test.ts \
  src/app/api/moodboards/[id]/items/route.test.ts \
  src/app/api/nodes/[id]/file/drive/route.test.ts
git commit -m "feat(api): thread req through route-isolation helpers, add Stage 4 write-gate"
```

---

### Task 7: Thread `req` through every route-helper call site

**Files:** all 46 files below (also listed with exact line numbers, gathered by grepping
`src/app/api` for `with(Client|Canvas|Node|Moodboard)\(` during planning — re-run the same
grep before starting in case files changed since):

```
src/app/api/canvas/[id]/cost/route.ts:11
src/app/api/canvas/[id]/generations/route.ts:18
src/app/api/canvases/[cid]/lock/release/route.ts:15
src/app/api/clients/[id]/drive-folder/route.ts:8
src/app/api/clients/[id]/kb/active/route.ts:10
src/app/api/clients/[id]/kb/documents/route.ts:25,81
src/app/api/clients/[id]/kb/documents/finalize/route.ts:12
src/app/api/clients/[id]/kb/documents/sign/route.ts:17
src/app/api/clients/[id]/kb/images/route.ts:24,73
src/app/api/clients/[id]/kb/images/finalize/route.ts:12
src/app/api/clients/[id]/kb/images/sign/route.ts:17
src/app/api/clients/[id]/kb/re-extract/route.ts:51
src/app/api/clients/[id]/kb/ready/route.ts:15
src/app/api/clients/[id]/logo/route.ts:18
src/app/api/clients/[id]/logo/finalize/route.ts:12
src/app/api/clients/[id]/logo/sign/route.ts:11
src/app/api/clients/[id]/moodboards/route.ts:6,13
src/app/api/clients/[id]/route.ts:15
src/app/api/clients/[id]/website-url/route.ts:17
src/app/api/moodboards/[id]/route.ts:7
src/app/api/moodboards/[id]/items/route.ts:7,15
src/app/api/moodboards/[id]/items/[itemId]/route.ts:10
src/app/api/nodes/duplicate-batch/route.ts:23
src/app/api/nodes/[id]/compile-preview/route.ts:12
src/app/api/nodes/[id]/compose/route.ts:17,43
src/app/api/nodes/[id]/compose/select/route.ts:11
src/app/api/nodes/[id]/cost/route.ts:11
src/app/api/nodes/[id]/duplicate/route.ts:8
src/app/api/nodes/[id]/file/route.ts:27,116
src/app/api/nodes/[id]/file/drive/route.ts:27
src/app/api/nodes/[id]/file/extract/route.ts:14
src/app/api/nodes/[id]/generate/route.ts:38
src/app/api/nodes/[id]/image-generate/route.ts:43
src/app/api/nodes/[id]/image-generate/estimate/route.ts:13
src/app/api/nodes/[id]/parse/route.ts:15
src/app/api/nodes/[id]/restore-version/route.ts:11
src/app/api/nodes/[id]/upstream-images/route.ts:8
src/app/api/nodes/[id]/versions/route.ts:12
src/app/api/nodes/[id]/video-generate/route.ts:29
src/app/api/nodes/[id]/video-prompt/route.ts:37
```

**Interfaces:**
- Consumes: `withClient`/`withCanvas`/`withNode`/`withMoodboard` with the new `(req, ...)`
  signatures from Task 6.

- [ ] **Step 1: Apply the mechanical transformation to every file above**

For each file:
1. Open it. Find the exported `GET`/`POST`/`PATCH`/`DELETE` function(s) that call
   `withClient(params, ...)`, `withCanvas(params, ...)` (or `withCanvas(Promise.resolve(...), ...)`),
   `withNode(params, ...)`, or `withMoodboard(id, ...)`.
2. Confirm the handler's first parameter is a named `Request`/`NextRequest` (it always is —
   Next.js route handler convention. If it's currently prefixed `_req`/`_request` because it
   was previously unused, rename it to `req`/`request` at both the parameter and every call
   site inside that function, since it's used now.)
3. Add that identifier as the new first argument:
   - `withClient(params, handler)` → `withClient(req, params, handler)`
   - `withCanvas(params, handler)` → `withCanvas(req, params, handler)`
   - `withCanvas(Promise.resolve({ id: X }), handler)` → `withCanvas(req, Promise.resolve({ id: X }), handler)`
   - `withNode(params, handler)` → `withNode(req, params, handler)`
   - `withMoodboard(id, handler)` → `withMoodboard(req, id, handler)`

Example (`src/app/api/clients/[id]/route.ts`, full file, showing the transformation applied):

```typescript
import {
  apiError,
  apiOk,
  withClient,
  withTryCatch,
} from "@/lib/api/route-helpers";
import { setClientArchived } from "@/lib/db/clients";
import { parseArchivedBody } from "@/lib/clients/parse-archived-body";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(req, params, (clientId) =>
    withTryCatch("Archive update failed", async () => {
      const archived = parseArchivedBody(await req.json().catch(() => null));
      if (archived === null) {
        return apiError("`archived` must be a boolean.", 400);
      }
      await setClientArchived(clientId, archived);
      return apiOk({ ok: true });
    }),
  );
}
```

(Only the `withClient(req, params, ...)` line changed — everything else in this file was
already correct.)

- [ ] **Step 2: Compiler-verify complete coverage**

Run: `npx tsc --noEmit`
Expected: initially, one type error per file not yet updated (old call sites pass `params`
— a `Promise`— where `req: Request` is now expected). Fix each reported file using Step 1's
rule and re-run until: `Expected: 0 errors`. This is the authoritative completeness check —
trust it over the file list above (the list was correct at planning time, but the compiler
catches any file that changed since).

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: the 4 tests updated in Task 6 Step 4 now PASS (their route files pass `req`
correctly now). Same 7 pre-existing unrelated failures as the Task-0 baseline, no new
failures.

- [ ] **Step 4: Commit**

```bash
git add src/app/api
git commit -m "feat(api): thread req through all withClient/withCanvas/withNode/withMoodboard call sites"
```

---

### Task 8: Server actions — enter / elevate / exit

**Files:**
- Create: `src/lib/actions/impersonation.ts`
- Test: `src/lib/actions/impersonation.test.ts`

**Interfaces:**
- Consumes: `requireSuperAdmin` from `@/lib/auth/require-super-admin`, `startImpersonation`/
  `enterElevatedMode`/`endImpersonation` from `@/lib/auth/impersonation` (Task 4).
- Produces: `enterImpersonationAction(orgId: string): Promise<void>`,
  `enterElevatedModeAction(): Promise<void>`, `exitImpersonationAction(): Promise<void>` —
  consumed by Task 9 (UI).

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

vi.mock("@/lib/auth/require-super-admin", () => ({ requireSuperAdmin: vi.fn(async () => undefined) }));

const startImpersonationMock = vi.fn(async () => undefined);
const enterElevatedModeMock = vi.fn(async () => undefined);
const endImpersonationMock = vi.fn(async () => undefined);
vi.mock("@/lib/auth/impersonation", () => ({
  startImpersonation: startImpersonationMock,
  enterElevatedMode: enterElevatedModeMock,
  endImpersonation: endImpersonationMock,
}));

import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import {
  enterImpersonationAction,
  enterElevatedModeAction,
  exitImpersonationAction,
} from "./impersonation";

describe("impersonation server actions", () => {
  beforeEach(() => vi.resetAllMocks());

  it("enterImpersonationAction requires super_admin, starts the session, redirects to /", async () => {
    await expect(enterImpersonationAction("org-2")).rejects.toThrow("REDIRECT:/");
    expect(requireSuperAdmin).toHaveBeenCalled();
    expect(startImpersonationMock).toHaveBeenCalledWith("org-2");
  });

  it("enterElevatedModeAction requires super_admin and flips elevated mode, no redirect", async () => {
    await enterElevatedModeAction();
    expect(requireSuperAdmin).toHaveBeenCalled();
    expect(enterElevatedModeMock).toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("exitImpersonationAction ends the session and redirects to /admin/orgs/[id]", async () => {
    await expect(exitImpersonationAction("org-2")).rejects.toThrow("REDIRECT:/admin/orgs/org-2");
    expect(endImpersonationMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/actions/impersonation.test.ts`
Expected: FAIL — `Cannot find module './impersonation'`

- [ ] **Step 3: Write the implementation**

```typescript
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { startImpersonation, enterElevatedMode, endImpersonation } from "@/lib/auth/impersonation";

export async function enterImpersonationAction(orgId: string): Promise<void> {
  await requireSuperAdmin();
  await startImpersonation(orgId);
  redirect("/");
}

// No redirect — stays on whatever page the operator was viewing (D81's "stays elevated
// for the rest of the session" call means this is a one-time toggle, not a per-page one).
export async function enterElevatedModeAction(): Promise<void> {
  await requireSuperAdmin();
  await enterElevatedMode();
  revalidatePath("/", "layout"); // refresh the banner's "Elevated" badge everywhere
}

export async function exitImpersonationAction(orgId: string): Promise<void> {
  await endImpersonation();
  redirect(`/admin/orgs/${orgId}`);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/actions/impersonation.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/impersonation.ts src/lib/actions/impersonation.test.ts
git commit -m "feat(actions): add enter/elevate/exit impersonation server actions"
```

---

### Task 9: UI — entry point + persistent banner

**Files:**
- Create: `src/components/layout/impersonation-banner.tsx`
- Create: `src/app/admin/orgs/[id]/enter-impersonation-button.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/admin/orgs/[id]/page.tsx`

**Interfaces:**
- Consumes: `resolveImpersonationState` (Task 4), `enterImpersonationAction`/
  `enterElevatedModeAction`/`exitImpersonationAction` (Task 8), `getOrgById` from
  `@/lib/db/organizations`, `Button` and `Badge` from `@/components/ui/*`.

- [ ] **Step 1: Create the banner component**

`src/components/layout/impersonation-banner.tsx`:

```typescript
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getOrgById } from "@/lib/db/organizations";
import { ImpersonationBannerActions } from "./impersonation-banner-actions";

// Server component: resolves impersonation state + the target org's display name, then
// hands off to the client component for the two interactive buttons. Renders nothing
// when not impersonating — no layout shift, no empty bar.
export async function ImpersonationBanner() {
  const state = await resolveImpersonationState();
  if (!state.isImpersonating) return null;

  const org = await getOrgById(state.targetOrgId);
  if (!org) return null; // org deleted mid-session — fail closed, banner just disappears

  return (
    <div className="flex h-9 items-center justify-center gap-3 bg-muted px-4 text-sm text-foreground">
      <span>
        Viewing as <span className="font-semibold">{org.name}</span>
      </span>
      <ImpersonationBannerActions orgId={org.id} elevated={state.elevated} />
    </div>
  );
}
```

- [ ] **Step 2: Create the client-side action buttons**

`src/components/layout/impersonation-banner-actions.tsx`:

```typescript
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  enterElevatedModeAction,
  exitImpersonationAction,
} from "@/lib/actions/impersonation";

export function ImpersonationBannerActions({
  orgId,
  elevated,
}: {
  orgId: string;
  elevated: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {elevated ? (
        <Badge variant="destructive">Elevated</Badge>
      ) : (
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              try {
                await enterElevatedModeAction();
              } catch {
                setError("Failed to enter elevated mode.");
              }
            })
          }
        >
          Enter elevated mode
        </Button>
      )}
      <Button
        type="button"
        size="xs"
        variant="ghost"
        disabled={isPending}
        onClick={() => startTransition(() => exitImpersonationAction(orgId))}
      >
        Exit
      </Button>
      {error && <span className="text-destructive">{error}</span>}
    </div>
  );
}
```

`exitImpersonationAction` calls `redirect()`, which Next.js's client runtime handles as
navigation when the action is invoked this way — no explicit `.then()` needed.

- [ ] **Step 3: Wire the banner into the root layout**

Modify `src/app/layout.tsx`. Add the import:

```typescript
import { ImpersonationBanner } from "@/components/layout/impersonation-banner";
```

Make `RootLayout` async and render the banner directly under the header. Change:

```typescript
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
```

to:

```typescript
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
```

and change the body:

```typescript
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between border-b border-border/80 bg-background/80 px-6 backdrop-blur-md">
          <HeaderBrand />
          <HeaderActions />
        </header>
        {children}
        <Toaster />
      </body>
```

to:

```typescript
      <body className="min-h-full flex flex-col">
        <ImpersonationBanner />
        <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between border-b border-border/80 bg-background/80 px-6 backdrop-blur-md">
          <HeaderBrand />
          <HeaderActions />
        </header>
        {children}
        <Toaster />
      </body>
```

(Banner sits above the sticky header, not inside it, so it never scrolls under the header's
own `sticky top-0`.)

- [ ] **Step 4: Add the entry-point button**

`src/app/admin/orgs/[id]/enter-impersonation-button.tsx`:

```typescript
"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { enterImpersonationAction } from "@/lib/actions/impersonation";

export function EnterImpersonationButton({ orgId }: { orgId: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() => startTransition(() => enterImpersonationAction(orgId))}
    >
      Enter as this org
    </Button>
  );
}
```

- [ ] **Step 5: Add it to the org detail page header**

Modify `src/app/admin/orgs/[id]/page.tsx`. Add the import:

```typescript
import { EnterImpersonationButton } from "./enter-impersonation-button";
```

Change:

```typescript
      <h1 className="mb-8 font-display text-2xl font-semibold tracking-tight">
        {org.name}
      </h1>
```

to:

```typescript
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {org.name}
        </h1>
        <EnterImpersonationButton orgId={org.id} />
      </div>
```

- [ ] **Step 6: Manual verification (this repo's UI has no component-level test harness for pages)**

Run: `npm run dev`, sign in as the bootstrapped `super_admin`, navigate to
`/admin/orgs/[id]` for a non-Yuvabe org. Confirm:
- "Enter as this org" is visible and clicking it redirects to `/` with the banner showing
  "Viewing as {Org}".
- The app now shows that org's clients/canvases, not the operator's own.
- Attempting a mutating action (e.g. archiving a client) is rejected — check the network
  tab for a `403` with the read-only message.
- Clicking "Enter elevated mode" shows the "Elevated" badge; the same mutating action now
  succeeds.
- Clicking "Exit" returns to `/admin/orgs/[id]` and the banner disappears; the operator's
  own org's data shows again everywhere else in the app.

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/impersonation-banner.tsx \
  src/components/layout/impersonation-banner-actions.tsx \
  src/app/admin/orgs/[id]/enter-impersonation-button.tsx \
  src/app/layout.tsx src/app/admin/orgs/[id]/page.tsx
git commit -m "feat(ui): add impersonation entry point and persistent banner"
```

---

### Task 10: Checklist-driven integration tests

**Files:**
- Create: `src/lib/auth/impersonation-flow.test.ts`

This covers the rollout plan's Stage 4 shippable checklist end-to-end, at the unit-integration
level (mocking Supabase and Next's `cookies()`, not a real server) — the individual pieces
are already covered by Tasks 2–8's unit tests; this task specifically exercises the
*sequences* the checklist calls out, which no single earlier test does on its own.

**Interfaces:**
- Consumes: everything from Tasks 3, 4, 5, 6 (real, undtestable modules wired together — only
  `next/headers`, `@/lib/dal`'s `resolveCallerContext`, and `@/lib/supabase/server` are
  mocked).

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

// vi.hoisted() required for every value a vi.mock() factory below closes over — mock
// factories are hoisted above plain top-level const/let declarations (same gotcha
// documented in Tasks 4 and 6's test files).
const { cookieJar, cookieStore, auditRows, liveRoleBox } = vi.hoisted(() => {
  const jar = new Map<string, { value: string }>();
  return {
    cookieJar: jar,
    cookieStore: {
      get: vi.fn((name: string) => jar.get(name)),
      set: vi.fn((name: string, value: string) => jar.set(name, { value })),
      delete: vi.fn((name: string) => jar.delete(name)),
    },
    auditRows: [] as Record<string, unknown>[],
    liveRoleBox: { current: "super_admin" as "super_admin" | "member" },
  };
});

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));

vi.mock("@/lib/dal", async () => {
  const actual = await vi.importActual<typeof import("@/lib/dal")>("@/lib/dal");
  return {
    ...actual,
    resolveCallerContext: vi.fn(async () => ({
      userId: "op-1",
      email: "operator@yuvabe.com",
      platformRole: liveRoleBox.current,
      orgId: "yuvabe-org",
      orgRole: "owner",
      mustChangePassword: false,
    })),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        if (table === "impersonation_audit_log") auditRows.push(row);
        return { error: null };
      },
    }),
  })),
}));

vi.mock("@/lib/db/clients", () => ({
  getClientById: vi.fn(async () => ({ id: "client-1", name: "Acme", org_id: "target-org" })),
}));

process.env.IMPERSONATION_COOKIE_SECRET = "test-secret";

import { startImpersonation, enterElevatedMode, endImpersonation, resolveImpersonationState } from "./impersonation";
import { withClient } from "@/lib/api/route-helpers";

const params = Promise.resolve({ id: "client-1" });
function req(method: string) {
  return new NextRequest("http://localhost/api/clients/client-1", { method });
}

describe("Stage 4 impersonation — checklist scenarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieJar.clear();
    auditRows.length = 0;
    liveRoleBox.current = "super_admin";
  });

  it("entering impersonation resolves the target org's data", async () => {
    await startImpersonation("target-org");
    const res = await withClient(req("GET"), params, async () => new Response("ok"));
    expect(res.status).toBe(200); // client-1 belongs to target-org, so it resolves — not a 404
  });

  it("a write while non-elevated is blocked", async () => {
    await startImpersonation("target-org");
    const res = await withClient(req("POST"), params, async () => new Response("ok"));
    expect(res.status).toBe(403);
  });

  it("enter elevated -> write -> exit produces exactly 3 ordered audit rows", async () => {
    await startImpersonation("target-org");
    await enterElevatedMode();
    await withClient(req("POST"), params, async () => new Response("ok"));
    await endImpersonation();

    expect(auditRows.map((r) => r.event_type)).toEqual([
      "session_started",
      "elevated_mode_entered",
      "write_action",
      "session_ended",
    ]);
  });

  it("revoking platform_role mid-session ends impersonation on the very next request", async () => {
    await startImpersonation("target-org");
    expect((await resolveImpersonationState()).isImpersonating).toBe(true);

    liveRoleBox.current = "member"; // operator demoted mid-session
    expect((await resolveImpersonationState()).isImpersonating).toBe(false);
  });

  it("exit clears the cookie", async () => {
    await startImpersonation("target-org");
    await endImpersonation();
    expect(cookieJar.has("impersonation")).toBe(false);
    expect((await resolveImpersonationState()).isImpersonating).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails, then passes**

Run: `npx vitest run src/lib/auth/impersonation-flow.test.ts`
First run may fail if any mock shape drifted from the real modules during Tasks 2–9 — fix by
matching this test's mocks to whatever the real function signatures ended up being (not the
reverse; the earlier tasks' implementations are authoritative).
Expected once fixed: PASS, 5 tests

- [ ] **Step 3: Run the entire suite one final time**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 type errors; same 7 pre-existing unrelated failures as the Task-0 baseline (or
fewer, if they've since been fixed elsewhere); every impersonation-related test passing.

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth/impersonation-flow.test.ts
git commit -m "test(auth): add Stage 4 checklist-driven integration tests"
```

---

## Baseline note (from planning, not a task)

Before Task 1, the worktree's baseline `npm test -- --run` showed 7 pre-existing failing
test files unrelated to auth: `moodboards/route.test.ts` (a 5th, different, moodboards
test than the ones Task 6 touches — verify no overlap when running), `drive/picker-token`,
`nodes/[id]/file/drive`, `nodes/[id]/file/from-url`, `kling-provider`. These time out because
their tests don't mock `@/lib/dal`'s `resolveCallerContext` and instead let it run for real
against network-dependent Supabase auth calls — a pre-existing gap, not something this plan's
tasks introduce or need to fix. Confirm the failing set doesn't grow after Task 7 (Step 3
already checks this); if it shrinks, that's a bonus, not a requirement.
