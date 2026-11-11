# Permission-based access, plan 2 of 4: the browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The browser knows each person's permissions from the first HTML, and every screen shows only what that person may do: read-only canvases, disabled Generate with a reason, hidden actions they can't take.

**Architecture:**
- **Delivery:** `/api/me` and the root layout build one payload (packed CASL rules, client scope, preset name, credit figures only with `credits.view`). The layout hands it to an `AccessProvider`, which seeds the `meKeys.current()` TanStack query and builds one CASL ability.
- **Freshness:** the query refetches on window focus; any 403 from our API invalidates it (one signal module, fed by the two fetch funnels `readJson` and `authFetch`). A new payload updates the ability in place with `ability.update(rules)`.
- **Rendering:** components ask `useCan(key, clientId?)` (an in-memory check against the one ability in context). Generate buttons go through one `GatedButton`. The canvas without `canvases.edit` opens without taking the edit lock, so the existing read-only path (D33) does the rest.

**Tech Stack:**
- Next.js 16 App Router (root layout is a Server Component)
- TanStack Query v5 (`@tanstack/react-query` 5.104)
- `@casl/ability` 7.0.3 (already installed) and `@casl/react` 7.0.1 (new)
- shadcn on Base UI (`Button`, `Tooltip`), React Flow (`@xyflow/react`)
- Vitest in the `node` environment; component tests render with `renderToStaticMarkup`

**Spec:** [docs/superpowers/specs/2026-11-11-permission-based-access-design.md](../specs/2026-11-11-permission-based-access-design.md) §6 (D493). Plan 1: [2026-11-11-permission-access-core.md](2026-11-11-permission-access-core.md).

**The four plans:**
1. Server-side access (done, `feat/permission-access-core` @ 97e29049).
2. This one: the browser.
3. Team page and invites (Resend).
4. Preset editor on `/admin`.

## Global Constraints

- **Branch:** `feat/permission-access-browser`, stacked on `feat/permission-access-core`. Work in the worktree `C:/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm`. Never use bare `git stash`.
- **Commits:** no Claude/AI attribution of any kind: no `Co-Authored-By` trailer, no "Generated with" line. One commit per task. Check with `git log -1 --format=%B` after each commit.
- **Dependencies:** exact pins only (`npm install --save-exact`), nothing published less than two weeks before install. `@casl/react` is `7.0.1` (published 2026-07-06; peer range `@casl/ability ^4 || ^5.1 || ^6 || ^7`, `react ^18 || ^19`). 7.1.0 was published 2026-10-28T15:05Z, under two full weeks before 2026-11-11, so it is not used.
- **CASL usage:**
  - Rules are built only on the server, from catalogue keys and database ids (plan 1). The browser only unpacks what the server sent.
  - Never call `rulesToFields`.
  - Components never import `@casl/ability` or `@casl/react` directly. They use `src/components/permissions/*` and `src/lib/permissions/browser.ts`.
- **Check capabilities, never preset names.** No comparison against `presetKey` in `src/components` or `src/hooks` (Task 12 makes it a lint error).
- **Performance:**
  - The first render needs no `/api/me` request.
  - A per-node component reads the ability from context: no fetch, no channel, no store scan (performance rules 1 and 2).
  - `/api/me` keeps its reads in one `Promise.all`; the credit read runs only with `credits.view`.
- **Data fetching:** `/api/me` follows the three layers (service → query file with key factory → consumers). One owner: `useIdentity()` becomes a selector over `useMe()`, with no second cache.
- **Controls:** shadcn primitives from `src/components/ui/*` only, never native elements.
- **Copy:** plain words in anything a person sees. No vendor names, no internal ids, no em-dash phrasing. The Generate reason is exactly `Generating is turned off for you. Ask your agency owner.`
- **Server stays the authority.** Everything in this plan decides only what is shown. Routes and actions keep plan 1's checks.
- **Downloads are UI-only.** Files sit in public buckets, so the Downloads ticks hide buttons but cannot stop someone who has a file's URL. Making buckets private is its own project. Keep this said in `src/lib/permissions/downloads.ts`.
- **Tests:**
  - Run per directory: `npx vitest run <dir>`. The full run has about 11 known timeout flakes in API route tests that pass in isolation.
  - Known pre-existing failures, not caused by this plan: vitest "refuses a deprecated model" in `src/app/api/nodes/[id]/composite-generate` and `src/app/api/nodes/[id]/image-generate`; `npx tsc --noEmit` reports `src/app/api/nodes/[id]/image-generate/route.test.ts(56,12)`. Nothing else may fail.
  - `npx tsc --noEmit` and `npm run lint` pass (apart from the line above) at the end of every task.
  - The repo has no DOM test environment (`vitest.config.ts`: `environment: "node"`, no testing-library). Components are tested by rendering to static markup. Effects don't run there, so effect-driven behaviour (refetch on 403, `ability.update`, the lock not being acquired) is tested through the pure functions and query-client calls behind it.
- **No migration in this plan.** Nothing here changes the database.

## Decisions this plan makes

- **`@casl/react` 7.0.1**, not 7.1.0 (two-week rule, above).
- **No `<Can>` component in our code.** `<Can I="edit" a="scripts">` asks about a subject type and ignores client conditions. Every check goes through `useCan(key, clientId?)`, which names the client when there is one.
- **Two fetch funnels report a 403**, not one: services parse through `readJson` with a bare `fetch`, and the hand-rolled hooks call `authFetch`. Both call one `reportStatus(status)`; the listener invalidates with `cancelRefetch: false`, so a response that passes through both still causes one refetch, and a 403 on `/api/me` itself (while a password change is owed) cannot loop.
- **`GenerateFooter` renders `GatedButton`.** Every canvas node's Generate is already `GenerateFooter` (D435), so it gains a required `need` prop and the reason stays in one place. Dub, Lip sync and the canvas copilot's Send use `GatedButton` directly.
- **The canvas without `canvases.edit` opens without the edit lock.** `useCanvasLock` regains an `acquire` option (D201 removed it because the lock depended on the URL you arrived through; here it depends on a permission shown on screen by a "You can view this canvas" banner). Recorded under D493 in Task 13.
- **Review counts follow review types without a migration.** With every review type, counts come from the `org_review_counts` RPC as today. With some, the pending rows of those types are read from the `review_queue_items` view and counted in memory (two columns, pending rows only). With none, nothing is read.
- **The layout never fails because of the access payload.** If building it throws, the layout passes `null` and the query fetches on mount, as `useIdentity` does today. The server still refuses what it must.
- **Out of scope here**, server-enforced only until a later change: gating Generate on the script, storyboard, avatar, voice, brand knowledge and market screens (the spec's examples name the canvas media areas), and the editor's "Export SRT" (captions text the person typed, not a stored file).

## File structure

| File | Responsibility |
|---|---|
| `src/lib/permissions/browser.ts` | Pack rules for the browser, unpack them into an ability, `canInBrowser` |
| `src/lib/permissions/downloads.ts` | `canDownload(ability, clientId, approved)`: the two UI-only download keys |
| `src/lib/permissions/access-signal.ts` | `onAccessDenied` / `reportStatus`: a 403 from our API, broadcast |
| `src/lib/me/types.ts` | `MePayload`, the shape `/api/me` and the layout share |
| `src/lib/me/payload.ts` | server-only: `buildMePayload(acting)`, `loadInitialMe()` |
| `src/lib/me/test-fixtures.ts` | `testMePayload(access, over?)` |
| `src/lib/db/presets.ts` | server-only: `getPresetName(key)` |
| `src/services/me.service.ts` | `fetchMe()` |
| `src/hooks/queries/me.ts` | `meKeys`, `meQueryOptions()`, `useMe()`, `invalidateMe()` |
| `src/components/permissions/access-provider.tsx` | Seeds the query, builds the one ability, listens for 403s |
| `src/components/permissions/use-can.ts` | `useAppAbility`, `useCan`, `useCanSeeClient`, `useCanDownload` |
| `src/components/permissions/use-can-approve-node.ts` | `useCanApproveNode(nodeType)` for canvas focus views |
| `src/components/permissions/gated-button.tsx` | `GatedButton`, `GENERATE_OFF_REASON` |
| `src/components/permissions/test-ability-provider.tsx` | `TestAbilityProvider` for component tests |
| `src/components/clients/use-client-sections.ts` | The client sections a person can view |
| Modified: `src/app/api/me/route.ts`, `src/app/layout.tsx`, `src/hooks/use-identity.ts`, `src/services/read-json.ts`, `src/lib/supabase/session-ready.ts`, `src/lib/permissions/server.ts`, `src/lib/db/profiles.ts`, `src/lib/db/review.ts` | Payload, seeding, 403 signal, scoped counts |
| Modified: canvas (`canvas.tsx`, `lock-banner.tsx`, `use-canvas-lock.ts`), focus views, dubbing panels, copilot composer, editor, clients, scripts, review components | Rendering rules |
| Modified: `src/lib/dal-logic.ts`, `src/lib/dal.ts`, `src/lib/identity.ts` | `orgRole` / `Identity.role` removed |
| Modified: `eslint.config.mjs` | Ban comparisons with `presetKey` in components and hooks |

---

### Task 1: `@casl/react` and the browser side of the rules

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `src/lib/permissions/browser.ts`
- Test: `src/lib/permissions/browser.test.ts`

**Interfaces:**
- Consumes: `buildRules(permissions, scope): AppRule[]`, `buildAbility(rules): AppAbility`, `AppRule`, `AppAbility` from `src/lib/permissions/ability.ts`; `splitKey`, `isClientScopedKey`, `PermissionKey`, `ALL_PERMISSION_KEYS` from `catalogue.ts`; `Access` from `access.ts`; `testAccess` from `test-fixtures.ts`.
- Produces:
  - `type PackedRules = PackRule<AppRule>[]`
  - `packAccessRules(access: Access): PackedRules`
  - `rulesFromPacked(packed: PackedRules): AppRule[]`
  - `abilityFromPacked(packed: PackedRules): AppAbility`
  - `canInBrowser(ability: AppAbility, key: PermissionKey, clientId?: string): boolean`

- [ ] **Step 1: Install `@casl/react` exactly**

Run: `npm view @casl/react@7.0.1 peerDependencies --json`
Expected: `"@casl/ability": "^4.0.0 || ^5.1.0 || ^6.0.0 || ^7.0.0"` and `"react": "^18.0.0 || ^19.0.0"`.

Run: `npm install --save-exact @casl/react@7.0.1`
Expected: `package.json` dependencies gain `"@casl/react": "7.0.1"` (no caret). `"@casl/ability": "7.0.3"` is unchanged.

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/permissions/browser.test.ts
import { describe, it, expect } from "vitest";
import { ALL_PERMISSION_KEYS } from "./catalogue";
import { testAccess } from "./test-fixtures";
import { abilityFromPacked, canInBrowser, packAccessRules } from "./browser";

const CLIENTS = ["c1", "c2", "c3", undefined] as const;

describe("rules sent to the browser", () => {
  it("survive the server → browser round trip: every key answers the same for every client", () => {
    const access = testAccess({ keys: ["scripts.view", "scripts.edit", "credits.view", "downloads.view"], clientIds: ["c2", "c1"] });
    // JSON round trip = what the HTML and /api/me actually carry.
    const browser = abilityFromPacked(JSON.parse(JSON.stringify(packAccessRules(access))));
    for (const key of ALL_PERMISSION_KEYS) {
      for (const clientId of CLIENTS) {
        expect(canInBrowser(browser, key, clientId), `${key} @ ${clientId}`).toBe(
          canInBrowser(access.ability, key, clientId),
        );
      }
    }
  });

  it("refuses a client outside a picked list", () => {
    const ability = abilityFromPacked(packAccessRules(testAccess({ keys: ["scripts.edit"], clientIds: ["c1"] })));
    expect(canInBrowser(ability, "scripts.edit", "c1")).toBe(true);
    expect(canInBrowser(ability, "scripts.edit", "c9")).toBe(false);
  });

  it("without a client, answers whether the person has the key for any client (tabs, nav)", () => {
    const ability = abilityFromPacked(packAccessRules(testAccess({ keys: ["scripts.edit"], clientIds: ["c1"] })));
    expect(canInBrowser(ability, "scripts.edit")).toBe(true);
    expect(canInBrowser(ability, "scripts.delete")).toBe(false);
  });

  it("checks agency-wide keys without a client", () => {
    const ability = abilityFromPacked(packAccessRules(testAccess({ keys: ["credits.view"], clientIds: ["c1"] })));
    expect(canInBrowser(ability, "credits.view")).toBe(true);
    expect(canInBrowser(ability, "clients.edit")).toBe(false);
  });

  it("an empty rule list allows nothing", () => {
    const ability = abilityFromPacked([]);
    expect(ALL_PERMISSION_KEYS.some((k) => canInBrowser(ability, k, "c1"))).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/permissions/browser.test.ts`
Expected: FAIL, `Failed to resolve import "./browser"`.

- [ ] **Step 4: Write the implementation**

```ts
// src/lib/permissions/browser.ts
import { subject } from "@casl/ability";
import { packRules, unpackRules, type PackRule } from "@casl/ability/extra";
import { buildAbility, buildRules, type AppAbility, type AppRule } from "./ability";
import { isClientScopedKey, splitKey, type PermissionKey } from "./catalogue";
import type { Access } from "./access";

// D493 §6.3: the server packs the person's rules into the first HTML and /api/me; the browser
// unpacks them into one ability. Rules are only ever built on the server (plan 1); nothing here
// turns browser input into a rule.

export type PackedRules = PackRule<AppRule>[];

export function packAccessRules(access: Access): PackedRules {
  return packRules(buildRules(access.permissions, access.clientScope));
}

export function rulesFromPacked(packed: PackedRules): AppRule[] {
  return unpackRules<AppRule>(packed);
}

export function abilityFromPacked(packed: PackedRules): AppAbility {
  return buildAbility(rulesFromPacked(packed));
}

// What to SHOW. With a client, a client-scoped key is checked for that client. Without one it
// asks about the subject type, which CASL answers "yes if any rule exists": right for a tab or
// a nav item, never enough on the server (plan 1's can() requires the client there).
export function canInBrowser(ability: AppAbility, key: PermissionKey, clientId?: string): boolean {
  const { area, level } = splitKey(key);
  if (clientId && isClientScopedKey(key)) return ability.can(level, subject(area, { clientId }));
  return ability.can(level, area);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/permissions`
Expected: PASS (all files in the directory).

Run: `npx tsc --noEmit` and `npm run lint`
Expected: only the known `image-generate/route.test.ts(56,12)` error; lint clean.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/permissions/browser.ts src/lib/permissions/browser.test.ts
git commit -m "feat(permissions): pin @casl/react and pack rules for the browser"
git log -1 --format=%B
```
Expected: the message only, no trailer.

---

### Task 2: `/api/me` sends access, built once with the caller

**Files:**
- Create: `src/lib/me/types.ts`, `src/lib/me/payload.ts`, `src/lib/me/test-fixtures.ts`, `src/lib/db/presets.ts`
- Modify: `src/lib/db/profiles.ts`, `src/lib/permissions/server.ts`, `src/app/api/me/route.ts`, `src/lib/permissions/not-yet-checked.ts`, `src/lib/actions/with-action-coverage.test.ts`
- Test: `src/app/api/me/route.test.ts` (rewrite), `src/lib/me/payload.test.ts`

**Interfaces:**
- Consumes: `ActingCaller`, `resolveActingCaller`, `accessOf` (`src/lib/permissions/server.ts`); `can` (`check.ts`); `packAccessRules`, `PackedRules` (Task 1); `orgRoleToIdentityRole`, `OrgRole`, `PlatformRole` (`src/lib/dal-logic.ts`); `getOrgById`, `getOrgCreditUsage` (`src/lib/db/organizations.ts`); `resolveCallerContextOrNull` (`src/lib/dal.ts`).
- Produces:
  - `type MePayload` (fields below)
  - `buildMePayload(acting: ActingCaller): Promise<MePayload>`
  - `loadInitialMe(): Promise<MePayload | null>` (never throws except Next's own control-flow errors)
  - `resolveActingCallerOrNull(): Promise<ActingCaller | null>` (cached per render, no redirect)
  - `getDisplayName(userId: string): Promise<string | null>`
  - `getPresetName(key: string): Promise<string | null>`
  - `testMePayload(access: Access, over?: Partial<MePayload>): MePayload`

- [ ] **Step 1: Write the failing route test** (replaces the whole file)

```ts
// src/app/api/me/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Access } from "@/lib/permissions/access";

vi.mock("server-only", () => ({}));

const m = vi.hoisted(() => ({
  access: undefined as Access | undefined,
  getOrgCreditUsage: vi.fn(async () => 42),
}));

vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({
    userId: "user-1",
    email: "a@example.com",
    platformRole: "member",
    orgId: "org-1",
    orgRole: "designer",
    mustChangePassword: false,
    access: m.access,
  })),
  resolveCallerContextOrNull: vi.fn(async () => null),
}));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })),
}));
vi.mock("@/lib/db/organizations", () => ({
  getOrgById: vi.fn(async () => ({ id: "org-1", name: "Yuvabe Studios", slug: "y", monthly_credit_limit: 1000, created_at: "t" })),
  getOrgCreditUsage: m.getOrgCreditUsage,
}));
vi.mock("@/lib/db/profiles", () => ({ getDisplayName: vi.fn(async () => "Arun") }));
vi.mock("@/lib/db/presets", () => ({
  getPresetName: vi.fn(async (key: string) => ({ owner: "Owner", senior: "Senior", designer: "Designer" } as Record<string, string>)[key] ?? null),
}));

import { testAccess, testOwnerAccess } from "@/lib/permissions/test-fixtures";
import { abilityFromPacked, canInBrowser } from "@/lib/permissions/browser";
import { GET } from "./route";

async function body() {
  const res = await GET();
  expect(res.status).toBe(200);
  return res.json();
}

describe("GET /api/me", () => {
  beforeEach(() => {
    m.getOrgCreditUsage.mockClear();
    m.access = undefined;
  });

  it("sends the owner's rules, all clients, the preset name and the credit figures", async () => {
    m.access = testOwnerAccess();
    const me = await body();
    expect(me).toMatchObject({
      name: "Arun",
      orgId: "org-1",
      orgName: "Yuvabe Studios",
      presetKey: "owner",
      presetName: "Owner",
      clientScope: "all",
      creditsUsed: 42,
      monthlyCreditLimit: 1000,
    });
    expect(canInBrowser(abilityFromPacked(me.permissions), "team.edit")).toBe(true);
  });

  it("sends no credit figures, and reads none, without credits.view", async () => {
    m.access = testAccess({ keys: ["scripts.view"] });
    const me = await body();
    expect(me.creditsUsed).toBeNull();
    expect(me.monthlyCreditLimit).toBeNull();
    expect(m.getOrgCreditUsage).not.toHaveBeenCalled();
  });

  it("sends a picked list as ids, with rules that refuse other clients", async () => {
    m.access = testAccess({ keys: ["scripts.edit"], clientIds: ["c2", "c1"], presetKey: "designer" });
    const me = await body();
    expect(me.clientScope).toEqual(["c1", "c2"]);
    expect(me.presetName).toBe("Designer");
    const ability = abilityFromPacked(me.permissions);
    expect(canInBrowser(ability, "scripts.edit", "c1")).toBe(true);
    expect(canInBrowser(ability, "scripts.edit", "c3")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/me`
Expected: FAIL (the route has no `presetKey`, `permissions` or `clientScope`; `getDisplayName` is not called).

- [ ] **Step 3: Add the payload type and the two small reads**

```ts
// src/lib/me/types.ts
import type { OrgRole, PlatformRole } from "@/lib/dal-logic";
import type { PackedRules } from "@/lib/permissions/browser";

/** What /api/me returns and the root layout hands the browser (D493 §6.3). */
export type MePayload = {
  name: string;
  platformRole: PlatformRole;
  /** The agency being acted in (the impersonated one while impersonating). */
  orgId: string;
  orgName: string | null;
  presetKey: string;
  /** The preset's display name, e.g. "Senior". Null only if the preset row is missing. */
  presetName: string | null;
  permissions: PackedRules;
  clientScope: "all" | string[];
  /** Both null without credits.view. */
  creditsUsed: number | null;
  monthlyCreditLimit: number | null;
  /** Read by the approve checks until Task 6 replaces them; removed in Task 11. */
  role: "senior" | "designer";
  /** Read by the profile popover until Task 11; removed there. */
  orgRole: OrgRole;
};
```

```ts
// src/lib/db/presets.ts
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

// role_presets.key is unique (migration 0062), so this is an index lookup.
export async function getPresetName(key: string): Promise<string | null> {
  const { data, error } = await createServerSupabase()
    .from("role_presets")
    .select("name")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return (data as { name: string } | null)?.name ?? null;
}
```

Append to `src/lib/db/profiles.ts`:

```ts
/** The person's own display name; null when they have no profile row yet. */
export async function getDisplayName(userId: string): Promise<string | null> {
  const { data, error } = await createServerSupabase()
    .from("profiles")
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as { display_name: string | null } | null)?.display_name ?? null;
}
```

- [ ] **Step 4: Add the non-redirecting acting caller**

In `src/lib/permissions/server.ts`, change the dal import and replace `resolveActingCaller` with:

```ts
import { resolveCallerContext, resolveCallerContextOrNull, type CallerContext } from "@/lib/dal";
```

```ts
function actingFrom(caller: CallerContext, impersonation: ImpersonationState): ActingCaller {
  if (impersonation.isImpersonating) {
    return { caller: { ...caller, access: ownerAccess() }, effectiveOrgId: impersonation.targetOrgId, impersonation };
  }
  return { caller, effectiveOrgId: caller.orgId, impersonation };
}

// The caller and the agency they are acting in, resolved once. While a super admin
// impersonates (D81) they act as that agency's owner: the target org, owner access. caller.orgId
// stays their own (attribution and credits already use effectiveOrgId, as withNode did).
// React cache() dedupes this within a page render; route handlers call it once and pass it on.
export const resolveActingCaller = cache(async (): Promise<ActingCaller> => {
  const [caller, impersonation] = await Promise.all([resolveCallerContext(), resolveImpersonationState()]);
  return actingFrom(caller, impersonation);
});

// The same without a redirect, for the root layout, which renders on /login and the public
// review pages too. Null = nobody signed in (or no membership).
export const resolveActingCallerOrNull = cache(async (): Promise<ActingCaller | null> => {
  const [caller, impersonation] = await Promise.all([resolveCallerContextOrNull(), resolveImpersonationState()]);
  return caller ? actingFrom(caller, impersonation) : null;
});
```

- [ ] **Step 5: Build the payload**

```ts
// src/lib/me/payload.ts
import "server-only";
import { unstable_rethrow } from "next/navigation";
import { orgRoleToIdentityRole } from "@/lib/dal-logic";
import { getOrgById, getOrgCreditUsage } from "@/lib/db/organizations";
import { getDisplayName } from "@/lib/db/profiles";
import { getPresetName } from "@/lib/db/presets";
import { can } from "@/lib/permissions/check";
import { packAccessRules } from "@/lib/permissions/browser";
import { accessOf, resolveActingCallerOrNull, type ActingCaller } from "@/lib/permissions/server";
import type { MePayload } from "./types";

// One builder for /api/me and the root layout, so the first HTML and every refetch carry the
// same thing. The reads run in parallel; the credit read runs only for someone who may see it.
export async function buildMePayload({ caller, effectiveOrgId }: ActingCaller): Promise<MePayload> {
  const access = accessOf(caller);
  const showCredits = can(access, "credits.view");
  const [name, org, presetName, creditsUsed] = await Promise.all([
    getDisplayName(caller.userId),
    getOrgById(effectiveOrgId),
    getPresetName(access.presetKey),
    showCredits ? getOrgCreditUsage(effectiveOrgId) : Promise.resolve(null),
  ]);
  return {
    name: name ?? "User",
    platformRole: caller.platformRole,
    orgId: effectiveOrgId,
    orgName: org?.name ?? null,
    presetKey: access.presetKey,
    presetName,
    permissions: packAccessRules(access),
    clientScope: access.clientScope === "all" ? "all" : [...access.clientScope].sort(),
    creditsUsed,
    monthlyCreditLimit: showCredits ? (org?.monthly_credit_limit ?? null) : null,
    role: orgRoleToIdentityRole(caller.orgRole),
    orgRole: caller.orgRole,
  };
}

// For the root layout. A failure here must not take every page down: the layout passes null and
// the browser fetches /api/me on mount, as before this plan. The server still refuses what it must.
export async function loadInitialMe(): Promise<MePayload | null> {
  try {
    const acting = await resolveActingCallerOrNull();
    return acting ? await buildMePayload(acting) : null;
  } catch (e) {
    unstable_rethrow(e);
    console.error("[layout] could not load the access payload; the browser will fetch it", e);
    return null;
  }
}
```

```ts
// src/lib/me/test-fixtures.ts
import type { Access } from "@/lib/permissions/access";
import { packAccessRules } from "@/lib/permissions/browser";
import type { MePayload } from "./types";

export function testMePayload(access: Access, over: Partial<MePayload> = {}): MePayload {
  return {
    name: "Arun",
    platformRole: "member",
    orgId: "org-1",
    orgName: "Yuvabe Studios",
    presetKey: access.presetKey,
    presetName: "Designer",
    permissions: packAccessRules(access),
    clientScope: access.clientScope === "all" ? "all" : [...access.clientScope].sort(),
    creditsUsed: 42,
    monthlyCreditLimit: 1000,
    role: "designer",
    orgRole: "designer",
    ...over,
  };
}
```

- [ ] **Step 6: Rewrite the route**

```ts
// src/app/api/me/route.ts
import { apiOk, withTryCatch } from "@/lib/api/route-helpers";
import { resolveActingCaller } from "@/lib/permissions/server";
import { buildMePayload } from "@/lib/me/payload";

// Explicit, not just relying on cookies() inside resolveCallerContext() to opt this route out of
// caching: every auth-state transition (login, sign-out and sign-in as someone else, a forced
// password change) depends on fresh data here. Paired with fetchMe()'s cache: "no-store".
export const dynamic = "force-dynamic";

// Feeds useMe(). The caller is resolved once (plan 1, performance rule 6) and the payload is the
// same one the root layout seeds the first render with.
export async function GET() {
  const acting = await resolveActingCaller();
  return withTryCatch("Failed to load profile.", async () => apiOk(await buildMePayload(acting)));
}
```

- [ ] **Step 7: Test `loadInitialMe`**

```ts
// src/lib/me/payload.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ caller: null as unknown, failOrg: false }));
vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(),
  resolveCallerContextOrNull: vi.fn(async () => m.caller),
}));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })),
}));
vi.mock("@/lib/db/organizations", () => ({
  getOrgById: vi.fn(async () => {
    if (m.failOrg) throw new Error("db down");
    return { id: "org-1", name: "Yuvabe Studios", slug: "y", monthly_credit_limit: null, created_at: "t" };
  }),
  getOrgCreditUsage: vi.fn(async () => 0),
}));
vi.mock("@/lib/db/profiles", () => ({ getDisplayName: vi.fn(async () => null) }));
vi.mock("@/lib/db/presets", () => ({ getPresetName: vi.fn(async () => "Owner") }));

import { testOwnerAccess } from "@/lib/permissions/test-fixtures";
import { loadInitialMe } from "./payload";

const signedIn = () => ({ userId: "u1", email: null, platformRole: "member", orgId: "org-1", orgRole: "owner", mustChangePassword: false, access: testOwnerAccess() });

describe("loadInitialMe", () => {
  it("is null with nobody signed in", async () => {
    m.caller = null;
    expect(await loadInitialMe()).toBeNull();
  });

  it("builds the payload for a signed-in person, naming them User without a profile", async () => {
    m.caller = signedIn();
    m.failOrg = false;
    expect(await loadInitialMe()).toMatchObject({ name: "User", presetName: "Owner", clientScope: "all" });
  });

  it("is null, not an error, when a read fails", async () => {
    m.caller = signedIn();
    m.failOrg = true;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await loadInitialMe()).toBeNull();
    err.mockRestore();
  });
});
```

- [ ] **Step 8: `credits.view` is now checked**

In `src/lib/permissions/not-yet-checked.ts`, delete the line:

```ts
  "credits.view": "/api/me credit figures, plan 2",
```

In `src/lib/actions/with-action-coverage.test.ts`, in the `"every catalogue key is checked by a route, an action, a page or the approval map"` test, change the `sources` list to:

```ts
  const sources = [
    ...collect("src/app/api", "route.ts"),
    ...collect("src/lib/actions", ".ts"),
    ...collect("src/app/clients", "page.tsx"),
    "src/lib/permissions/node-area.ts",
    // credits.view decides whether /api/me and the first render carry credit figures at all.
    "src/lib/me/payload.ts",
  ].map((f) => readFileSync(f, "utf8"));
```

- [ ] **Step 9: Run tests**

Run: `npx vitest run src/app/api/me src/lib/me src/lib/permissions src/lib/actions/with-action-coverage.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit` and `npm run lint`
Expected: only the known tsc line; lint clean.

- [ ] **Step 10: Commit**

```bash
git add src/lib/me src/lib/db/presets.ts src/lib/db/profiles.ts src/lib/permissions/server.ts src/app/api/me src/lib/permissions/not-yet-checked.ts src/lib/actions/with-action-coverage.test.ts
git commit -m "feat(permissions): /api/me sends packed rules, client scope and preset; credits only with credits.view"
git log -1 --format=%B
```

---

### Task 3: `/api/me` on TanStack Query; a 403 refreshes it; `useIdentity` selects from it

**Files:**
- Create: `src/lib/permissions/access-signal.ts`, `src/services/me.service.ts`, `src/hooks/queries/me.ts`
- Modify: `src/services/read-json.ts`, `src/lib/supabase/session-ready.ts`, `src/hooks/use-identity.ts` (rewrite), `src/components/identity/profile-popover.tsx`
- Test: `src/lib/permissions/access-signal.test.ts`, `src/services/me.service.test.ts`, `src/hooks/queries/__tests__/me.test.ts`, `src/hooks/__tests__/use-identity.test.tsx`, `src/lib/supabase/session-ready.test.ts` (one case added)

**Interfaces:**
- Consumes: `MePayload`, `testMePayload` (Task 2); `ApiError`, `readJson` (`src/services/read-json.ts`); `authFetch` (`src/lib/supabase/session-ready.ts`).
- Produces:
  - `onAccessDenied(listener: () => void): () => void` and `reportStatus(status: number): void`
  - `fetchMe(): Promise<MePayload>`
  - `meKeys = { all: ["me"], current: () => ["me", "current"] }`
  - `meQueryOptions()`; `useMe(initialData?: MePayload)`; `invalidateMe(queryClient): Promise<void>`
  - `useIdentity()` returns `{ identity, hydrated, platformRole, orgId, orgName, orgRole, presetName, creditsUsed, monthlyCreditLimit }` (same fields as today plus `presetName`)

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/permissions/access-signal.test.ts
import { describe, it, expect, vi } from "vitest";
import { onAccessDenied, reportStatus } from "./access-signal";

describe("access-signal", () => {
  it("tells listeners about a 403 and nothing else", () => {
    const listener = vi.fn();
    const off = onAccessDenied(listener);
    reportStatus(200);
    reportStatus(404);
    reportStatus(403);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    reportStatus(403);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
```

```ts
// src/services/me.service.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const authFetch = vi.fn();
vi.mock("@/lib/supabase/session-ready", () => ({ authFetch: (...a: unknown[]) => authFetch(...a) }));

import { fetchMe } from "./me.service";
import { ApiError, readJson } from "./read-json";
import { onAccessDenied } from "@/lib/permissions/access-signal";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("fetchMe", () => {
  beforeEach(() => authFetch.mockReset());

  it("reads /api/me uncached and returns the payload", async () => {
    authFetch.mockResolvedValue(json(200, { name: "Arun" }));
    expect(await fetchMe()).toEqual({ name: "Arun" });
    expect(authFetch).toHaveBeenCalledWith("/api/me", { cache: "no-store" });
  });

  it("throws an ApiError carrying the status", async () => {
    authFetch.mockResolvedValue(json(500, { error: "Failed to load profile." }));
    await expect(fetchMe()).rejects.toMatchObject({ status: 500, message: "Failed to load profile." });
  });
});

describe("readJson", () => {
  it("reports a 403 before throwing", async () => {
    const listener = vi.fn();
    const off = onAccessDenied(listener);
    await expect(readJson(json(403, { error: "No" }), "x")).rejects.toBeInstanceOf(ApiError);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });
});
```

```ts
// src/hooks/queries/__tests__/me.test.ts
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

const fetchMe = vi.fn();
vi.mock("@/services/me.service", () => ({ fetchMe: () => fetchMe() }));

import { invalidateMe, meKeys, meQueryOptions } from "../me";
import { onAccessDenied, reportStatus } from "@/lib/permissions/access-signal";
import { testMePayload } from "@/lib/me/test-fixtures";
import { testOwnerAccess } from "@/lib/permissions/test-fixtures";

describe("meKeys", () => {
  it("builds the one key", () => {
    expect(meKeys.current()).toEqual(["me", "current"]);
  });
});

describe("a 403 refreshes meKeys.current()", () => {
  it("refetches once however many refused responses arrive together", async () => {
    let resolve: (v: unknown) => void = () => {};
    fetchMe.mockReset().mockImplementation(() => new Promise((r) => { resolve = r; }));
    const client = new QueryClient();
    client.setQueryData(meKeys.current(), testMePayload(testOwnerAccess()));
    const unsubscribe = new QueryObserver(client, meQueryOptions()).subscribe(() => {});
    const off = onAccessDenied(() => void invalidateMe(client));

    // One response passes through both authFetch and readJson: two reports.
    reportStatus(403);
    reportStatus(403);
    await vi.waitFor(() => expect(fetchMe).toHaveBeenCalledTimes(1));
    resolve(testMePayload(testOwnerAccess(), { name: "Fresh" }));
    await vi.waitFor(() => expect(client.getQueryData<{ name: string }>(meKeys.current())?.name).toBe("Fresh"));
    expect(fetchMe).toHaveBeenCalledTimes(1);

    off();
    unsubscribe();
  });
});
```

```tsx
// src/hooks/__tests__/use-identity.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/services/me.service", () => ({ fetchMe: vi.fn() }));

import { useIdentity } from "../use-identity";
import { meKeys } from "@/hooks/queries/me";
import { testMePayload } from "@/lib/me/test-fixtures";
import { testAccess } from "@/lib/permissions/test-fixtures";

function Probe() {
  const { identity, hydrated, orgName, presetName, creditsUsed } = useIdentity();
  return <p>{[identity?.name, hydrated, orgName, presetName, creditsUsed].join("|")}</p>;
}

const render = (client: QueryClient) =>
  renderToStaticMarkup(<QueryClientProvider client={client}><Probe /></QueryClientProvider>);

describe("useIdentity", () => {
  it("selects from the me query: no second cache", () => {
    const client = new QueryClient();
    client.setQueryData(meKeys.current(), testMePayload(testAccess({ keys: [] }), { creditsUsed: null }));
    expect(render(client)).toContain("Arun|true|Yuvabe Studios|Designer|");
  });

  it("is not hydrated before anything is known", () => {
    expect(render(new QueryClient())).toContain("|false|||");
  });
});
```

Add to `src/lib/supabase/session-ready.test.ts`, inside `describe("authFetch", …)`, plus the import at the top (`import { onAccessDenied } from "@/lib/permissions/access-signal";`):

```ts
  it("reports a 403 to the access signal", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    fetchMock.mockResolvedValue({ ok: false, status: 403, clone: () => ({ json: async () => ({}) }) });
    const listener = vi.fn();
    const off = onAccessDenied(listener);
    await authFetch("/api/review/counts");
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/permissions/access-signal.test.ts src/services/me.service.test.ts src/hooks/queries/__tests__/me.test.ts src/hooks/__tests__/use-identity.test.tsx src/lib/supabase/session-ready.test.ts`
Expected: FAIL (missing modules; `useIdentity` has no `presetName`; `authFetch` does not report).

- [ ] **Step 3: The signal and the two funnels**

```ts
// src/lib/permissions/access-signal.ts
// D493 §6.3: a 403 from our API can mean the person's access changed mid-session (their owner
// unticked something). The two fetch funnels report every status here; AccessProvider listens and
// refreshes /api/me, so the screen catches up without a reload.
type Listener = () => void;

const listeners = new Set<Listener>();

export function onAccessDenied(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function reportStatus(status: number): void {
  if (status !== 403) return;
  for (const listener of [...listeners]) listener();
}
```

In `src/services/read-json.ts`, add the import and report before throwing:

```ts
import { reportStatus } from "@/lib/permissions/access-signal";
```

```ts
export async function readJson<T>(res: Response, fallback: string): Promise<T> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    reportStatus(res.status);
    throw new ApiError((json as { error?: string }).error ?? fallback, res.status);
  }
  return json as T;
}
```

In `src/lib/supabase/session-ready.ts`, add the import and the call at the end of `authFetch`:

```ts
import { reportStatus } from "@/lib/permissions/access-signal";
```

```ts
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  await ensureFreshSession();
  const res = await fetch(input, init);
  // Surface an impersonation write-block here rather than leaving each call site to
  // report it as its own generic failure. Reads and every other status fall straight
  // through — this only inspects 403s.
  await notifyIfReadOnlyBlocked(res);
  // Any 403 may mean access changed mid-session (D493); the listener refreshes /api/me.
  reportStatus(res.status);
  return res;
}
```

- [ ] **Step 4: Service and query file**

```ts
// src/services/me.service.ts
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
```

```ts
// src/hooks/queries/me.ts
"use client";

import { queryOptions, useQuery, type QueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { fetchMe } from "@/services/me.service";
import type { MePayload } from "@/lib/me/types";

export const meKeys = {
  all: ["me"] as const,
  current: () => [...meKeys.all, "current"] as const,
};

// /login has no session yet, and the proxy refuses /api/me while a password change is owed.
// Fetching there would only cache a failure; the first real fetch happens once the path changes.
const NO_FETCH_PATHS = new Set(["/login", "/account/password"]);

// D493 §6.3: refetched on window focus (overriding the app default, D300) once 30 s old, so a
// change made by the person's owner shows up without a reload. The root layout seeds it, so the
// first render needs no request.
export function meQueryOptions() {
  return queryOptions({
    queryKey: meKeys.current(),
    queryFn: fetchMe,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

/** The signed-in person's identity and access. `initialData` is passed only by AccessProvider. */
export function useMe(initialData?: MePayload) {
  const pathname = usePathname();
  return useQuery({ ...meQueryOptions(), initialData, enabled: !NO_FETCH_PATHS.has(pathname ?? "") });
}

// cancelRefetch: false joins a fetch already in flight instead of restarting it: one refused
// response reported by both funnels, or a 403 on /api/me itself, never stacks up requests.
export function invalidateMe(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: meKeys.current() }, { cancelRefetch: false });
}
```

- [ ] **Step 5: `useIdentity` becomes a selector** (replace the whole file)

```ts
// src/hooks/use-identity.ts
"use client";

import { useMemo } from "react";
import { useMe } from "@/hooks/queries/me";
import type { Identity } from "@/lib/identity";
import type { OrgRole, PlatformRole } from "@/lib/dal-logic";

// The signed-in person, read from the one /api/me query (D493). Kept as a hook so its ~20
// consumers don't change. `hydrated` is false until something is known (a seeded payload, a
// fetch result or a failed fetch); until then the nulls mean "not checked yet".
export function useIdentity(): {
  identity: Identity | null;
  hydrated: boolean;
  platformRole: PlatformRole | null;
  orgId: string | null;
  orgName: string | null;
  orgRole: OrgRole | null;
  presetName: string | null;
  creditsUsed: number | null;
  monthlyCreditLimit: number | null;
} {
  const { data, status } = useMe();
  return useMemo(
    () => ({
      identity: data ? { name: data.name, role: data.role } : null,
      hydrated: status !== "pending",
      platformRole: data?.platformRole ?? null,
      orgId: data?.orgId ?? null,
      orgName: data?.orgName ?? null,
      orgRole: data?.orgRole ?? null,
      presetName: data?.presetName ?? null,
      creditsUsed: data?.creditsUsed ?? null,
      monthlyCreditLimit: data?.monthlyCreditLimit ?? null,
    }),
    [data, status],
  );
}
```

- [ ] **Step 6: Sign-out clears the query cache**

In `src/components/identity/profile-popover.tsx`:
- Replace `import { useIdentity, resetIdentityCache } from "@/hooks/use-identity";` with `import { useIdentity } from "@/hooks/use-identity";` and add `import { useQueryClient } from "@tanstack/react-query";`.
- Add `const queryClient = useQueryClient();` on the line after the `useIdentity()` destructure.
- Replace the comment above `handleSignOut` and the function with:

```tsx
  // A Server Action's redirect() is a soft, client-side transition, so every client cache would
  // survive sign-out. Clearing the query cache drops this person's identity and access at once
  // (it replaces resetIdentityCache()); the hard navigation below then starts every module-level
  // cache in the app clean for the next sign-in.
  async function handleSignOut(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    queryClient.clear();
    await logoutAction();
    window.location.href = "/login";
  }
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/lib/permissions src/services src/hooks src/lib/supabase src/components/identity`
Expected: PASS.

Run: `npx tsc --noEmit` and `npm run lint`
Expected: only the known tsc line; lint clean. (`resetIdentityCache` no longer exists; `grep -rn resetIdentityCache src` prints only comments in `src/lib/actions/auth.ts`, if any.)

- [ ] **Step 8: Commit**

```bash
git add src/lib/permissions/access-signal.ts src/lib/permissions/access-signal.test.ts src/services/me.service.ts src/services/me.service.test.ts src/services/read-json.ts src/lib/supabase/session-ready.ts src/lib/supabase/session-ready.test.ts src/hooks/queries/me.ts src/hooks/queries/__tests__/me.test.ts src/hooks/use-identity.ts src/hooks/__tests__/use-identity.test.tsx src/components/identity/profile-popover.tsx
git commit -m "feat(permissions): /api/me on TanStack Query, refreshed on focus and on any 403"
git log -1 --format=%B
```

---

### Task 4: `AccessProvider`, the ability hooks, and a first render with no request

**Files:**
- Create: `src/components/permissions/access-provider.tsx`, `src/components/permissions/use-can.ts`, `src/components/permissions/test-ability-provider.tsx`
- Modify: `src/app/layout.tsx`
- Test: `src/components/permissions/__tests__/access-provider.test.tsx`

**Interfaces:**
- Consumes: `useMe`, `meKeys`, `invalidateMe` (Task 3); `onAccessDenied` (Task 3); `abilityFromPacked`, `rulesFromPacked`, `canInBrowser` (Task 1); `loadInitialMe`, `MePayload`, `testMePayload` (Task 2); `AbilityProvider`, `useAbility` from `@casl/react`.
- Produces:
  - `<AccessProvider initial={MePayload | null}>`
  - `useAppAbility(): AppAbility`
  - `useCan(key: PermissionKey, clientId?: string): boolean`
  - `useCanSeeClient(clientId: string): boolean`
  - `<TestAbilityProvider keys?: readonly PermissionKey[] clientIds?: readonly string[]>` (tests only)

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/permissions/__tests__/access-provider.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next/navigation", () => ({ usePathname: () => "/clients/acme" }));
const fetchMe = vi.fn();
vi.mock("@/services/me.service", () => ({ fetchMe: () => fetchMe() }));

import { AccessProvider } from "../access-provider";
import { useCan, useCanSeeClient } from "../use-can";
import { useIdentity } from "@/hooks/use-identity";
import { meKeys } from "@/hooks/queries/me";
import { testMePayload } from "@/lib/me/test-fixtures";
import { testAccess } from "@/lib/permissions/test-fixtures";

function Probe() {
  const { identity } = useIdentity();
  const edit = useCan("scripts.edit", "c1");
  const editElsewhere = useCan("scripts.edit", "c9");
  const generate = useCan("image_generation.generate", "c1");
  const sees = useCanSeeClient("c1");
  return <p>{[identity?.name, edit, editElsewhere, generate, sees].join("|")}</p>;
}

// The app's own client defaults (src/components/layout/query-provider.tsx).
const appClient = () =>
  new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } } });

describe("AccessProvider", () => {
  beforeEach(() => fetchMe.mockReset());

  it("renders the right answers on the first render from the server payload, with no request", () => {
    const client = appClient();
    const payload = testMePayload(testAccess({ keys: ["scripts.view", "scripts.edit"], clientIds: ["c1"] }));
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <AccessProvider initial={payload}><Probe /></AccessProvider>
      </QueryClientProvider>,
    );
    expect(html).toContain("Arun|true|false|false|true");
    expect(fetchMe).not.toHaveBeenCalled();
    // Fresh, so mounting in the browser does not refetch either.
    expect(client.getQueryCache().find({ queryKey: meKeys.current() })?.isStaleByTime(30_000)).toBe(false);
  });

  it("allows nothing before anything is known", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={appClient()}>
        <AccessProvider initial={null}><Probe /></AccessProvider>
      </QueryClientProvider>,
    );
    expect(html).toContain("|false|false|false|false");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/permissions`
Expected: FAIL, `Failed to resolve import "../access-provider"`.

- [ ] **Step 3: Write the provider and hooks**

```tsx
// src/components/permissions/access-provider.tsx
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AbilityProvider } from "@casl/react";
import { invalidateMe, meKeys, useMe } from "@/hooks/queries/me";
import { onAccessDenied } from "@/lib/permissions/access-signal";
import { abilityFromPacked, rulesFromPacked } from "@/lib/permissions/browser";
import type { MePayload } from "@/lib/me/types";

// D493 §6.3. The root layout hands over the payload it built for this request; it seeds the me
// query (so the first render already shows the right buttons, with no request) and becomes the
// ONE ability for the whole app. Components read it from context (performance rules 1 and 2).
export function AccessProvider({ initial, children }: { initial: MePayload | null; children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data } = useMe(initial ?? undefined);
  const [ability] = useState(() => abilityFromPacked(data?.permissions ?? []));

  // New rules (a refetch after a 403 or on focus) update the same ability in place; useAbility()
  // re-renders its readers. Structural sharing keeps `permissions` the same array when nothing
  // changed, so an unchanged refetch updates nothing.
  const applied = useRef(data?.permissions);
  useEffect(() => {
    const next = data?.permissions;
    if (next === applied.current) return;
    applied.current = next;
    ability.update(rulesFromPacked(next ?? []));
  }, [data?.permissions, ability]);

  // A newer server payload (router.refresh(), a soft navigation after signing in) wins.
  const seeded = useRef(initial);
  useEffect(() => {
    if (!initial || initial === seeded.current) return;
    seeded.current = initial;
    queryClient.setQueryData(meKeys.current(), initial);
  }, [initial, queryClient]);

  useEffect(() => onAccessDenied(() => void invalidateMe(queryClient)), [queryClient]);

  return <AbilityProvider value={ability}>{children}</AbilityProvider>;
}
```

```ts
// src/components/permissions/use-can.ts
"use client";

import { useMemo } from "react";
import { useAbility } from "@casl/react";
import { useMe } from "@/hooks/queries/me";
import type { AppAbility } from "@/lib/permissions/ability";
import type { PermissionKey } from "@/lib/permissions/catalogue";
import { canInBrowser } from "@/lib/permissions/browser";

// Every browser check goes through these: what to SHOW, never what to permit (the server decides).
// In-memory, from the one ability AccessProvider holds; the ability only changes when the rules
// do, so a canvas drag never re-renders a gated component.

export function useAppAbility(): AppAbility {
  return useAbility<AppAbility>();
}

/** With a client: that client. Without: whether the person has the key for any client. */
export function useCan(key: PermissionKey, clientId?: string): boolean {
  return canInBrowser(useAppAbility(), key, clientId);
}

export function useCanSeeClient(clientId: string): boolean {
  const scope = useMe().data?.clientScope;
  const picked = useMemo(() => (scope && scope !== "all" ? new Set(scope) : null), [scope]);
  if (!scope) return false;
  return scope === "all" || (picked?.has(clientId) ?? false);
}
```

```tsx
// src/components/permissions/test-ability-provider.tsx
"use client";

import type { ReactNode } from "react";
import { AbilityProvider } from "@casl/react";
import { buildAbility, buildRules } from "@/lib/permissions/ability";
import { ALL_PERMISSION_KEYS, type PermissionKey } from "@/lib/permissions/catalogue";

/** For component tests: an ability with these keys (default: every key) for these clients (default: all). */
export function TestAbilityProvider({
  keys = ALL_PERMISSION_KEYS,
  clientIds,
  children,
}: {
  keys?: readonly PermissionKey[];
  clientIds?: readonly string[];
  children: ReactNode;
}) {
  const ability = buildAbility(buildRules(new Set(keys), clientIds ? new Set(clientIds) : "all"));
  return <AbilityProvider value={ability}>{children}</AbilityProvider>;
}
```

- [ ] **Step 4: Seed it from the root layout**

In `src/app/layout.tsx`, add the imports:

```tsx
import { AccessProvider } from "@/components/permissions/access-provider";
import { loadInitialMe } from "@/lib/me/payload";
```

Replace the body of `RootLayout` from the comment above `resolveImpersonationState` to the end with:

```tsx
  // resolveImpersonationState is cache()d per request, so this is deduped with the
  // banner's own call — it costs nothing, and it keeps the header's offset colocated
  // with the element it offsets against. loadInitialMe resolves the caller once for this render
  // (shared with the page through cache()) and builds the same payload /api/me returns, so the
  // first HTML already has the right buttons (D493).
  const [{ isImpersonating }, me] = await Promise.all([resolveImpersonationState(), loadInitialMe()]);

  return (
    <html
      lang="en"
      className={`${clash.variable} ${gilroy.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <QueryProvider>
        <AccessProvider initial={me}>
        <ImpersonationBanner />
        <AppHeader className={headerTopClass(isImpersonating)} />
        {children}
        <Toaster />
        </AccessProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/components/permissions src/hooks src/app`
Expected: PASS (except the two known `refuses a deprecated model` cases under `src/app/api/nodes/[id]`).

Run: `npx tsc --noEmit` and `npm run lint`
Expected: only the known tsc line; lint clean.

- [ ] **Step 6: Check in the browser**

Run: `npm run dev`, sign in, open the home page with the Network panel open.
Expected: no `/api/me` request on load; one after focusing the tab more than 30 s later.

- [ ] **Step 7: Commit**

```bash
git add src/components/permissions src/app/layout.tsx
git commit -m "feat(permissions): AccessProvider seeds access from the layout and holds one ability"
git log -1 --format=%B
```

---

### Task 5: `GatedButton`, and Generate on the canvas follows `<area>.generate`

**Files:**
- Create: `src/components/permissions/gated-button.tsx`
- Modify: `src/components/nodes/generate-footer.tsx`, its 8 callers (`composite-focus-view.tsx`, `image-gen-focus-view.tsx`, `multishot-prompt-focus-view.tsx`, `prompt-focus-view.tsx`, `video-gen-change-voice.tsx`, `video-gen-edit-video.tsx`, `video-gen-focus-view.tsx`, `video-prompt-focus-view.tsx`), `src/components/nodes/dubbing-dub-panel.tsx`, `src/components/nodes/dubbing-lip-sync-panel.tsx`, `src/components/canvas/copilot-composer.tsx`
- Test: `src/components/permissions/__tests__/gated-button.test.tsx`; update `src/components/nodes/__tests__/generate-footer.test.tsx`, `src/components/nodes/__tests__/dubbing-controls.test.tsx`

**Interfaces:**
- Consumes: `useCan` (Task 4); `TestAbilityProvider` (Task 4); `useClientId` (`src/components/canvas/client-id-context.tsx`).
- Produces:
  - `GENERATE_OFF_REASON = "Generating is turned off for you. Ask your agency owner."`
  - `<GatedButton need: PermissionKey clientId?: string disabledReason?: string | null triggerClassName?: string tooltipSide?: "top" | "bottom" {...ButtonProps}>`
  - `GenerateFooter` gains a required prop `need: PermissionKey`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/permissions/__tests__/gated-button.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PermissionKey } from "@/lib/permissions/catalogue";
import { GatedButton, GENERATE_OFF_REASON } from "../gated-button";
import { TestAbilityProvider } from "../test-ability-provider";

const render = (keys: readonly PermissionKey[], props: { disabled?: boolean; disabledReason?: string | null } = {}) =>
  renderToStaticMarkup(
    <TestAbilityProvider keys={keys} clientIds={["c1"]}>
      <GatedButton need="image_generation.generate" clientId="c1" {...props}>Generate image</GatedButton>
    </TestAbilityProvider>,
  );

describe("GatedButton", () => {
  it("is a plain enabled button when the person may generate", () => {
    const html = render(["image_generation.generate"]);
    expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>Generate image<\/button>/);
    expect(html).not.toContain(GENERATE_OFF_REASON);
  });

  it("is disabled and says why when the person may not", () => {
    const html = render([]);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Generate image<\/button>/);
    expect(html).toContain(GENERATE_OFF_REASON);
  });

  it("the permission reason wins over the button's own reason", () => {
    const html = render([], { disabled: true, disabledReason: "Connect a prompt first." });
    expect(html).toContain(GENERATE_OFF_REASON);
    expect(html).not.toContain("Connect a prompt first.");
  });

  it("shows its own reason when allowed but disabled", () => {
    const html = render(["image_generation.generate"], { disabled: true, disabledReason: "Connect a prompt first." });
    expect(html).toContain("Connect a prompt first.");
  });

  it("is refused for a client outside the person's list", () => {
    const html = renderToStaticMarkup(
      <TestAbilityProvider keys={["image_generation.generate"]} clientIds={["c1"]}>
        <GatedButton need="image_generation.generate" clientId="c2">Generate image</GatedButton>
      </TestAbilityProvider>,
    );
    expect(html).toContain(GENERATE_OFF_REASON);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/permissions/__tests__/gated-button.test.tsx`
Expected: FAIL, `Failed to resolve import "../gated-button"`.

- [ ] **Step 3: Write `GatedButton`**

```tsx
// src/components/permissions/gated-button.tsx
"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PermissionKey } from "@/lib/permissions/catalogue";
import { useCan } from "./use-can";

export const GENERATE_OFF_REASON = "Generating is turned off for you. Ask your agency owner.";

type Props = ComponentProps<typeof Button> & {
  need: PermissionKey;
  clientId?: string;
  /** Why the button is disabled for some other reason. The permission reason wins over it. */
  disabledReason?: string | null;
  /** The span the tooltip hangs on: a disabled button gets no pointer events. */
  triggerClassName?: string;
  tooltipSide?: "top" | "bottom";
};

// D493 §6.4, "one wrapper per pattern": a missing Generate shows the button disabled with the
// reason, so people know the feature exists and whom to ask. The reason is also in the markup
// (sr-only), since a disabled button can't be focused to reach its tooltip.
export function GatedButton({
  need,
  clientId,
  disabled = false,
  disabledReason = null,
  triggerClassName = "inline-block",
  tooltipSide = "top",
  ...props
}: Props) {
  const allowed = useCan(need, clientId);
  const reason = !allowed ? GENERATE_OFF_REASON : disabled ? disabledReason : null;
  const button = <Button {...props} disabled={!allowed || disabled} />;
  if (!reason) return button;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className={triggerClassName} />}>
        {button}
        <span className="sr-only">{reason}</span>
      </TooltipTrigger>
      <TooltipContent side={tooltipSide} className="max-w-56 text-center">{reason}</TooltipContent>
    </Tooltip>
  );
}
```

- [ ] **Step 4: `GenerateFooter` renders it**

In `src/components/nodes/generate-footer.tsx`:
- Replace the imports of `Button` and `Tooltip…` with:

```tsx
import { GatedButton } from "@/components/permissions/gated-button";
import { useClientId } from "@/components/canvas/client-id-context";
import type { PermissionKey } from "@/lib/permissions/catalogue";
```

- Add `need,` as the first destructured prop and, in the props type, as the first field:

```tsx
  /** The Generate permission this button needs, e.g. "image_generation.generate" (D493). */
  need: PermissionKey;
```

- Replace the `<TooltipProvider>…</TooltipProvider>` block with:

```tsx
      <GatedButton
        need={need}
        clientId={clientId}
        size="lg"
        className="w-full"
        triggerClassName="block w-full"
        onClick={onClick}
        disabled={disabled}
        disabledReason={disabledReason ?? null}
      >
        {estimating ? (
          <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
        ) : (
          <Icon className="size-4" strokeWidth={1.5} />
        )}
        {busy ? busyLabel : label}
        {!busy && !estimating && credits !== null && <EstimatedCreditsLabel credits={credits} />}
      </GatedButton>
```

- Add `const clientId = useClientId();` as the first line of the function body.

- [ ] **Step 5: Name the permission at every caller**

Add one prop to each `<GenerateFooter` (the server route each one calls declares the same key):

| File | Add |
|---|---|
| `src/components/nodes/composite-focus-view.tsx` | `need="image_generation.generate"` |
| `src/components/nodes/image-gen-focus-view.tsx` | `need="image_generation.generate"` |
| `src/components/nodes/prompt-focus-view.tsx` | `need="canvases.generate"` |
| `src/components/nodes/video-prompt-focus-view.tsx` | `need="video_generation.generate"` |
| `src/components/nodes/multishot-prompt-focus-view.tsx` | `need="video_generation.generate"` |
| `src/components/nodes/video-gen-focus-view.tsx` | `need="video_generation.generate"` |
| `src/components/nodes/video-gen-edit-video.tsx` | `need="video_generation.generate"` |
| `src/components/nodes/video-gen-change-voice.tsx` | `need="audio.generate"` |

For example, `src/components/nodes/image-gen-focus-view.tsx`:

```tsx
                    <GenerateFooter
                      need="image_generation.generate"
                      className="-mx-6 -mb-5"
                      label={imageUrl ? "Re-generate" : "Generate image"}
```

Run: `npx tsc --noEmit`
Expected: no `Property 'need' is missing` errors (the required prop makes TypeScript list any caller missed).

- [ ] **Step 6: Dub, Lip sync and the canvas copilot's Send**

`src/components/nodes/dubbing-dub-panel.tsx`: replace the imports of `Button` and `DisabledReason` with `import { GatedButton } from "@/components/permissions/gated-button";` and `import { useClientId } from "@/components/canvas/client-id-context";`, add `const clientId = useClientId();` as the first line of `DubbingDubPanel`, and replace the `<DisabledReason …>…</DisabledReason>` block with:

```tsx
        <GatedButton
          need="audio.generate"
          clientId={clientId}
          onClick={onDub}
          disabled={!canDub}
          disabledReason={blocked}
          className="w-full"
          triggerClassName="block w-full"
          tooltipSide="bottom"
        >
          {running === "dub" ? "Dubbing…" : hasDub ? "Dub again" : "Dub"}
          {running !== "dub" && sourceSeconds > 0 && <EstimatedCreditsLabel credits={dubCredits(sourceSeconds)} />}
        </GatedButton>
```

`src/components/nodes/dubbing-lip-sync-panel.tsx`: same import changes, `const clientId = useClientId();` as the first line of `DubbingLipSyncPanel`, and replace the `<DisabledReason …>…</DisabledReason>` block with:

```tsx
        <GatedButton
          need="audio.generate"
          clientId={clientId}
          onClick={onLipSync}
          disabled={Boolean(blocked)}
          disabledReason={blocked}
          className="w-full"
          triggerClassName="block w-full"
          tooltipSide="bottom"
        >
          {running === "lipsync" ? "Lip-syncing…" : activeDub.lipSynced ? "Lip sync again" : "Lip sync"}
          {running !== "lipsync" && activeDubSeconds > 0 && <EstimatedCreditsLabel credits={lipSyncCredits(activeDubSeconds)} />}
        </GatedButton>
```

`src/components/canvas/copilot-composer.tsx`: add `import { GatedButton } from "@/components/permissions/gated-button";` and `import { useClientId } from "./client-id-context";`, add `const clientId = useClientId();` after `const nodes = useCanvasStore((s) => s.nodes);`, and replace the Send button with:

```tsx
        <GatedButton
          need="canvas_copilot.generate"
          clientId={clientId}
          onClick={() => submit()}
          disabled={thinking || (input.trim().length === 0 && !attachment)}
          className="gap-1.5"
        >
          <Send className="size-3.5" /> Send
        </GatedButton>
```

- [ ] **Step 7: Wrap the two existing component tests**

`src/components/nodes/__tests__/generate-footer.test.tsx`: add `import { TestAbilityProvider } from "@/components/permissions/test-ability-provider";` and `import { GENERATE_OFF_REASON } from "@/components/permissions/gated-button";`, replace `render` with:

```tsx
const render = (over: Partial<Parameters<typeof GenerateFooter>[0]> = {}, keys?: Parameters<typeof TestAbilityProvider>[0]["keys"]) =>
  renderToStaticMarkup(
    <TestAbilityProvider keys={keys}>
      <GenerateFooter need="video_generation.generate" label="Re-generate" busy={false} onClick={vi.fn()} disabled={false} credits={605} {...over} />
    </TestAbilityProvider>,
  );
```

and add a case inside the `describe`:

```tsx
  it("is disabled with the reason when generating is turned off for the person", () => {
    const html = render({}, []);
    expect(html).toMatch(/<button[^>]*disabled=""/);
    expect(text(html)).toContain(GENERATE_OFF_REASON);
  });
```

`src/components/nodes/__tests__/dubbing-controls.test.tsx`: add `import type { ReactElement } from "react";` and `import { TestAbilityProvider } from "@/components/permissions/test-ability-provider";`, add after the imports:

```tsx
// Dub and Lip sync are gated on audio.generate (D493); every render gets every key.
const renderGated = (el: ReactElement) => renderToStaticMarkup(<TestAbilityProvider>{el}</TestAbilityProvider>);
```

then run `sed -i 's/renderToStaticMarkup(</renderGated(</g' src/components/nodes/__tests__/dubbing-controls.test.tsx` (the import line has no `(<` and is untouched).

- [ ] **Step 8: Run tests**

Run: `npx vitest run src/components`
Expected: PASS. (A failure reading `AbilityContext is not provided` means a test renders a gated component without `TestAbilityProvider`; wrap it as in Step 7.)

Run: `npx tsc --noEmit` and `npm run lint`
Expected: only the known tsc line; lint clean (no unused `Button`/`DisabledReason`/`Tooltip*` imports left).

- [ ] **Step 9: Commit**

```bash
git add src/components/permissions src/components/nodes src/components/canvas/copilot-composer.tsx
git commit -m "feat(permissions): Generate buttons follow <area>.generate through one GatedButton"
git log -1 --format=%B
```

---

### Task 6: Approve follows the node's area; review counts follow review types

**Files:**
- Create: `src/components/permissions/use-can-approve-node.ts`
- Modify: `src/components/nodes/image-gen-focus-view.tsx:79,329,1381`, `src/components/nodes/prompt-focus-view.tsx:67,196,916`, `src/components/nodes/video-gen-focus-view.tsx:77,740,2130`, `src/components/nodes/prompt-focus-shell.tsx:40,183,247`, `src/lib/db/review.ts`, `src/app/(home)/page.tsx`, `src/app/clients/[id]/(canvases)/page.tsx`, `src/app/clients/[id]/canvases/[cid]/(canvas)/page.tsx`, `src/app/api/review/counts/route.ts`
- Test: `src/components/permissions/__tests__/use-can-approve-node.test.tsx`; update `src/lib/db/scope-filters.test.ts`

**Interfaces:**
- Consumes: `useAppAbility` (Task 4); `canInBrowser` (Task 1); `approveKeyForNodeType`, `reviewableNodeTypes`, `REVIEWABLE_NODE_TYPES` (`src/lib/permissions/node-area.ts`); `scopeIds` (`check.ts`); `Access`; `testAccess`.
- Produces:
  - `useCanApproveNode(nodeType: string): boolean` (reads the client from `ClientIdContext`)
  - `getOrgReviewCounts(orgId: string, access: Access): Promise<ReviewCounts>` (signature change)

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/permissions/__tests__/use-can-approve-node.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PermissionKey } from "@/lib/permissions/catalogue";
import { ClientIdProvider } from "@/components/canvas/client-id-context";
import { TestAbilityProvider } from "../test-ability-provider";
import { useCanApproveNode } from "../use-can-approve-node";

function Probe({ type }: { type: string }) {
  return <p>{String(useCanApproveNode(type))}</p>;
}
const can = (keys: readonly PermissionKey[], type: string, clientId = "c1") =>
  renderToStaticMarkup(
    <TestAbilityProvider keys={keys} clientIds={["c1"]}>
      <ClientIdProvider value={clientId}><Probe type={type} /></ClientIdProvider>
    </TestAbilityProvider>,
  ).includes("true");

describe("useCanApproveNode", () => {
  it("asks the node type's area", () => {
    expect(can(["image_generation.approve"], "image-gen")).toBe(true);
    expect(can(["image_generation.approve"], "prompt")).toBe(true);
    expect(can(["image_generation.approve"], "video-gen")).toBe(false);
    expect(can(["video_generation.approve"], "multishot-prompt")).toBe(true);
  });

  it("is false for a node type nobody approves, and for a client outside the list", () => {
    expect(can(["image_generation.approve"], "text")).toBe(false);
    expect(can(["image_generation.approve"], "image-gen", "c2")).toBe(false);
  });
});
```

In `src/lib/db/scope-filters.test.ts`, add `import { testAccess } from "@/lib/permissions/test-fixtures";` and replace the `describe("getOrgReviewCounts", …)` block with:

```ts
describe("getOrgReviewCounts", () => {
  const rows = [
    { client_id: "c1", canvas_id: "cv1", pending: 2 },
    { client_id: "c2", canvas_id: "cv2", pending: 5 },
  ];
  const approver = (clientIds?: string[]) =>
    testAccess({ keys: ["image_generation.approve", "video_generation.approve"], clientIds });

  it("counts only the person's clients when they have a list", async () => {
    state.result = { data: rows, error: null };
    const counts = await getOrgReviewCounts("org-1", approver(["c1"]));
    expect(counts.byClient).toEqual({ c1: 2 });
    expect(counts.byCanvas).toEqual({ cv1: 2 });
  });

  it("counts every client for someone on all clients", async () => {
    state.result = { data: rows, error: null };
    const counts = await getOrgReviewCounts("org-1", approver());
    expect(counts.byClient).toEqual({ c1: 2, c2: 5 });
  });

  it("counts only the review types the person can approve", async () => {
    state.result = { data: [{ client_id: "c1", canvas_id: "cv1" }, { client_id: "c1", canvas_id: "cv1" }], error: null };
    const counts = await getOrgReviewCounts("org-1", testAccess({ keys: ["image_generation.approve"] }));
    expect(inCalls()).toEqual([["in", ["node_type", ["image-gen"]]]]);
    expect(calls.some(([m]) => m === "rpc")).toBe(false);
    expect(counts.byCanvas).toEqual({ cv1: 2 });
  });

  it("reads nothing for someone who can approve nothing", async () => {
    const counts = await getOrgReviewCounts("org-1", testAccess({ keys: ["internal_review.view"] }));
    expect(calls).toEqual([]);
    expect(counts.total).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/permissions src/lib/db/scope-filters.test.ts`
Expected: FAIL (missing hook; `getOrgReviewCounts` takes a list, not an `Access`).

- [ ] **Step 3: The hook**

```ts
// src/components/permissions/use-can-approve-node.ts
"use client";

import { useClientId } from "@/components/canvas/client-id-context";
import { approveKeyForNodeType } from "@/lib/permissions/node-area";
import { canInBrowser } from "@/lib/permissions/browser";
import { useAppAbility } from "./use-can";

// D489: Approve / Request changes show only with Approve on the node's area, for the canvas's
// client. For a canvas focus view (it reads the client from the canvas tree).
export function useCanApproveNode(nodeType: string): boolean {
  const ability = useAppAbility();
  const clientId = useClientId();
  const key = approveKeyForNodeType(nodeType);
  return key !== null && canInBrowser(ability, key, clientId);
}
```

- [ ] **Step 4: Replace the role check in the four views**

In each file, replace `import { useIdentity } from "@/hooks/use-identity";` with `import { useCanApproveNode } from "@/components/permissions/use-can-approve-node";`, replace `const { identity } = useIdentity();` with the line below, and replace `canApprove={identity?.role === "senior" && !viewing.isViewingOther}` with `canApprove={canApprove && !viewing.isViewingOther}`:

| File | New line |
|---|---|
| `src/components/nodes/image-gen-focus-view.tsx` | `const canApprove = useCanApproveNode("image-gen");` |
| `src/components/nodes/video-gen-focus-view.tsx` | `const canApprove = useCanApproveNode("video-gen");` |
| `src/components/nodes/prompt-focus-view.tsx` | `const canApprove = useCanApproveNode("prompt");` |
| `src/components/nodes/prompt-focus-shell.tsx` | `const canApprove = useCanApproveNode(targetType); // "video-prompt" or "multishot-prompt"` |

Run: `grep -rn 'role === "senior"' src`
Expected: no output.

- [ ] **Step 5: Counts by review type**

In `src/lib/db/review.ts`, add the imports:

```ts
import { scopeIds } from "@/lib/permissions/check";
import { REVIEWABLE_NODE_TYPES, reviewableNodeTypes } from "@/lib/permissions/node-area";
import type { Access } from "@/lib/permissions/access";
```

and replace `getOrgReviewCounts` with:

```ts
// R5.1/R5.2/R5.3: one read, never one query per row (PRD §8: the client list renders for every
// org member on every visit). Pending counts are of the work the person can approve (D489), in
// their clients (D490). With every review type that is the org_review_counts RPC, as before.
// With some, the RPC can't tell types apart, so the pending rows of those types are read (two
// columns) and counted here. With none, there is nothing to count.
export async function getOrgReviewCounts(orgId: string, access: Access): Promise<ReviewCounts> {
  const types = reviewableNodeTypes(access);
  if (types.length === 0) return summarizeCounts([]);
  const clientIds = scopeIds(access);
  const inScope = clientIds === null ? null : new Set(clientIds);
  const supabase = createServerSupabase();

  if (types.length === REVIEWABLE_NODE_TYPES.length) {
    const { data, error } = await supabase.rpc("org_review_counts", { p_org_id: orgId });
    if (error) throw error;
    const rows = ((data ?? []) as { client_id: string; canvas_id: string; pending: number }[])
      .filter((r) => inScope === null || inScope.has(r.client_id));
    return summarizeCounts(rows.map((r) => ({ clientId: r.client_id, canvasId: r.canvas_id, pending: r.pending })));
  }

  const { data, error } = await supabase
    .from("review_queue_items")
    .select("client_id, canvas_id")
    .eq("org_id", orgId)
    .eq("approval_status", "pending")
    .in("node_type", types);
  if (error) throw error;
  const rows = ((data ?? []) as { client_id: string; canvas_id: string }[])
    .filter((r) => inScope === null || inScope.has(r.client_id));
  return summarizeCounts(rows.map((r) => ({ clientId: r.client_id, canvasId: r.canvas_id, pending: 1 })));
}
```

Update the four callers to pass the access:

- `src/app/(home)/page.tsx`: `getOrgReviewCounts(effectiveOrgId, accessOf(caller)),`
- `src/app/clients/[id]/(canvases)/page.tsx`: `getOrgReviewCounts(effectiveOrgId, accessOf(caller)),` and delete the now-unused `import { scopeIds } from "@/lib/permissions/check";`
- `src/app/clients/[id]/canvases/[cid]/(canvas)/page.tsx`: `getOrgReviewCounts(effectiveOrgId, accessOf(caller)),` and delete the now-unused `scopeIds` import
- `src/app/api/review/counts/route.ts`: `apiOk(await getOrgReviewCounts(orgId, accessOf(caller))),`, delete the `scopeIds` import, and change the last comment line to `// Counts are of the work the caller can approve, in the clients their access reaches.`

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/components src/lib/db src/lib/permissions src/app/api/review "src/app/(home)" src/app/clients`
Expected: PASS.

Run: `npx tsc --noEmit` and `npm run lint`
Expected: only the known tsc line; lint clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/permissions src/components/nodes src/lib/db/review.ts src/lib/db/scope-filters.test.ts "src/app/(home)/page.tsx" "src/app/clients/[id]/(canvases)/page.tsx" "src/app/clients/[id]/canvases/[cid]/(canvas)/page.tsx" src/app/api/review/counts/route.ts
git commit -m "feat(permissions): approve follows the node's area; review counts follow review types"
git log -1 --format=%B
```

---

### Task 7: A read-only canvas and editor for people without `canvases.edit`

**Files:**
- Modify: `src/hooks/use-canvas-lock.ts`, `src/components/canvas/lock-banner.tsx`, `src/components/canvas/canvas.tsx:178-179,527-529,555-556`, `src/components/editor/editor-shell.tsx`, `src/app/clients/[id]/canvases/[cid]/edit/page.tsx`
- Test: `src/components/canvas/__tests__/lock-banner.test.tsx`

**Interfaces:**
- Consumes: `useCan` (Task 4); `ClientIdProvider` (`src/components/canvas/client-id-context.tsx`).
- Produces:
  - `useCanvasLock(canvasId: string, options?: { acquire?: boolean })` returns `{ canEdit, viewOnly, heldByName, canTakeOver, sessionId, takeOver, reportLockLost }`
  - `<LockBanner viewOnly?: boolean …>`
  - `EditorShell` takes a required `clientId: string` and provides `ClientIdContext` to the editor tree

Why this is enough: every editing surface on the canvas already reads `useCanvasEditable()` (25 components, including `EditableField`, which renders plain text and drops the dotted underline when it is false), the quick-add menu and keyboard shortcuts check `canEditRef`, and autosave only saves while `canEdit`. Feeding the permission into `canEdit` turns all of it off at once, while selection stays on.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/canvas/__tests__/lock-banner.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LockBanner } from "../lock-banner";

describe("LockBanner", () => {
  it("says the canvas is view only, with no take-over, for someone who can't edit it", () => {
    const html = renderToStaticMarkup(<LockBanner viewOnly heldByName={null} canTakeOver={false} onTakeOver={() => {}} />);
    expect(html).toContain("You can view this canvas. Editing is turned off for you.");
    expect(html).not.toContain("Take over editing");
  });

  it("keeps the take-over banner for an editor whose canvas someone else holds", () => {
    const html = renderToStaticMarkup(<LockBanner heldByName="Priya" canTakeOver onTakeOver={() => {}} />);
    expect(html).toContain("Priya is editing");
    expect(html).toContain("Take over editing");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/canvas/__tests__/lock-banner.test.tsx`
Expected: FAIL on the first case (no view-only text).

- [ ] **Step 3: `LockBanner` gains the view-only line**

Replace `src/components/canvas/lock-banner.tsx` with:

```tsx
"use client";

import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

// Shown when this session is read-only: either someone else holds the lock ("Take over" enables
// once their lock is stale), or the person may only view this canvas (no take-over: D493).
export function LockBanner({
  heldByName,
  canTakeOver,
  onTakeOver,
  viewOnly = false,
}: {
  heldByName: string | null;
  canTakeOver: boolean;
  onTakeOver: () => void;
  viewOnly?: boolean;
}) {
  return (
    <div className="pointer-events-auto absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-background/90 px-4 py-2 shadow-card backdrop-blur">
      <Lock className="size-4 text-muted-foreground" strokeWidth={1.5} />
      {viewOnly ? (
        <span className="text-sm text-muted-foreground">You can view this canvas. Editing is turned off for you.</span>
      ) : (
        <>
          <span className="text-sm text-muted-foreground">
            {heldByName ? `${heldByName} is editing` : "Another session is editing"} — you&apos;re
            viewing read-only.
          </span>
          <Button size="sm" variant="outline" disabled={!canTakeOver} onClick={onTakeOver}>
            Take over editing
          </Button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: `useCanvasLock` can stay out of the lock**

In `src/hooks/use-canvas-lock.ts`:

Replace the block comment above the function and the signature with:

```ts
// D33: acquires a per-tab lock on the canvas, heartbeats while editing, releases on
// unload, and polls for take-over while read-only.
//
// D493: someone without canvases.edit opens the canvas WITHOUT the lock (`acquire: false`): view
// only, no heartbeat, no take-over poll, and they never evict the person editing. D201 removed
// D161's URL-dependent opt-out because nothing on screen said which mode you were in; this one
// depends on a permission, and the banner says so. If the permission arrives mid-session the
// effect below acquires; if it goes, the heartbeat effect's cleanup releases the lock.
// Approval still does not require canEdit (D160).
export function useCanvasLock(canvasId: string, { acquire = true }: { acquire?: boolean } = {}) {
```

Change the acquire effect to:

```ts
  // Acquire on mount (and when the permission to edit arrives).
  useEffect(() => {
    if (!acquire) return;
    let cancelled = false;
    void trackConnection(() =>
      acquireCanvasLockAction(canvasId, sessionId, nameRef.current),
    ).then((r) => {
      if (cancelled || !r) return; // null = server unreachable; leave state, badge shows offline
      dispatch(r.ok ? { type: "acquired" } : { type: "denied", heldByName: r.heldBy.name });
    });
    return () => {
      cancelled = true;
    };
  }, [canvasId, sessionId, acquire]);

  const isEditor = acquire && isEditorState(state);
```

(the old `const isEditor = isEditorState(state);` line is replaced by the last line above).

Change the viewer poll effect's guard and deps:

```ts
  const isViewer = acquire && state.role === "viewer";
```

(the effect itself is unchanged; it already returns early on `!isViewer`).

Change the return value to:

```ts
  return {
    canEdit: isEditor,
    viewOnly: !acquire,
    heldByName: state.heldByName,
    canTakeOver: state.canTakeOver,
    sessionId,
    takeOver,
    reportLockLost,
  };
```

- [ ] **Step 5: The canvas passes the permission**

In `src/components/canvas/canvas.tsx`, add `import { useCan } from "@/components/permissions/use-can";` and replace:

```tsx
  const { canEdit, heldByName, canTakeOver, sessionId, takeOver, reportLockLost } =
    useCanvasLock(canvasId);
```

with:

```tsx
  // D493: without canvases.edit the canvas is view only: no lock, no dragging or connecting, no
  // add menu, fields render plain (everything below reads canEdit).
  const canEditCanvas = useCan("canvases.edit", clientId);
  const { canEdit, viewOnly, heldByName, canTakeOver, sessionId, takeOver, reportLockLost } =
    useCanvasLock(canvasId, { acquire: canEditCanvas });
```

Replace the banner:

```tsx
      {!canEdit && (
        <LockBanner viewOnly={viewOnly} heldByName={heldByName} canTakeOver={canTakeOver} onTakeOver={takeOver} />
      )}
```

and in `<ReactFlow`, after `nodesConnectable={canEdit}`, add:

```tsx
        edgesReconnectable={canEdit}
```

- [ ] **Step 6: The editor does the same**

`src/app/clients/[id]/canvases/[cid]/edit/page.tsx`: add `clientId={client.id}` to `<EditorShell`.

`src/components/editor/editor-shell.tsx`:
- Add the imports `import { ClientIdProvider } from "@/components/canvas/client-id-context";` and `import { useCan } from "@/components/permissions/use-can";`.
- Add `clientId: string;` to `type Props` after `canvasId: string;`.
- Wrap `EditorShell`'s return in the provider (the export button and its dialogs read the client from it in Tasks 9 and 10):

```tsx
export function EditorShell(props: Props) {
  return (
    <ClientIdProvider value={props.clientId}>
      <EditorStoreProvider doc={props.initialState.doc} sources={props.initialState.sources}>
        <EditorPlaybackProvider>
          <AutoCaptionsProvider canvasId={props.canvasId} nodeId={props.initialState.editorNodeId}>
            <EditorViewProvider>
              <EditorShellBody {...props} />
            </EditorViewProvider>
          </AutoCaptionsProvider>
        </EditorPlaybackProvider>
      </EditorStoreProvider>
    </ClientIdProvider>
  );
}
```

- Change the start of `EditorShellBody` to:

```tsx
function EditorShellBody({ canvasId, clientId, canvasPath, breadcrumb, title, initialState }: Props) {
  // D493: holding the lock is editing. Without canvases.edit and video_editor.edit the cut opens
  // view only and never takes the lock from whoever is editing.
  const canEditCanvas = useCan("canvases.edit", clientId);
  const canEditCut = useCan("video_editor.edit", clientId);
  const lock = useCanvasLock(canvasId, { acquire: canEditCanvas && canEditCut });
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run src/components src/hooks src/lib/canvas`
Expected: PASS.

Run: `npx tsc --noEmit` and `npm run lint`
Expected: only the known tsc line; lint clean.

- [ ] **Step 8: Check in the browser**

With a person whose access lacks `canvases.edit` (for a local check, temporarily revoke it in `membership_permission_changes` on a local database, never staging or production), open a canvas.
Expected: the "You can view this canvas" banner; nodes can be selected and focus views opened but not dragged or connected; right-click on the pane opens nothing; no `acquireCanvasLockAction` request in the Network panel; editable titles show no dotted underline.

- [ ] **Step 9: Commit**

```bash
git add src/hooks/use-canvas-lock.ts src/components/canvas src/components/editor/editor-shell.tsx "src/app/clients/[id]/canvases/[cid]/edit/page.tsx"
git commit -m "feat(permissions): canvas and editor open view only without canvases.edit, without taking the lock"
git log -1 --format=%B
```

---

### Task 8: Hidden when missing: clients, canvases, client sections

**Files:**
- Create: `src/components/clients/use-client-sections.ts`
- Modify: `src/components/clients/client-sections.ts`, `src/components/clients/client-section-links.tsx`, `src/components/clients/client-row-actions.tsx`, `src/components/clients/client-settings-menu.tsx`, `src/components/clients/client-tile.tsx`, `src/components/clients/clients-home-tabs.tsx`, `src/components/canvases/canvases-table.tsx`, `src/app/clients/[id]/(canvases)/page.tsx`
- Test: `src/components/clients/__tests__/client-sections.test.tsx`

**Interfaces:**
- Consumes: `useCan`, `useAppAbility` (Task 4); `canInBrowser` (Task 1); `can` (`src/lib/permissions/check.ts`, server); `TestAbilityProvider`.
- Produces:
  - `ClientSection` gains `need: ClientScopedKey`
  - `useClientSections(clientId: string): ClientSection[]`
  - `ClientSettingsMenu` takes `clientId`; `ClientSectionLinks` takes `clientId`; `CanvasesTable` takes `clientId`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/clients/__tests__/client-sections.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PermissionKey } from "@/lib/permissions/catalogue";
import { TestAbilityProvider } from "@/components/permissions/test-ability-provider";
import { ClientSectionLinks } from "../client-section-links";
import { useClientSections } from "../use-client-sections";

function Labels() {
  return <p>{useClientSections("c1").map((s) => s.label).join(",")}</p>;
}
const render = (keys: readonly PermissionKey[], el = <Labels />) =>
  renderToStaticMarkup(<TestAbilityProvider keys={keys}>{el}</TestAbilityProvider>);

describe("client sections", () => {
  it("lists only the sections whose area the person can view", () => {
    expect(render(["scripts.view", "market.view"])).toContain("Scripts,Market");
  });

  it("lists every section with every view", () => {
    expect(render(["scripts.view", "brand_knowledge.view", "brand_assets.view", "market.view", "avatars.view"]))
      .toContain("Scripts,Brand KB,Brand assets,Market,Avatars");
  });

  it("the tile's pinned links drop a section the person can't view", () => {
    const html = render(["avatars.view"], <ClientSectionLinks clientId="c1" slug="acme" clientName="Acme" />);
    expect(html).toContain("Avatars");
    expect(html).not.toContain("Scripts");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/clients`
Expected: FAIL, `Failed to resolve import "../use-client-sections"`.

- [ ] **Step 3: Sections name their view key**

In `src/components/clients/client-sections.ts`, add `import type { ClientScopedKey } from "@/lib/permissions/catalogue";`, add to `ClientSection`:

```ts
  /** The view a person needs to see this section's link (D493: no view → not shown). */
  need: ClientScopedKey;
```

and add one field to each entry: Scripts `need: "scripts.view",`, Brand KB `need: "brand_knowledge.view",`, Brand assets `need: "brand_assets.view",`, Market `need: "market.view",`, Avatars `need: "avatars.view",`.

```ts
// src/components/clients/use-client-sections.ts
"use client";

import { useAppAbility } from "@/components/permissions/use-can";
import { canInBrowser } from "@/lib/permissions/browser";
import { CLIENT_SECTIONS, type ClientSection } from "./client-sections";

/** The client's sections this person can view, in display order. One filter for every entry point. */
export function useClientSections(clientId: string): ClientSection[] {
  const ability = useAppAbility();
  return CLIENT_SECTIONS.filter((s) => canInBrowser(ability, s.need, clientId));
}
```

- [ ] **Step 4: The three entry points use it**

`src/components/clients/client-section-links.tsx`: add `"use client";` as the first line, replace the `CLIENT_SECTIONS` import and the `PINNED` constant with `import { useClientSections } from "@/components/clients/use-client-sections";`, change the signature to `export function ClientSectionLinks({ clientId, slug, clientName }: { clientId: string; slug: string; clientName: string }) {`, add as its first lines:

```tsx
  const pinned = useClientSections(clientId).filter((s) => s.pinned);
  if (pinned.length === 0) return null;
```

and map `pinned` instead of `PINNED`.

`src/components/clients/client-tile.tsx`: `{!archived && <ClientSectionLinks clientId={client.id} slug={client.slug} clientName={client.name} />}`.

`src/components/clients/client-settings-menu.tsx`: replace the `CLIENT_SECTIONS` import with `import { useClientSections } from "@/components/clients/use-client-sections";`, change the signature to `export function ClientSettingsMenu({ clientId, slug }: { clientId: string; slug: string }) {`, add as its first lines:

```tsx
  const sections = useClientSections(clientId);
  if (sections.length === 0) return null;
```

and map `sections` instead of `CLIENT_SECTIONS`.

`src/components/clients/client-row-actions.tsx`: replace the `CLIENT_SECTIONS` import and the `UNPINNED` constant with:

```tsx
import { useCan } from "@/components/permissions/use-can";
import { useClientSections } from "@/components/clients/use-client-sections";
```

After `const [pending, startTransition] = useTransition();` add:

```tsx
  // D493: sections the person can't view, and Archive without clients.delete, are not shown. The
  // sections are hidden for archived clients: shortcuts into a recovery view would invite work
  // on a client nobody is meant to be working on.
  const unpinned = useClientSections(clientId).filter((s) => !s.pinned);
  const canArchive = useCan("clients.delete");
  const showSections = !archived && unpinned.length > 0;
```

After the `toggle` function add:

```tsx
  if (!showSections && !canArchive) return null;
```

Replace the `PopoverContent` children with:

```tsx
        {showSections && (
          <>
            {unpinned.map((section) => (
              <Button
                key={section.label}
                variant="ghost"
                nativeButton={false}
                className={itemClass}
                render={<Link href={section.href(slug)} />}
              >
                <section.icon className="size-4" strokeWidth={1.5} />
                {section.label}
              </Button>
            ))}
            {canArchive && <div className="-mx-1 my-1 border-t" aria-hidden />}
          </>
        )}
        {canArchive && (
          <Button
            type="button"
            variant="ghost"
            onClick={toggle}
            disabled={pending}
            className={itemClass}
          >
            {archived ? (
              <ArchiveRestore className="size-4" strokeWidth={1.5} />
            ) : (
              <Archive className="size-4" strokeWidth={1.5} />
            )}
            {archived ? "Unarchive" : "Archive"}
          </Button>
        )}
```

and delete the old comment above `UNPINNED`.

- [ ] **Step 5: New client, new canvas, rename and delete**

`src/components/clients/clients-home-tabs.tsx`: add `import { useCan } from "@/components/permissions/use-can";`, add after `const liveCounts = useReviewCounts(reviewCounts);`:

```tsx
  const canCreateClients = useCan("clients.edit");
```

and change the two `NewClientDialog` sites to:

```tsx
          {tab === "clients" && canCreateClients && <NewClientDialog />}
```

```tsx
            action={canCreateClients ? <NewClientDialog trigger={<Button>+ Add client</Button>} /> : undefined}
```

`src/app/clients/[id]/(canvases)/page.tsx` (a Server Component: it checks with `can` directly): add `import { can } from "@/lib/permissions/check";`, add after the `Promise.all`:

```tsx
  const canAddCanvas = can(accessOf(caller), "canvases.edit", client.id);
```

and change:

```tsx
          <ClientSettingsMenu clientId={client.id} slug={client.slug} />
          {canAddCanvas && <NewCanvasDialog clientId={client.id} clientSlug={client.slug} />}
```

```tsx
          action={
            canAddCanvas ? (
              <NewCanvasDialog
                clientId={client.id}
                clientSlug={client.slug}
                trigger={<Button>+ New canvas</Button>}
              />
            ) : undefined
          }
```

```tsx
          <CanvasesTable
            canvases={canvases}
            clientId={client.id}
            clientSlug={client.slug}
            reviewCounts={reviewCounts}
          />
```

`src/components/canvases/canvases-table.tsx`: add `import { useCan } from "@/components/permissions/use-can";`, add `clientId` to the props (`clientId: string;` in the type, `clientId,` in the destructure), add after `const liveCounts = useReviewCounts(reviewCounts);`:

```tsx
  // D493: Rename needs canvases.edit, Delete canvases.delete; without either the ⋯ menu is not shown.
  const canRename = useCan("canvases.edit", clientId);
  const canDelete = useCan("canvases.delete", clientId);
```

wrap the row's whole `<Popover>…</Popover>` (the ⋯ trigger and its content) in `{(canRename || canDelete) && ( … )}`, and wrap the two items:

```tsx
                        {canRename && (
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-auto w-full justify-start gap-2 rounded-md px-2 py-1.5 font-normal"
                            onClick={() => openRename(canvas)}
                          >
                            <Pencil className="size-3.5" strokeWidth={1.5} />
                            Rename
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-auto w-full justify-start gap-2 rounded-md px-2 py-1.5 font-normal text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setDeletingCanvas(canvas)}
                          >
                            <Trash2 className="size-3.5" strokeWidth={1.5} />
                            Delete
                          </Button>
                        )}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/components src/app/clients`
Expected: PASS.

Run: `npx tsc --noEmit` and `npm run lint`
Expected: only the known tsc line; lint clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/clients src/components/canvases/canvases-table.tsx "src/app/clients/[id]/(canvases)/page.tsx"
git commit -m "feat(permissions): hide client, canvas and section actions the person can't take"
git log -1 --format=%B
```

---

### Task 9: Hidden when missing: script mark-final and reopen, sharing, editor export, review inbox

**Files:**
- Modify: `src/components/scripts/generate/mark-final-bar.tsx`, `src/components/scripts/generate/generate-script-pane.tsx`, `src/components/visualise/visualise-readiness.tsx`, `src/components/visualise/visualise-view.tsx`, `src/components/script-review/team/review-actions.tsx`, `src/components/nodes/client-review-node.tsx`, `src/components/canvas/client-feedback-drawer/client-feedback-drawer.tsx`, `src/components/editor/editor-export-button.tsx`, `src/components/identity/review-inbox.tsx`, `src/hooks/use-review-counts.ts`
- Test: update `src/components/scripts/generate/__tests__/mark-final-bar.test.tsx`, `src/components/script-review/__tests__/review-actions.test.tsx`, `src/components/script-review/__tests__/team-review-board.test.tsx`

**Interfaces:**
- Consumes: `useCan` (Task 4); `GENERATE_OFF_REASON` (Task 5); `useClientId`; `TestAbilityProvider`.
- Produces: `MarkFinalBar` optional prop `canMarkFinal?: boolean` (default `true`); `VisualiseReadiness` optional prop `canReopen?: boolean` (default `true`).

- [ ] **Step 1: Write the failing tests**

In `src/components/scripts/generate/__tests__/mark-final-bar.test.tsx`, change `bar` to accept the new prop and add a case:

```tsx
const bar = (over: { disabled?: boolean; canMarkFinal?: boolean } = {}) =>
  renderToStaticMarkup(<MarkFinalBar openItems={items} canUndo={false} onUndo={() => {}} onMarkFinal={() => {}} pending={false} disabled={over.disabled ?? false} canMarkFinal={over.canMarkFinal} />);
```

```tsx
  it("is not shown without scripts.approve; Undo and the open count stay", () => {
    const html = bar({ canMarkFinal: false });
    expect(html).not.toContain("Mark final");
    expect(html).toContain("Undo");
    expect(html).toContain("2 still open");
  });
```

In `src/components/script-review/__tests__/review-actions.test.tsx`, add `import type { PermissionKey } from "@/lib/permissions/catalogue";`, `import { ALL_PERMISSION_KEYS } from "@/lib/permissions/catalogue";` and `import { TestAbilityProvider } from "@/components/permissions/test-ability-provider";`, replace `render` with:

```tsx
const render = (s: Script, r: TeamScriptReview | undefined, keys: readonly PermissionKey[] = ALL_PERMISSION_KEYS) =>
  renderInSurface(
    testSurface({ mode: "team" }),
    <TestAbilityProvider keys={keys}>
      <QueryClientProvider client={new QueryClient()}>
        <ReviewActions clientId="c1" script={s} review={r} commentCount={2} />
      </QueryClientProvider>
    </TestAbilityProvider>,
  );
```

and add:

```tsx
  it("hides Share and Copy link without client_review.share", () => {
    const html = render(script("in_review"), review({}), ALL_PERMISSION_KEYS.filter((k) => k !== "client_review.share"));
    expect(html).not.toContain("Share");
    expect(html).not.toContain("Copy link");
  });
```

In `src/components/script-review/__tests__/team-review-board.test.tsx`, add `import { TestAbilityProvider } from "@/components/permissions/test-ability-provider";` and wrap the rendered tree: `renderToStaticMarkup(<TestAbilityProvider><QueryClientProvider client={new QueryClient()}>…</QueryClientProvider></TestAbilityProvider>)`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/scripts src/components/script-review`
Expected: FAIL (Mark final still shown; Share shown without the key).

- [ ] **Step 3: Mark final and Reopen**

`src/components/scripts/generate/mark-final-bar.tsx`: add `canMarkFinal = true` to the destructure and to the props type:

```tsx
  /** False without scripts.approve: Mark final and its confirm are not shown (D493). */
  canMarkFinal?: boolean;
```

and wrap the `<TooltipProvider>…</TooltipProvider>` and `<AlertDialog>…</AlertDialog>` blocks in `{canMarkFinal && (<>…</>)}`.

`src/components/scripts/generate/generate-script-pane.tsx`: add `import { useCan } from "@/components/permissions/use-can";`, add after `const markFinal = useMarkFinal(clientId, script.id);`:

```tsx
  const canMarkFinal = useCan("scripts.approve", clientId);
```

and pass `canMarkFinal={canMarkFinal}` to `<MarkFinalBar`.

`src/components/visualise/visualise-readiness.tsx`: add to `Props`:

```tsx
  /** False without scripts.approve: Reopen is not shown (D493). */
  canReopen?: boolean;
```

add `canReopen = true` to the destructure, and change the Reopen line to:

```tsx
        {stage === "visualise" && canReopen && <ReopenDialog busy={reopening} onConfirm={onReopen} />}
```

`src/components/visualise/visualise-view.tsx`: add `import { useCan } from "@/components/permissions/use-can";`, add after `const reopen = useReopenScript(clientId, script.id);`:

```tsx
  const canReopen = useCan("scripts.approve", clientId);
```

and pass `canReopen={canReopen}` to `<VisualiseReadiness`.

- [ ] **Step 4: Sharing for client review**

`src/components/script-review/team/review-actions.tsx`: add `import { useCan } from "@/components/permissions/use-can";`, add after `const move = useMoveScriptStage(clientId, script.id);`:

```tsx
  // D493: sharing needs client_review.share; a stage move needs client_review.edit, and Move to
  // In review is the share dialog, so it needs both.
  const canShare = useCan("client_review.share", clientId);
  const canMove = useCan("client_review.edit", clientId);
```

and replace the three lines that render `ShareDialog`, `CopyLinkButton` and the moves with:

```tsx
      {canShare && (stage === "in_review" || (stage === "visualise" && canMove)) && (
        <ShareDialog clientId={clientId} script={script} latest={latest} moving={stage === "visualise"} />
      )}
      {canShare && path && <CopyLinkButton path={path} />}
      {canMove && teamMovesFrom(stage).filter((m) => m !== "to_review").map((m) => (
        <Button key={m} variant="outline" size="sm" disabled={move.isPending} onClick={() => void run(m)}>
          {TEAM_STAGE_MOVES[m].label}
        </Button>
      ))}
```

`src/components/nodes/client-review-node.tsx`: add `import { useCan } from "@/components/permissions/use-can";` and `import { useClientId } from "@/components/canvas/client-id-context";`, add next to the existing `useCanvasEditable()` line:

```tsx
  // D493: uploading the cut makes the client's review link, so it needs client_review.share.
  const canShare = useCan("client_review.share", useClientId());
```

and change `) : editable ? (` (the branch rendering `ClientReviewUpload`) to `) : editable && canShare ? (`.

`src/components/canvas/client-feedback-drawer/client-feedback-drawer.tsx`: same two imports and the same `canShare` line next to its `useCanvasEditable()` line, and change `) : !editable ? (` to `) : !editable || !canShare ? (`.

- [ ] **Step 5: Editor export**

`src/components/editor/editor-export-button.tsx`: add `import { useCan } from "@/components/permissions/use-can";`, `import { useClientId } from "@/components/canvas/client-id-context";` and `import { GENERATE_OFF_REASON } from "@/components/permissions/gated-button";`. After the `dubLanguage` line add:

```tsx
  // D493: the MP4 is a render (video_editor.generate); the Premiere package is sharing the edit
  // (video_editor.share). Without either, Export is not shown.
  const clientId = useClientId();
  const canRender = useCan("video_editor.generate", clientId);
  const canPackage = useCan("video_editor.share", clientId);
```

Before `return (` add:

```tsx
  if (!canRender && !canPackage) return null;
```

Replace the two `DropdownMenuItem`s with:

```tsx
          <DropdownMenuItem disabled={!canRender} onClick={() => setMp4Open(true)} className="items-start gap-3 py-2">
            <Film className="mt-0.5 size-4" strokeWidth={1.5} />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">MP4 video</span>
              <span className="text-xs text-muted-foreground">{canRender ? "Ready to post or send" : GENERATE_OFF_REASON}</span>
            </span>
          </DropdownMenuItem>
          {canPackage && (
            <DropdownMenuItem onClick={() => void run()} className="items-start gap-3 py-2">
              <Clapperboard className="mt-0.5 size-4" strokeWidth={1.5} />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">Premiere Pro package</span>
                <span className="text-xs text-muted-foreground">An editable sequence for your editor</span>
              </span>
            </DropdownMenuItem>
          )}
```

- [ ] **Step 6: Review inbox and live counts**

`src/components/identity/review-inbox.tsx`: add `import { useCan } from "@/components/permissions/use-can";`, and replace the first lines of `ReviewInbox` through the `useReviewList(…)` call with:

```tsx
export function ReviewInbox() {
  const { hydrated } = useIdentity();
  // D493: no internal_review.view → no inbox, and no request the server would refuse.
  const canReview = useCan("internal_review.view");
  const [open, setOpen] = useState(false);
  // Kept subscribed while closed so the badge count is live — the badge IS the feature
  // (R9.1); a count that only updates when you open the popover would be pointless.
  const { items, loading, loadingMore, hasMore, loadMore } = useReviewList(
    "/api/review/inbox",
    hydrated && canReview,
  );
```

and change the first early return to:

```tsx
  if (!canReview || !hydrated || (!loading && items.length === 0)) return null;
```

`src/hooks/use-review-counts.ts`: add `import { useCan } from "@/components/permissions/use-can";`, add after `const { orgId } = useIdentity();`:

```ts
  // No internal_review.view: keep the server's counts and don't ask for a refresh it would refuse.
  const canReview = useCan("internal_review.view");
```

and change the effect's guard and deps to `if (!orgId || !canReview) return;` and `}, [orgId, canReview]);`.

- [ ] **Step 7: Run tests**

Run: `npx vitest run src/components src/hooks`
Expected: PASS.

Run: `npx tsc --noEmit` and `npm run lint`
Expected: only the known tsc line; lint clean.

- [ ] **Step 8: Commit**

```bash
git add src/components/scripts src/components/visualise src/components/script-review src/components/nodes/client-review-node.tsx src/components/canvas/client-feedback-drawer src/components/editor/editor-export-button.tsx src/components/identity/review-inbox.tsx src/hooks/use-review-counts.ts
git commit -m "feat(permissions): hide mark final, reopen, sharing, export and the inbox without their ticks"
git log -1 --format=%B
```

---

### Task 10: Download buttons follow `downloads.view` / `downloads.share`

**Files:**
- Create: `src/lib/permissions/downloads.ts`
- Modify: `src/components/permissions/use-can.ts`, `src/components/nodes/image-gen-focus-view.tsx:1666-1675,1702`, `src/components/nodes/post-focus-view.tsx:523-525`, `src/components/editor/editor-export-dialog.tsx:78-83`, `src/components/editor/editor-render-dialog.tsx:119-124`, `src/lib/permissions/not-yet-checked.ts`, `src/lib/actions/with-action-coverage.test.ts`
- Test: `src/lib/permissions/downloads.test.ts`

**Interfaces:**
- Consumes: `canInBrowser` (Task 1); `useAppAbility` (Task 4); `useClientId`.
- Produces: `canDownload(ability: AppAbility, clientId: string, approved: boolean): boolean`; `useCanDownload(clientId: string, approved: boolean): boolean`.

Every place the app hands the browser a file to save, found by `grep -rn "\.download = \|download=" src`: the image focus view (a version, which has an approval status), the post's PNG, and the editor's MP4 and Premiere results. `use-post-export.ts` is the post's PNG; `editor-captions-more-menu.tsx`'s "Export SRT" writes captions text the person typed, not a stored file, so it stays ungated. Showing media inside the app stays under the area's view.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/permissions/downloads.test.ts
import { describe, it, expect } from "vitest";
import { testAccess } from "./test-fixtures";
import { canDownload } from "./downloads";

const ability = (keys: Parameters<typeof testAccess>[0]["keys"]) => testAccess({ keys, clientIds: ["c1"] }).ability;

describe("canDownload", () => {
  it("downloads.view: approved finals only", () => {
    expect(canDownload(ability(["downloads.view"]), "c1", true)).toBe(true);
    expect(canDownload(ability(["downloads.view"]), "c1", false)).toBe(false);
  });

  it("downloads.share: anything, drafts included", () => {
    expect(canDownload(ability(["downloads.share"]), "c1", false)).toBe(true);
    expect(canDownload(ability(["downloads.share"]), "c1", true)).toBe(true);
  });

  it("neither, or a client outside the list: nothing", () => {
    expect(canDownload(ability([]), "c1", true)).toBe(false);
    expect(canDownload(ability(["downloads.share"]), "c2", false)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/permissions/downloads.test.ts`
Expected: FAIL, `Failed to resolve import "./downloads"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/permissions/downloads.ts
import type { AppAbility } from "./ability";
import { canInBrowser } from "./browser";

// D489 Downloads. UI ONLY: files sit in public storage buckets, so these ticks hide download
// buttons but cannot stop someone who has a file's URL. Making the buckets private is its own
// project (spec §5.2). View = approved finals; Share = anything, drafts included.
export function canDownload(ability: AppAbility, clientId: string, approved: boolean): boolean {
  if (canInBrowser(ability, "downloads.share", clientId)) return true;
  return approved && canInBrowser(ability, "downloads.view", clientId);
}
```

Add to `src/components/permissions/use-can.ts`:

```ts
import { canDownload } from "@/lib/permissions/downloads";
```

```ts
/** Whether to show a download button. `approved`: the file is an approved version. */
export function useCanDownload(clientId: string, approved: boolean): boolean {
  return canDownload(useAppAbility(), clientId, approved);
}
```

- [ ] **Step 4: Gate the buttons**

`src/components/nodes/image-gen-focus-view.tsx`: add `import { useCanDownload } from "@/components/permissions/use-can";` and `import { useClientId } from "@/components/canvas/client-id-context";`, add after `const [approvalSaving, setApprovalSaving] = useState(false);`:

```tsx
  const canDownloadImage = useCanDownload(useClientId(), approvalStatus === "approved");
```

wrap the Download `<Button … aria-label="Download image">…</Button>` (the one with `onClick={handleDownload}`) in `{canDownloadImage && ( … )}`, and change the zoom's prop to `onDownload={canDownloadImage ? handleDownload : undefined}` (`FullScreenImageZoom` already hides its button when `onDownload` is undefined).

`src/components/nodes/post-focus-view.tsx`: add `import { useCanDownload } from "@/components/permissions/use-can";`, add after `const clientId = useClientId();`:

```tsx
  // A post has no approval status, so its PNG downloads under downloads.share.
  const canDownloadPost = useCanDownload(clientId, false);
```

and wrap the Download button:

```tsx
                {canDownloadPost && (
                  <Button size="sm" onClick={downloadPng} disabled={isExporting}>
                    {isExporting ? "Exporting…" : "Download"}
                  </Button>
                )}
```

`src/components/editor/editor-export-dialog.tsx` and `src/components/editor/editor-render-dialog.tsx`: add `import { useCanDownload } from "@/components/permissions/use-can";` and `import { useClientId } from "@/components/canvas/client-id-context";`, add as the first line of each component:

```tsx
  // An editor result is not an approved version, so it downloads under downloads.share (D493).
  const canDownload = useCanDownload(useClientId(), false);
```

and replace the `{result && ( <Button … download …> )}` block with:

```tsx
          {result && canDownload && (
            <Button nativeButton={false} render={<a href={result.url} download={result.fileName} />} className="min-w-0 gap-2 font-semibold">
              <Download className="size-4 flex-none" strokeWidth={1.5} />
              <span className="truncate">Download {result.fileName}</span>
            </Button>
          )}
          {result && !canDownload && (
            <p className="self-center text-sm text-muted-foreground">Downloading is turned off for you. Ask your agency owner.</p>
          )}
```

- [ ] **Step 5: The coverage test counts the UI check for these two keys**

In `src/lib/permissions/not-yet-checked.ts`, delete the two `downloads.*` lines. The file then lists only `team.*`.

In `src/lib/actions/with-action-coverage.test.ts`, add to the end of the `sources` list (after `"src/lib/me/payload.ts",`):

```ts
    // downloads.* are checked in the browser only (files sit in public buckets); this is where.
    "src/lib/permissions/downloads.ts",
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/lib/permissions src/lib/actions/with-action-coverage.test.ts src/components`
Expected: PASS.

Run: `npx tsc --noEmit` and `npm run lint`
Expected: only the known tsc line; lint clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/permissions src/components/permissions/use-can.ts src/components/nodes/image-gen-focus-view.tsx src/components/nodes/post-focus-view.tsx src/components/editor/editor-export-dialog.tsx src/components/editor/editor-render-dialog.tsx src/lib/actions/with-action-coverage.test.ts
git commit -m "feat(permissions): download buttons follow downloads.view and downloads.share (UI only)"
git log -1 --format=%B
```

---

### Task 11: Profile shows the preset; `orgRole` and `Identity.role` go

**Files:**
- Modify: `src/components/identity/profile-popover.tsx`, `src/lib/me/types.ts`, `src/lib/me/payload.ts`, `src/lib/me/test-fixtures.ts`, `src/hooks/use-identity.ts`, `src/lib/identity.ts`, `src/lib/dal-logic.ts`, `src/lib/dal.ts`, `src/lib/dal-logic.test.ts`, `src/lib/dal-org-resolution.test.ts`, test mocks that set `orgRole`
- Delete: `src/lib/identity.test.ts`
- Test: `src/components/identity/__tests__/profile-popover.test.tsx`

**Interfaces:**
- Consumes: `useIdentity().presetName`, `.creditsUsed` (Task 3).
- Produces: `MePayload` without `role` / `orgRole`; `Identity = { name: string }`; `CallerContext` without `orgRole`; `useIdentity()` without `orgRole`. `OrgRole` stays: the admin add-member flow and `src/lib/db/organizations.ts` still write `org_memberships.org_role` until plan 3 retires that flow. `presetKeyToOrgRole` goes (nothing reads it once `CallerContext.orgRole` is gone).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/identity/__tests__/profile-popover.test.tsx
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

describe("ProfilePopover", () => {
  it("shows the preset's name, never a role label", () => {
    const source = readFileSync("src/components/identity/profile-popover.tsx", "utf8");
    expect(source).toContain("presetName");
    expect(source).not.toContain("ROLE_LABELS");
    expect(source).not.toContain("orgRole");
  });

  it("opens the credits channel only when credit figures are shown", () => {
    const source = readFileSync("src/components/identity/profile-popover.tsx", "utf8");
    expect(source).toMatch(/if \(!hydrated \|\| !orgId \|\| !showCredits\) return;/);
  });
});
```

(The popover's content is portaled and unmounted while closed, so static markup can't show it; this test pins the two facts in its source.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/identity`
Expected: FAIL (`ROLE_LABELS` present).

- [ ] **Step 3: The popover**

In `src/components/identity/profile-popover.tsx`:
- Delete `import type { OrgRole } from "@/lib/dal-logic";` and the `ROLE_LABELS` constant.
- Change the destructure to:

```tsx
  const { hydrated, identity, orgId, orgName, presetName, creditsUsed, monthlyCreditLimit } =
    useIdentity();
  // Null without credits.view: the server sends no figures, and nothing listens for them.
  const showCredits = creditsUsed !== null;
```

- In the realtime effect, change the guard to `if (!hydrated || !orgId || !showCredits) return;` and the deps to `}, [hydrated, orgId, showCredits]);`.
- Replace the role line with:

```tsx
                {presetName && (
                  <span className="text-sm text-muted-foreground">{presetName}</span>
                )}
```

- Change the comment at the top of the component: `name, real role, credits` → `name, preset, credits`.

- [ ] **Step 4: Remove `role` and `orgRole` from the payload and identity**

- `src/lib/me/types.ts`: delete the `role` and `orgRole` fields and the `OrgRole` import.
- `src/lib/me/payload.ts`: delete the `role:` and `orgRole:` lines and the `orgRoleToIdentityRole` import.
- `src/lib/me/test-fixtures.ts`: delete the `role:` and `orgRole:` lines.
- `src/hooks/use-identity.ts`: `identity: data ? { name: data.name } : null,`; delete `orgRole` from the return type and object and drop `OrgRole` from the import.
- Replace `src/lib/identity.ts` with:

```ts
// The signed-in person's display name, from the session via /api/me (useIdentity()). What they
// may do is in the ability (D493), never here. Use this to decide what to RENDER, never what to
// permit: the server checks every route and action.
export type Identity = { name: string };
```

- Delete `src/lib/identity.test.ts` (it tested the localStorage helpers the old file marked "UNUSED … Safe to delete").

- [ ] **Step 5: Remove `orgRole` from the caller**

- `src/lib/dal-logic.ts`: delete the `orgRole` field from `CallerContext`, and delete `orgRoleToIdentityRole` and `presetKeyToOrgRole` with their comments. Keep `export type OrgRole`.
- `src/lib/dal.ts`: delete `presetKeyToOrgRole,` from the import and the `orgRole: presetKeyToOrgRole(row.preset_key),` line.
- `src/lib/dal-logic.test.ts`: delete the `describe("orgRoleToIdentityRole", …)` and `describe("presetKeyToOrgRole", …)` blocks and their names from the import.
- `src/lib/dal-org-resolution.test.ts`: delete the line `expect(caller.orgRole).toBe("designer");` (the next line already asserts `caller.access.presetKey`).
- Test mocks that still set the field (nothing reads it any more):

```bash
grep -rlE 'orgRole: "(owner|senior|designer)"' src --include=*.test.ts | xargs sed -i -E 's/, orgRole: "(owner|senior|designer)"//; /^\s*orgRole: "(owner|senior|designer)",\s*$/d'
```

Run: `grep -rn "orgRole" src --include=*.ts --include=*.tsx | grep -v "src/app/admin\|src/lib/actions/admin.ts\|src/lib/db/organizations.ts\|src/lib/orgs/org-schema.ts\|src/lib/actions/approval.test.ts"`
Expected: no output. (Those files are the admin add-member flow, which writes the old column until plan 3, and `approval.test.ts`'s own `caller(orgRole)` helper parameter.)

Run: `grep -rn "orgRoleToIdentityRole\|presetKeyToOrgRole\|ROLE_LABELS" src`
Expected: no output.

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/lib src/hooks src/components src/app/api/me`
Expected: PASS.

Run: `npx tsc --noEmit` and `npm run lint`
Expected: only the known tsc line; lint clean.

- [ ] **Step 7: Commit**

```bash
git add -A src
git commit -m "refactor(permissions): profile shows the preset; remove orgRole and Identity.role"
git log -1 --format=%B
```

---

### Task 12: Lint rule against comparing preset names

**Files:**
- Modify: `eslint.config.mjs`
- Test: `src/lib/permissions/preset-lint.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `no-restricted-syntax` errors for `==`, `===`, `!=`, `!==` comparisons and `switch` on `presetKey` (a variable or a property, optional chaining included) in `src/components/**` and `src/hooks/**`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/permissions/preset-lint.test.ts
import { describe, it, expect } from "vitest";
import { ESLint } from "eslint";

// D493 §6.4: check capabilities, never preset names. Lints snippets as if they lived in
// src/components, through the repo's own config.
const eslint = new ESLint({ cwd: process.cwd() });

async function restricted(code: string, filePath = "src/components/permissions/__lint_probe__.tsx") {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m) => m.ruleId === "no-restricted-syntax").map((m) => m.message);
}

describe("preset comparisons are lint errors in components and hooks", () => {
  it.each([
    `export const f = (me: { presetKey: string }) => me.presetKey === "senior";`,
    `export const f = (me?: { presetKey: string }) => "owner" !== me?.presetKey;`,
    `export const f = (presetKey: string) => presetKey == "designer";`,
    `export function f(me: { presetKey: string }) { switch (me.presetKey) { default: return 1; } }`,
  ])("flags %s", async (code) => {
    expect((await restricted(code)).length).toBeGreaterThan(0);
  }, 60_000);

  it("flags it in src/hooks too", async () => {
    expect((await restricted(`export const f = (presetKey: string) => presetKey === "x";`, "src/hooks/__lint_probe__.ts")).length).toBeGreaterThan(0);
  }, 60_000);

  it("allows reading it for display, and allows it on the server", async () => {
    expect(await restricted(`export const f = (me: { presetKey: string }) => me.presetKey;`)).toEqual([]);
    expect(await restricted(`export const f = (presetKey: string) => presetKey === "owner";`, "src/lib/permissions/__lint_probe__.ts")).toEqual([]);
  }, 60_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/permissions/preset-lint.test.ts`
Expected: FAIL (no `no-restricted-syntax` messages).

- [ ] **Step 3: Add the rule**

In `eslint.config.mjs`, add this entry to the `defineConfig([...])` array after `...nextTs,`:

```js
  // D493 §6.4: the browser checks capabilities (useCan("scripts.approve")), never preset names.
  {
    files: ["src/components/**/*.{ts,tsx}", "src/hooks/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: [
            "BinaryExpression[operator=/^[!=]==?$/][left.name='presetKey']",
            "BinaryExpression[operator=/^[!=]==?$/][right.name='presetKey']",
            "BinaryExpression[operator=/^[!=]==?$/][left.property.name='presetKey']",
            "BinaryExpression[operator=/^[!=]==?$/][right.property.name='presetKey']",
            "BinaryExpression[operator=/^[!=]==?$/][left.expression.property.name='presetKey']",
            "BinaryExpression[operator=/^[!=]==?$/][right.expression.property.name='presetKey']",
            "SwitchStatement[discriminant.name='presetKey']",
            "SwitchStatement[discriminant.property.name='presetKey']",
            "SwitchStatement[discriminant.expression.property.name='presetKey']",
          ].join(", "),
          message: "Check a permission with useCan(...), never a preset name (spec §6.4).",
        },
      ],
    },
  },
```

- [ ] **Step 4: Run tests and the linter**

Run: `npx vitest run src/lib/permissions/preset-lint.test.ts`
Expected: PASS.

Run: `npm run lint`
Expected: clean (no component or hook compares `presetKey` today).

- [ ] **Step 5: Commit**

```bash
git add eslint.config.mjs src/lib/permissions/preset-lint.test.ts
git commit -m "chore(lint): comparing preset names in components and hooks is an error"
git log -1 --format=%B
```

---

### Task 13: Record the refinements, then verify everything

**Files:**
- Modify: `docs/superpowers/specs/2026-11-11-permission-based-access-design.md` (§6.3, §6.4)
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (D493)

- [ ] **Step 1: Update the spec**

- §6.1's table: `@casl/react` is pinned at 7.0.1 (7.1.0 was under two weeks old at install).
- §6.3: add: "Two fetch funnels report 403s (`readJson` for services, `authFetch` for the hand-rolled hooks); the refetch joins one already in flight, so it never stacks. If building the payload fails in the layout, the browser fetches it on mount."
- §6.4 "Coding rules": replace "`<Can>` covers show/hide" with "`useCan(key, clientId?)` covers show/hide: `<Can>` asks about a subject type and would ignore the client". Add: "Without `canvases.edit` the canvas and editor open without the edit lock and say 'You can view this canvas. Editing is turned off for you.'"
- §6.4: add "Review counts are of the node types the person can approve."

- [ ] **Step 2: Note the same under D493**

Under D493 in the roadmap, add a "**Refined in plan 2 (2026-11-11).**" line followed by one bullet each: `@casl/react` 7.0.1; `useCan` instead of `<Can>`; the view-only canvas opens without the lock (refines D201: the mode now follows a permission the banner names, not the URL you arrived through); review counts follow review types without a migration; downloads stay UI-only.

- [ ] **Step 3: Full verification**

Run each directory separately:

```bash
npx vitest run src/lib
npx vitest run src/components
npx vitest run src/hooks
npx vitest run src/services
npx vitest run src/app
```

Expected: PASS, except the two known `refuses a deprecated model` failures in `src/app/api/nodes/[id]/composite-generate` and `src/app/api/nodes/[id]/image-generate`. A timeout in another API route test is re-run alone (`npx vitest run <file>`) and must pass.

Run: `npx tsc --noEmit`
Expected: only `src/app/api/nodes/[id]/image-generate/route.test.ts(56,12)`.

Run: `npm run lint`
Expected: clean.

Run: `npm run build`
Expected: the build completes.

- [ ] **Step 4: Count the calls on a 300-node canvas** (AGENTS.md performance rules)

Open the largest local canvas with the Network panel filtered to `/api/` and the Realtime sockets tab.
Expected: no `/api/me` request on load; the same requests and channels as on `feat/permission-access-core`; dragging a node causes no re-render of the focus-view buttons (React DevTools "Highlight updates").

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs
git commit -m "docs: record plan 2 refinements to access in the browser (D493)"
git log -1 --format=%B
```
