# Permission-based access, plan 1 of 4: access core (server) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The server knows each person's permissions and client scope, and refuses anything outside them on every API route, server action and client page.

**Architecture:**
- **Storage:** presets, per-person changes and client lists live in Postgres (migration 0062).
- **Per request:** one RPC reads a person's membership and access. A pure function computes the effective permission set, and CASL turns it into an ability.
- **Enforcement:** the existing chokepoints (`withClient`, `withCanvas`, `withNode`, `withMoodboard`), a new `withAccess`, and a guard argument on `withAction` check that ability. Coverage tests fail on any route or action that does not declare a permission.

**Tech Stack:**
- Next.js 16 route handlers and server actions
- Supabase Postgres (service-role client)
- `@casl/ability` 7.0.3
- Vitest

**Spec:** [docs/superpowers/specs/2026-11-11-permission-based-access-design.md](../specs/2026-11-11-permission-based-access-design.md) (D495–D499).

**The four plans:**
1. This one: server-side access.
2. Browser: `/api/me` on TanStack Query, `AccessProvider`, read-only rendering.
3. Team page and invites (Resend).
4. Preset editor on `/admin`.

Each one ships and is testable on its own. Plans 2–4 are written after this one is merged.

## Global Constraints

- **Branch:** `feat/permission-access-core`, cut from `docs/permission-based-access`.
- **Commits:** no Claude/AI attribution of any kind (no `Co-Authored-By`, no "Generated with"). Use grouped commits, one per task.
- **CASL install:** `@casl/ability` exactly `7.0.3` (`npm install --save-exact`). Use no caret, and nothing published less than two weeks before install. 7.0.3 is past both 2026 advisories (CVE-2026-1774, and the `rulesToFields` fix in 7.0.2).
- **CASL usage:**
  - Rules are built only on the server, from catalogue keys and database ids. Nothing from a request becomes a rule or condition.
  - Never call `rulesToFields`.
  - Route and action code never imports `@casl/ability` directly; it uses `src/lib/permissions/*`.
- **Errors:**
  - A missing permission: HTTP 403 with the message exactly `You don't have access to this. Ask your agency owner.`
  - A client outside the person's scope behaves exactly like a client in another agency: 404 from APIs, `redirect("/")` from pages.
  - A failed access read is an error. It is never treated as "no permissions" or "all permissions".
- **API helpers:** use `apiError` / `apiOk`, never `NextResponse.json` directly.
- **Performance:**
  - The access read replaces today's membership read: one database round trip per request, not two.
  - Resolve the caller once per request.
  - Permission checks are in-memory.
- **Migration:** number `0062`. `docs/auth-production-migration.md` gets its entry in the same commit as the migration.
- **Tests:**
  - Run per directory (`npx vitest run <dir>`); the full run has about 11 known timeout flakes in API route tests that pass in isolation.
  - `npx tsc --noEmit` and `npm run lint` must pass at the end of every task.
- **Copy:** plain words in anything a person sees. No vendor names, no internal ids, no em-dash phrasing.
- **Migration on a shared database:** do not apply 0062 to staging or production. The user applies it (Task 3 says when).

## Changes to the spec's area table (applied in Task 1, recorded in the spec in Task 12)

Mapping every route showed some levels no route, action or page checks. A tick that checks nothing is not shipped, so the catalogue is:

| Area | Levels | Area | Levels |
|---|---|---|---|
| `client_profile` | edit | `canvases` | view, edit, **generate**, delete |
| `brand_knowledge` | view, edit, generate, delete | `image_generation` | generate, approve |
| `brand_assets` | view, edit, generate, delete | `video_generation` | generate, approve |
| `market` | view, edit, generate, delete | `audio` | generate, approve |
| `moodboards` | view, edit, delete | `canvas_copilot` | generate |
| `scripts` | view, edit, generate, approve, delete | `video_editor` | view, edit, generate, share |
| `storyboard` | view, edit, generate | `internal_review` | view |
| `avatars` | view, edit, generate, delete | `client_review` | view, edit, share |
| `voices` | view, edit, generate, delete | `downloads` | view, share |
| `clients` (agency) | edit, delete | `team` (agency) | view, edit, delete |
| `credits` (agency) | view | | |

That is 59 keys.
- **New:** `canvases.generate` covers AI-written text nodes (prompt, script parse, file extract).
- **Not yet checked anywhere in plan 1:**
  - `team.*`: plan 3
  - `credits.view`: plan 2
  - `downloads.*`: plan 2, UI only. Files live in public storage buckets, so a person who has a file's URL can fetch it; making buckets private is its own project.

**Designer keeps `scripts.approve`.** The mark-final and reopen routes have no role check today, so designers can mark scripts final now. Designer = Senior minus `image_generation.approve`, `video_generation.approve` and `audio.approve`.

## Existing gaps this plan closes

Found while mapping:

- **Routes with no agency check at all** (any signed-in user with an id could act on another agency's data):
  - `POST /api/clients/[id]/kb/re-analyze` (reads and changes any KB version by id)
  - `POST /api/nodes/[id]/file/finalize`, `/file/from-url`, `/file/sign`
  - `POST /api/copilot`, `/copilot/actions`, `/copilot/references` (read any canvas by id)
- **Server actions with no agency check:**
  - `saveCanvasNodesAction`, `saveCanvasAction`
  - `saveScriptOutputAction`, `savePromptOutputAction`
  - `renameCanvasAction`, `deleteCanvasAction`
  - `createCanvasAction`, `createCanvasFromScriptAction`
  - `patchKBFieldAction`, `saveKBOutputAction`, `markKBReadyAction`, `markStuckJobFailed`
  - `setVersionLabelAction`

  (`deleteKBDocumentAction` and `deleteBrandImageAction` already compare the row's client with the one they were given, but never check that client's agency.)

## Known limitations, not fixed here

The 8 RLS policies stay agency-level, not client-level. Realtime is browser-side and can technically receive rows for another client in the same agency. All reads and writes through our server are client-scoped.

Google Drive is shared by every agency. All six `drive/*` routes use one platform-wide refresh token (`GDRIVE_REFRESH_TOKEN`, `src/lib/drive/client.ts`), and `drive/picker-token` gives the browser a one-hour `drive.readonly` access token for that account. Anyone with `canvases.edit` in any agency can browse, search and open every file that account can see, including folders filed for another agency's clients. The routes now need `canvases.edit` (through `withAccess`) instead of only a signed-in session, which narrows who can use them but does not separate agencies. Separating them needs a Drive connection per agency, which is not part of these plans.

## File structure

| File | Responsibility |
|---|---|
| `src/lib/permissions/catalogue.ts` | Areas, levels, groups, key types and key helpers (pure) |
| `src/lib/permissions/presets.ts` | Default keys of the seeded presets; the migration's seed is tested against it |
| `src/lib/permissions/effective.ts` | Preset + granted − revoked → effective set (pure) |
| `src/lib/permissions/ability.ts` | CASL rules and ability from a permission set + client scope |
| `src/lib/permissions/access.ts` | The `Access` type; build it from the RPC row; owner access |
| `src/lib/permissions/check.ts` | `can`, `canAnywhere`, `canSeeClient`, `denialFor`, `FORBIDDEN_MESSAGE`, `ForbiddenError` |
| `src/lib/permissions/node-area.ts` | Node type → the area whose Approve decides it |
| `src/lib/permissions/server.ts` | server-only: `accessOf`, `resolveActingCaller` |
| `src/lib/permissions/targets.ts` | server-only: resolve an action's target (canvas, node, version, …) to client + agency |
| `src/lib/permissions/action-guard.ts` | server-only: `checkActionAccess(guard)` used by `withAction` and the lock actions |
| `src/lib/permissions/page.ts` | server-only: `loadClientPage(slug, need)` for client pages |
| `src/lib/permissions/test-fixtures.ts` | `testOwnerAccess()`, `testAccess(...)`, `testMembershipRow(...)` |
| `src/lib/permissions/route-coverage.test.ts` | Every API handler declares a permission or is allowlisted; every key is checked somewhere |
| `src/lib/permissions/seed-matches-catalogue.test.ts` | Migration seed == `presets.ts` |
| `vitest.setup.ts` | Tests default `accessOf` to owner access when a mocked caller has none |
| `supabase/migrations/0062_permission_based_access.sql` | Tables, backfill, triggers, RPC, `auth_org_ids`, RLS rewrite |
| Modified: `src/lib/dal.ts`, `src/lib/dal-logic.ts` | Caller context carries `access` (from the RPC) |
| Modified: `src/lib/api/route-helpers.ts` | Chokepoints take a guard; new `withAccess` |
| Modified: `src/lib/actions/with-action.ts` + every action file | Guard argument |
| Modified: 150 route files, 10 client pages, `src/app/(home)/page.tsx` | Declare permissions; scope filters |
| Modified: `src/lib/actions/approval.ts`, `src/lib/review/queue.ts`, `src/lib/db/review.ts`, `src/lib/db/clients.ts`, `src/lib/db/moodboards.ts` | Area approve; scope filters |

---

### Task 1: Permission catalogue and preset defaults

**Files:**
- Create: `src/lib/permissions/catalogue.ts`
- Create: `src/lib/permissions/presets.ts`
- Test: `src/lib/permissions/catalogue.test.ts`

**Interfaces:**
- Produces:
  - from `catalogue.ts`:
    - `LEVELS`, type `Level`, `GROUPS`, type `GroupKey`, `AREAS`
    - types `Area`, `PermissionKey`, `ClientScopedKey`, `AgencyKey`
    - `ALL_PERMISSION_KEYS: readonly PermissionKey[]`
    - `isPermissionKey(s: string): s is PermissionKey`
    - `splitKey(k: PermissionKey): { area: Area; level: Level }`
    - `isClientScopedKey(k: PermissionKey): k is ClientScopedKey`
    - `areaHasLevel(area: Area, level: Level): boolean`
  - from `presets.ts`: `SENIOR_DEFAULT_KEYS`, `DESIGNER_DEFAULT_KEYS`, `MEDIA_APPROVE_KEYS` (all `readonly PermissionKey[]`)

- [ ] **Step 1: Create the branch**

```bash
git checkout docs/permission-based-access
git checkout -b feat/permission-access-core
```

- [ ] **Step 2: Write the failing test** `src/lib/permissions/catalogue.test.ts`

```ts
import { describe, it, expect } from "vitest";
import {
  AREAS,
  GROUPS,
  ALL_PERMISSION_KEYS,
  isPermissionKey,
  splitKey,
  isClientScopedKey,
  areaHasLevel,
} from "./catalogue";
import { SENIOR_DEFAULT_KEYS, DESIGNER_DEFAULT_KEYS, MEDIA_APPROVE_KEYS } from "./presets";

describe("permission catalogue", () => {
  it("has 59 unique keys of the form area.level", () => {
    expect(ALL_PERMISSION_KEYS).toHaveLength(59);
    expect(new Set(ALL_PERMISSION_KEYS).size).toBe(59);
    for (const k of ALL_PERMISSION_KEYS) expect(k).toMatch(/^[a-z_]+\.(view|edit|generate|approve|share|delete)$/);
  });

  it("puts every area in a known group, with unique area keys", () => {
    const groups = new Set(GROUPS.map((g) => g.key));
    for (const a of AREAS) expect(groups.has(a.group)).toBe(true);
    expect(new Set(AREAS.map((a) => a.key)).size).toBe(AREAS.length);
  });

  it("marks only clients, team and credits as agency-wide", () => {
    const agency = AREAS.filter((a) => !a.clientScoped).map((a) => a.key).sort();
    expect(agency).toEqual(["clients", "credits", "team"]);
    expect(isClientScopedKey("scripts.edit")).toBe(true);
    expect(isClientScopedKey("team.edit")).toBe(false);
  });

  it("recognises real keys only", () => {
    expect(isPermissionKey("scripts.approve")).toBe(true);
    expect(isPermissionKey("scripts.share")).toBe(false);
    expect(isPermissionKey("nonsense")).toBe(false);
  });

  it("splits a key into area and level", () => {
    expect(splitKey("video_generation.generate")).toEqual({ area: "video_generation", level: "generate" });
  });

  it("knows which levels an area offers", () => {
    expect(areaHasLevel("canvases", "generate")).toBe(true);
    expect(areaHasLevel("image_generation", "view")).toBe(false);
  });
});

describe("preset defaults", () => {
  it("senior has every key except team", () => {
    expect(SENIOR_DEFAULT_KEYS).toHaveLength(56);
    expect(SENIOR_DEFAULT_KEYS.some((k) => k.startsWith("team."))).toBe(false);
  });

  it("designer is senior minus image, video and audio approve, and keeps scripts.approve", () => {
    expect(MEDIA_APPROVE_KEYS).toEqual(["image_generation.approve", "video_generation.approve", "audio.approve"]);
    expect(DESIGNER_DEFAULT_KEYS).toHaveLength(53);
    for (const k of MEDIA_APPROVE_KEYS) expect(DESIGNER_DEFAULT_KEYS).not.toContain(k);
    expect(DESIGNER_DEFAULT_KEYS).toContain("scripts.approve");
  });
});
```

- [ ] **Step 3: Run it, expect failure**

Run: `npx vitest run src/lib/permissions/catalogue.test.ts`
Expected: FAIL, `Failed to resolve import "./catalogue"`.

- [ ] **Step 4: Write `src/lib/permissions/catalogue.ts`**

```ts
// D495: the areas and levels a permission can name. A tick only means something where the
// server checks it, so this list lives in code; presets, per-person ticks and client lists
// live in the database. Adding an area here ships with a migration that adds its keys to the
// presets that should get them.

export const LEVELS = ["view", "edit", "generate", "approve", "share", "delete"] as const;
export type Level = (typeof LEVELS)[number];

export const GROUPS = [
  { key: "brand", label: "Brand setup" },
  { key: "story", label: "Story" },
  { key: "production", label: "Production" },
  { key: "review", label: "Review and delivery" },
  { key: "agency", label: "Running the agency" },
] as const;
export type GroupKey = (typeof GROUPS)[number]["key"];

type AreaDef = {
  readonly key: string;
  readonly group: GroupKey;
  readonly label: string;
  readonly covers: string;
  readonly levels: readonly Level[];
  /** false = agency-wide (not tied to one client). */
  readonly clientScoped: boolean;
  /** Overrides the plain level name in screens, where the level means something narrower. */
  readonly levelLabels?: Partial<Record<Level, string>>;
};

export const AREAS = [
  { key: "client_profile", group: "brand", label: "Client profile", covers: "Name, logo, website, linked Drive folder", levels: ["edit"], clientScoped: true },
  { key: "brand_knowledge", group: "brand", label: "Brand knowledge", covers: "Uploaded documents and images, extracted brand facts, ready-check", levels: ["view", "edit", "generate", "delete"], clientScoped: true },
  { key: "brand_assets", group: "brand", label: "Brand assets", covers: "Brand kit files, images imported from social accounts", levels: ["view", "edit", "generate", "delete"], clientScoped: true },
  { key: "market", group: "brand", label: "Market and performance", covers: "Signals, references, tracked social handles and their numbers", levels: ["view", "edit", "generate", "delete"], clientScoped: true },
  { key: "moodboards", group: "brand", label: "Moodboards", covers: "Boards and their items", levels: ["view", "edit", "delete"], clientScoped: true },
  { key: "scripts", group: "story", label: "Scripts", covers: "Script library, writing, script copilot, mark final, reopen", levels: ["view", "edit", "generate", "approve", "delete"], clientScoped: true, levelLabels: { approve: "Mark final" } },
  { key: "storyboard", group: "story", label: "Storyboard", covers: "Visualise panels, location plates, picking the panel per shot", levels: ["view", "edit", "generate"], clientScoped: true },
  { key: "avatars", group: "story", label: "Avatars", covers: "Cast library, avatar images and turnaround sheet, assigned voice", levels: ["view", "edit", "generate", "delete"], clientScoped: true },
  { key: "voices", group: "story", label: "Voices", covers: "Voice library, saved voices, cloning", levels: ["view", "edit", "generate", "delete"], clientScoped: true },
  { key: "canvases", group: "production", label: "Canvases", covers: "Create, rename, nodes, prompts, uploads, Drive import, restore versions, AI-written text nodes", levels: ["view", "edit", "generate", "delete"], clientScoped: true },
  { key: "image_generation", group: "production", label: "Image generation", covers: "Images, composites, compose", levels: ["generate", "approve"], clientScoped: true },
  { key: "video_generation", group: "production", label: "Video generation", covers: "Video, multishot, scene split, video prompts, video edit", levels: ["generate", "approve"], clientScoped: true },
  { key: "audio", group: "production", label: "Audio and lip-sync", covers: "Dubbing, voice change, lip-sync", levels: ["generate", "approve"], clientScoped: true },
  { key: "canvas_copilot", group: "production", label: "Canvas copilot", covers: "The AI chat that can add and change nodes", levels: ["generate"], clientScoped: true },
  { key: "video_editor", group: "production", label: "Video editor", covers: "Timeline, transcripts, renders, exports", levels: ["view", "edit", "generate", "share"], clientScoped: true },
  { key: "internal_review", group: "review", label: "Internal review", covers: "Review inbox and review mode", levels: ["view"], clientScoped: true },
  { key: "client_review", group: "review", label: "Client review", covers: "Cut upload, review links, client comments, team replies", levels: ["view", "edit", "share"], clientScoped: true },
  { key: "downloads", group: "review", label: "Downloads", covers: "Downloading files", levels: ["view", "share"], clientScoped: true, levelLabels: { view: "Approved finals", share: "Anything, drafts included" } },
  { key: "clients", group: "agency", label: "Clients", covers: "Create and archive clients", levels: ["edit", "delete"], clientScoped: false },
  { key: "team", group: "agency", label: "Team", covers: "Invite and remove people, change their ticks and clients", levels: ["view", "edit", "delete"], clientScoped: false },
  { key: "credits", group: "agency", label: "Credits and billing", covers: "Credit usage and costs", levels: ["view"], clientScoped: false },
] as const satisfies readonly AreaDef[];

type AreaUnion = (typeof AREAS)[number];
export type Area = AreaUnion["key"];

type KeyOf<A> = A extends { key: infer K extends string; levels: readonly (infer L extends string)[] }
  ? `${K}.${L}`
  : never;
export type PermissionKey = KeyOf<AreaUnion>;
export type ClientScopedKey = KeyOf<Extract<AreaUnion, { clientScoped: true }>>;
export type AgencyKey = Exclude<PermissionKey, ClientScopedKey>;

export const ALL_PERMISSION_KEYS: readonly PermissionKey[] = AREAS.flatMap((a) =>
  (a.levels as readonly Level[]).map((l) => `${a.key}.${l}` as PermissionKey),
);

const KEY_SET: ReadonlySet<string> = new Set(ALL_PERMISSION_KEYS);
const AREA_BY_KEY: ReadonlyMap<string, AreaDef> = new Map(AREAS.map((a) => [a.key, a as AreaDef]));

export function isPermissionKey(value: string): value is PermissionKey {
  return KEY_SET.has(value);
}

export function splitKey(key: PermissionKey): { area: Area; level: Level } {
  const dot = key.lastIndexOf(".");
  return { area: key.slice(0, dot) as Area, level: key.slice(dot + 1) as Level };
}

export function isClientScopedKey(key: PermissionKey): key is ClientScopedKey {
  return AREA_BY_KEY.get(splitKey(key).area)?.clientScoped === true;
}

export function areaHasLevel(area: Area, level: Level): boolean {
  return AREA_BY_KEY.get(area)?.levels.includes(level) ?? false;
}
```

- [ ] **Step 5: Write `src/lib/permissions/presets.ts`**

```ts
import { ALL_PERMISSION_KEYS, type PermissionKey } from "./catalogue";

// D495 §2.2: the presets migration 0062 seeds. Owner is fixed (everything) and has no key
// list. seed-matches-catalogue.test.ts fails if the migration's lists drift from these.

export const MEDIA_APPROVE_KEYS: readonly PermissionKey[] = [
  "image_generation.approve",
  "video_generation.approve",
  "audio.approve",
];

/** Every key except the Team area. */
export const SENIOR_DEFAULT_KEYS: readonly PermissionKey[] = ALL_PERMISSION_KEYS.filter(
  (k) => !k.startsWith("team."),
);

/** Senior minus approving images, video and audio. Keeps scripts.approve: designers mark scripts final today. */
export const DESIGNER_DEFAULT_KEYS: readonly PermissionKey[] = SENIOR_DEFAULT_KEYS.filter(
  (k) => !MEDIA_APPROVE_KEYS.includes(k),
);
```

- [ ] **Step 6: Run the test, expect pass**

Run: `npx vitest run src/lib/permissions/catalogue.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If `as const satisfies` is rejected, check `typescript` in package.json is ≥ 5.0 (`npm ls typescript`).

- [ ] **Step 8: Commit**

```bash
git add src/lib/permissions/catalogue.ts src/lib/permissions/presets.ts src/lib/permissions/catalogue.test.ts
git commit -m "feat(permissions): area and level catalogue with preset defaults (D495)"
```

---

### Task 2: Effective access, CASL ability and checks

**Files:**
- Modify: `package.json`, `package-lock.json` (install `@casl/ability@7.0.3`)
- Create: `src/lib/permissions/effective.ts`, `ability.ts`, `access.ts`, `check.ts`, `node-area.ts`, `test-fixtures.ts`
- Test: `src/lib/permissions/effective.test.ts`, `src/lib/permissions/check.test.ts`, `src/lib/permissions/node-area.test.ts`

**Interfaces:**
- Consumes: Task 1's catalogue.
- Produces:
  - `computeEffective(input: { isOwner: boolean; presetKeys: readonly string[]; granted: readonly string[]; revoked: readonly string[] }): Set<PermissionKey>`
  - `type ClientScope = "all" | ReadonlySet<string>`
  - `type AppAbility`, `buildRules(perms, scope): AppRule[]`, `buildAbility(rules): AppAbility`
  - `type Access = { presetKey: string; isOwner: boolean; permissions: ReadonlySet<PermissionKey>; clientScope: ClientScope; ability: AppAbility }`
  - `type MembershipAccessRow` (the RPC row, Task 3)
  - `accessFromRow(row: MembershipAccessRow): Access`
  - `ownerAccess(): Access`
  - `FORBIDDEN_MESSAGE`, `class ForbiddenError`
  - `canSeeClient(access, clientId): boolean`
  - `can(access, key: ClientScopedKey, clientId: string): boolean`
  - `can(access, key: AgencyKey): boolean`
  - `canAnywhere(access, key: PermissionKey): boolean`
  - `type Denial = "not_found" | "forbidden"`, `denialFor(access, key, clientId: string | null): Denial | null`
  - `approveKeyForNodeType(nodeType: string): PermissionKey | null`
  - `REVIEWABLE_NODE_TYPES`, `reviewableNodeTypes(access): string[]`
  - `testOwnerAccess(): Access`
  - `testAccess(opts: { keys: readonly PermissionKey[]; clientIds?: readonly string[]; presetKey?: string }): Access`
  - `testMembershipRow(overrides?: Partial<MembershipAccessRow>): MembershipAccessRow`

- [ ] **Step 1: Install CASL, exact version**

```bash
npm install --save-exact @casl/ability@7.0.3
node -e "const c=require('@casl/ability'); console.log(typeof c.createMongoAbility, typeof c.subject)"
```

Expected output: `function function`

- [ ] **Step 2: Write the failing tests**

`src/lib/permissions/effective.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeEffective } from "./effective";
import { ALL_PERMISSION_KEYS } from "./catalogue";

describe("computeEffective (D495 §2.3)", () => {
  it("gives an owner every key, whatever the rows say", () => {
    const set = computeEffective({ isOwner: true, presetKeys: [], granted: [], revoked: ["scripts.view"] });
    expect(set.size).toBe(ALL_PERMISSION_KEYS.length);
  });

  it("adds granted ticks and removes revoked ones", () => {
    const set = computeEffective({
      isOwner: false,
      presetKeys: ["scripts.view", "scripts.edit", "image_generation.approve"],
      granted: ["team.view"],
      revoked: ["image_generation.approve"],
    });
    expect(set.has("team.view")).toBe(true);
    expect(set.has("image_generation.approve")).toBe(false);
    expect(set.has("scripts.edit")).toBe(true);
  });

  it("turns on an area's view when any tick in it is on", () => {
    const set = computeEffective({ isOwner: false, presetKeys: ["avatars.generate"], granted: [], revoked: ["avatars.view"] });
    expect(set.has("avatars.view")).toBe(true);
  });

  it("does not invent a view the area does not offer", () => {
    const set = computeEffective({ isOwner: false, presetKeys: ["image_generation.generate"], granted: [], revoked: [] });
    expect([...set]).toEqual(["image_generation.generate"]);
  });

  it("ignores keys the catalogue no longer knows", () => {
    const set = computeEffective({ isOwner: false, presetKeys: ["old_area.view"], granted: ["scripts.share"], revoked: [] });
    expect(set.size).toBe(0);
  });
});
```

`src/lib/permissions/check.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { can, canAnywhere, canSeeClient, denialFor, FORBIDDEN_MESSAGE } from "./check";
import { accessFromRow, ownerAccess } from "./access";
import { testAccess, testMembershipRow } from "./test-fixtures";

describe("permission checks", () => {
  const picked = testAccess({ keys: ["scripts.view", "scripts.edit", "clients.edit"], clientIds: ["c-1"] });
  const all = testAccess({ keys: ["scripts.view"] });

  it("allows a client-scoped key only for a client in the list", () => {
    expect(can(picked, "scripts.edit", "c-1")).toBe(true);
    expect(can(picked, "scripts.edit", "c-2")).toBe(false);
  });

  it("allows every client when the scope is all", () => {
    expect(can(all, "scripts.view", "any-client")).toBe(true);
  });

  it("refuses a key the person does not hold", () => {
    expect(can(all, "scripts.delete", "c-1")).toBe(false);
  });

  it("checks agency keys without a client", () => {
    expect(can(picked, "clients.edit")).toBe(true);
    expect(can(picked, "clients.delete")).toBe(false);
  });

  it("refuses a client-scoped key checked without a client (CASL would ignore conditions)", () => {
    // @ts-expect-error -- the type requires clientId for client-scoped keys
    expect(can(picked, "scripts.edit")).toBe(false);
  });

  it("canAnywhere: key held and at least one client", () => {
    expect(canAnywhere(picked, "scripts.edit")).toBe(true);
    expect(canAnywhere(testAccess({ keys: ["scripts.edit"], clientIds: [] }), "scripts.edit")).toBe(false);
    expect(canAnywhere(picked, "scripts.delete")).toBe(false);
  });

  it("canSeeClient follows the scope", () => {
    expect(canSeeClient(picked, "c-1")).toBe(true);
    expect(canSeeClient(picked, "c-2")).toBe(false);
    expect(canSeeClient(all, "c-2")).toBe(true);
  });

  it("denialFor: out of scope is not_found before forbidden", () => {
    expect(denialFor(picked, "scripts.delete", "c-2")).toBe("not_found");
    expect(denialFor(picked, "scripts.delete", "c-1")).toBe("forbidden");
    expect(denialFor(picked, "scripts.edit", "c-1")).toBeNull();
    expect(denialFor(picked, "clients.edit", null)).toBeNull();
    expect(denialFor(picked, "scripts.edit", null)).toBeNull();
    expect(denialFor(picked, "team.view", null)).toBe("forbidden");
  });

  it("owner access allows everything everywhere", () => {
    const owner = ownerAccess();
    expect(can(owner, "team.delete")).toBe(true);
    expect(can(owner, "video_generation.approve", "whatever")).toBe(true);
  });

  it("builds access from the RPC row", () => {
    const a = accessFromRow(
      testMembershipRow({ preset_key: "designer", is_owner: false, preset_keys: ["scripts.view"], granted: ["scripts.edit"], all_clients: false, client_ids: ["c-9"] }),
    );
    expect(a.presetKey).toBe("designer");
    expect(can(a, "scripts.edit", "c-9")).toBe(true);
    expect(can(a, "scripts.edit", "c-1")).toBe(false);
  });

  it("uses the agreed refusal copy", () => {
    expect(FORBIDDEN_MESSAGE).toBe("You don't have access to this. Ask your agency owner.");
  });
});
```

`src/lib/permissions/node-area.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { approveKeyForNodeType, reviewableNodeTypes } from "./node-area";
import { testAccess } from "./test-fixtures";

describe("approval area per node type", () => {
  it("maps media nodes to their area's approve", () => {
    expect(approveKeyForNodeType("image-gen")).toBe("image_generation.approve");
    expect(approveKeyForNodeType("composite")).toBe("image_generation.approve");
    expect(approveKeyForNodeType("video-gen")).toBe("video_generation.approve");
    expect(approveKeyForNodeType("dubbing")).toBe("audio.approve");
  });

  it("returns null for nodes that are not approved", () => {
    expect(approveKeyForNodeType("prompt")).toBeNull();
    expect(approveKeyForNodeType("unknown")).toBeNull();
  });

  it("lists the review-queue node types a person can approve somewhere", () => {
    expect(reviewableNodeTypes(testAccess({ keys: ["image_generation.approve"] }))).toEqual(["image-gen"]);
    expect(reviewableNodeTypes(testAccess({ keys: [] }))).toEqual([]);
  });
});
```

- [ ] **Step 3: Run, expect failure**

Run: `npx vitest run src/lib/permissions`
Expected: FAIL. Imports `./effective`, `./check`, `./access`, `./test-fixtures`, `./node-area` do not resolve.

- [ ] **Step 4: Write `src/lib/permissions/effective.ts`**

```ts
import { ALL_PERMISSION_KEYS, areaHasLevel, isPermissionKey, splitKey, type PermissionKey } from "./catalogue";

export type EffectiveInput = {
  isOwner: boolean;
  presetKeys: readonly string[];
  granted: readonly string[];
  revoked: readonly string[];
};

// D495 §2.3. Owner → every key. Otherwise the preset's keys, plus the ticks the owner added,
// minus the ones they removed; then any tick in an area turns on that area's view (when the
// area has one). Keys the catalogue no longer knows are dropped, never trusted.
export function computeEffective(input: EffectiveInput): Set<PermissionKey> {
  if (input.isOwner) return new Set(ALL_PERMISSION_KEYS);
  const out = new Set<PermissionKey>();
  for (const k of input.presetKeys) if (isPermissionKey(k)) out.add(k);
  for (const k of input.granted) if (isPermissionKey(k)) out.add(k);
  for (const k of input.revoked) if (isPermissionKey(k)) out.delete(k);
  for (const k of [...out]) {
    const { area } = splitKey(k);
    if (areaHasLevel(area, "view")) out.add(`${area}.view` as PermissionKey);
  }
  return out;
}
```

- [ ] **Step 5: Write `src/lib/permissions/ability.ts`**

```ts
import { createMongoAbility, type ForcedSubject, type MongoAbility } from "@casl/ability";
import { isClientScopedKey, splitKey, type Area, type Level, type PermissionKey } from "./catalogue";

// D499. Level = action, area = subject, a picked client list = a clientId condition. Rules are
// built ONLY from catalogue keys and database ids (never from a request), which is what keeps
// CASL's 2026 prototype-pollution advisories out of reach.

export type ClientScope = "all" | ReadonlySet<string>;
type Abilities = [Level, Area | ForcedSubject<Area>];
export type AppAbility = MongoAbility<Abilities>;
export type AppRule = { action: Level; subject: Area; conditions?: { clientId: { $in: string[] } } };

export function buildRules(permissions: ReadonlySet<PermissionKey>, scope: ClientScope): AppRule[] {
  const ids = scope === "all" ? null : [...scope].sort();
  return [...permissions].sort().map((key) => {
    const { area, level } = splitKey(key);
    return ids && isClientScopedKey(key)
      ? { action: level, subject: area, conditions: { clientId: { $in: ids } } }
      : { action: level, subject: area };
  });
}

export function buildAbility(rules: AppRule[]): AppAbility {
  return createMongoAbility<Abilities>(rules);
}
```

- [ ] **Step 6: Write `src/lib/permissions/access.ts`**

```ts
import { ALL_PERMISSION_KEYS, type PermissionKey } from "./catalogue";
import { computeEffective } from "./effective";
import { buildAbility, buildRules, type AppAbility, type ClientScope } from "./ability";

/** What one person may do in the agency they are acting in. Built once per request. */
export type Access = {
  presetKey: string;
  isOwner: boolean;
  permissions: ReadonlySet<PermissionKey>;
  clientScope: ClientScope;
  ability: AppAbility;
};

/** One row of get_membership_access() (migration 0062). Arrays come back null when empty in some drivers. */
export type MembershipAccessRow = {
  org_id: string;
  preset_key: string;
  is_owner: boolean;
  all_clients: boolean;
  preset_keys: string[] | null;
  granted: string[] | null;
  revoked: string[] | null;
  client_ids: string[] | null;
};

function makeAccess(presetKey: string, isOwner: boolean, permissions: ReadonlySet<PermissionKey>, clientScope: ClientScope): Access {
  return { presetKey, isOwner, permissions, clientScope, ability: buildAbility(buildRules(permissions, clientScope)) };
}

export function accessFromRow(row: MembershipAccessRow): Access {
  const permissions = computeEffective({
    isOwner: row.is_owner,
    presetKeys: row.preset_keys ?? [],
    granted: row.granted ?? [],
    revoked: row.revoked ?? [],
  });
  // An owner always sees every client, whatever all_clients says.
  const scope: ClientScope = row.is_owner || row.all_clients ? "all" : new Set(row.client_ids ?? []);
  return makeAccess(row.preset_key, row.is_owner, permissions, scope);
}

/** Everything, every client. Used for a super admin impersonating an agency (D81). */
export function ownerAccess(): Access {
  return makeAccess("owner", true, new Set(ALL_PERMISSION_KEYS), "all");
}

export { makeAccess as _makeAccessForTests };
```

- [ ] **Step 7: Write `src/lib/permissions/check.ts`**

```ts
import { subject } from "@casl/ability";
import { isClientScopedKey, splitKey, type AgencyKey, type ClientScopedKey, type PermissionKey } from "./catalogue";
import type { Access } from "./access";

export const FORBIDDEN_MESSAGE = "You don't have access to this. Ask your agency owner.";

export class ForbiddenError extends Error {
  constructor() {
    super(FORBIDDEN_MESSAGE);
    this.name = "ForbiddenError";
  }
}

export function canSeeClient(access: Access, clientId: string): boolean {
  return access.clientScope === "all" || access.clientScope.has(clientId);
}

// Server checks. A client-scoped key must name the client: asking CASL about a subject TYPE
// ignores conditions and answers "yes if any rule exists" (D499's sharp edge).
export function can(access: Access, key: ClientScopedKey, clientId: string): boolean;
export function can(access: Access, key: AgencyKey): boolean;
export function can(access: Access, key: PermissionKey, clientId?: string): boolean {
  const { area, level } = splitKey(key);
  if (isClientScopedKey(key)) {
    if (!clientId) return false;
    return access.ability.can(level, subject(area, { clientId }));
  }
  return access.ability.can(level, area);
}

// For routes not rooted at one client (the voice library, the moodboard index, the review
// inbox): the key is held and the person can see at least one client. Such routes then filter
// what they return with canSeeClient.
export function canAnywhere(access: Access, key: PermissionKey): boolean {
  if (!access.permissions.has(key)) return false;
  if (!isClientScopedKey(key)) return true;
  return access.clientScope === "all" || access.clientScope.size > 0;
}

export type Denial = "not_found" | "forbidden";

// Out of scope is checked first and answers not_found, so a refusal never confirms that a
// client the person can't see exists (D496).
export function denialFor(access: Access, key: PermissionKey, clientId: string | null): Denial | null {
  if (clientId !== null && !canSeeClient(access, clientId)) return "not_found";
  if (!isClientScopedKey(key)) return can(access, key as AgencyKey) ? null : "forbidden";
  if (clientId === null) return canAnywhere(access, key) ? null : "forbidden";
  return can(access, key, clientId) ? null : "forbidden";
}
```

- [ ] **Step 8: Write `src/lib/permissions/node-area.ts`**

```ts
import type { PermissionKey } from "./catalogue";
import { canAnywhere } from "./check";
import type { Access } from "./access";

// D495: approving a version needs Approve on that node's area.
const APPROVE_KEY_BY_NODE_TYPE: Readonly<Record<string, PermissionKey>> = {
  "image-gen": "image_generation.approve",
  composite: "image_generation.approve",
  "video-gen": "video_generation.approve",
  dubbing: "audio.approve",
};

export function approveKeyForNodeType(nodeType: string): PermissionKey | null {
  return APPROVE_KEY_BY_NODE_TYPE[nodeType] ?? null;
}

/** The node types review_queue_items carries (migration 0031). */
export const REVIEWABLE_NODE_TYPES = ["image-gen", "video-gen"] as const;

export function reviewableNodeTypes(access: Access): string[] {
  return REVIEWABLE_NODE_TYPES.filter((t) => {
    const key = approveKeyForNodeType(t);
    return key !== null && canAnywhere(access, key);
  });
}
```

- [ ] **Step 9: Write `src/lib/permissions/test-fixtures.ts`**

```ts
import { ALL_PERMISSION_KEYS, type PermissionKey } from "./catalogue";
import { _makeAccessForTests, type Access, type MembershipAccessRow } from "./access";

export function testOwnerAccess(): Access {
  return _makeAccessForTests("owner", true, new Set(ALL_PERMISSION_KEYS), "all");
}

/** Exactly these keys (no view-implication), all clients unless clientIds is given. */
export function testAccess(opts: { keys: readonly PermissionKey[]; clientIds?: readonly string[]; presetKey?: string }): Access {
  return _makeAccessForTests(
    opts.presetKey ?? "designer",
    false,
    new Set(opts.keys),
    opts.clientIds ? new Set(opts.clientIds) : "all",
  );
}

export function testMembershipRow(overrides: Partial<MembershipAccessRow> = {}): MembershipAccessRow {
  return {
    org_id: "org-1",
    preset_key: "owner",
    is_owner: true,
    all_clients: true,
    preset_keys: [],
    granted: [],
    revoked: [],
    client_ids: [],
    ...overrides,
  };
}
```

- [ ] **Step 10: Run, expect pass**

Run: `npx vitest run src/lib/permissions`
Expected: PASS (catalogue 8, effective 5, check 11, node-area 3).

- [ ] **Step 11: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. The `@ts-expect-error` in check.test.ts must be consumed. If tsc reports "Unused '@ts-expect-error' directive", the `can` overloads are wrong: the `ClientScopedKey` overload must require `clientId`.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json src/lib/permissions
git commit -m "feat(permissions): effective access, CASL ability and server checks (D495, D499)"
```

---

### Task 3: Migration 0062

**Files:**
- Create: `supabase/migrations/0062_permission_based_access.sql`
- Create: `src/lib/permissions/seed-matches-catalogue.test.ts`
- Modify: `docs/auth-production-migration.md` (append an entry)

**Interfaces:**
- Produces, in the database:
  - tables `role_presets`, `role_preset_permissions`, `membership_permission_changes`, `membership_clients`, `org_invitations`
  - columns `org_memberships.preset_id` / `all_clients` / `invited_by`
  - functions `get_membership_access(p_user_id uuid)` (returns `MembershipAccessRow` columns) and `auth_org_ids()`
  - trigger `org_memberships_0_sync_preset`

- [ ] **Step 1: Write the failing seed test** `src/lib/permissions/seed-matches-catalogue.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SENIOR_DEFAULT_KEYS, MEDIA_APPROVE_KEYS } from "./presets";

const SQL = readFileSync(join(process.cwd(), "supabase/migrations/0062_permission_based_access.sql"), "utf8");

function between(start: string, end: string): string[] {
  const s = SQL.indexOf(start);
  const e = SQL.indexOf(end);
  if (s < 0 || e < 0) throw new Error(`markers ${start} / ${end} not found`);
  return [...SQL.slice(s, e).matchAll(/'([a-z_]+\.[a-z]+)'/g)].map((m) => m[1]);
}

describe("migration 0062 seeds the presets in presets.ts", () => {
  it("senior keys match", () => {
    expect(between("-- seed:senior-keys:start", "-- seed:senior-keys:end").sort()).toEqual([...SENIOR_DEFAULT_KEYS].sort());
  });

  it("designer drops exactly the media approve keys", () => {
    expect(between("-- seed:designer-drops:start", "-- seed:designer-drops:end").sort()).toEqual([...MEDIA_APPROVE_KEYS].sort());
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/lib/permissions/seed-matches-catalogue.test.ts`
Expected: FAIL, `ENOENT ... 0062_permission_based_access.sql`.

- [ ] **Step 3: Write `supabase/migrations/0062_permission_based_access.sql`**

```sql
-- D495–D498: presets + per-person ticks + picked clients, invites, and agency-ready keys.
-- Apply after the app code that reads it is merged but BEFORE that code is deployed: the new
-- code reads get_membership_access(); the old code keeps reading org_role, which stays (and is
-- kept in sync) until a later migration drops it.

-- ── 1. Presets ───────────────────────────────────────────────────────────────
create table if not exists role_presets (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  description text not null default '',
  is_owner    boolean not null default false,
  sort        int not null default 0,
  archived_at timestamptz,
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);
create unique index if not exists role_presets_one_owner on role_presets (is_owner) where is_owner;

create table if not exists role_preset_permissions (
  preset_id      uuid not null references role_presets(id) on delete cascade,
  permission_key text not null,
  primary key (preset_id, permission_key)
);

insert into role_presets (key, name, description, is_owner, sort) values
  ('owner',    'Owner',    'Everything, including the team.',                 true,  0),
  ('senior',   'Senior',   'Everything except the team.',                     false, 1),
  ('designer', 'Designer', 'Like Senior, without approving images, video or audio.', false, 2)
on conflict (key) do nothing;

with senior_keys(k) as (values
  -- seed:senior-keys:start
  ('client_profile.edit'),
  ('brand_knowledge.view'), ('brand_knowledge.edit'), ('brand_knowledge.generate'), ('brand_knowledge.delete'),
  ('brand_assets.view'), ('brand_assets.edit'), ('brand_assets.generate'), ('brand_assets.delete'),
  ('market.view'), ('market.edit'), ('market.generate'), ('market.delete'),
  ('moodboards.view'), ('moodboards.edit'), ('moodboards.delete'),
  ('scripts.view'), ('scripts.edit'), ('scripts.generate'), ('scripts.approve'), ('scripts.delete'),
  ('storyboard.view'), ('storyboard.edit'), ('storyboard.generate'),
  ('avatars.view'), ('avatars.edit'), ('avatars.generate'), ('avatars.delete'),
  ('voices.view'), ('voices.edit'), ('voices.generate'), ('voices.delete'),
  ('canvases.view'), ('canvases.edit'), ('canvases.generate'), ('canvases.delete'),
  ('image_generation.generate'), ('image_generation.approve'),
  ('video_generation.generate'), ('video_generation.approve'),
  ('audio.generate'), ('audio.approve'),
  ('canvas_copilot.generate'),
  ('video_editor.view'), ('video_editor.edit'), ('video_editor.generate'), ('video_editor.share'),
  ('internal_review.view'),
  ('client_review.view'), ('client_review.edit'), ('client_review.share'),
  ('downloads.view'), ('downloads.share'),
  ('clients.edit'), ('clients.delete'),
  ('credits.view')
  -- seed:senior-keys:end
),
presets as (select id, key from role_presets where key in ('senior', 'designer'))
insert into role_preset_permissions (preset_id, permission_key)
select p.id, s.k
  from presets p cross join senior_keys s
 where p.key = 'senior'
    or (p.key = 'designer' and s.k not in (
      -- seed:designer-drops:start
      'image_generation.approve', 'video_generation.approve', 'audio.approve'
      -- seed:designer-drops:end
    ))
on conflict do nothing;

-- ── 2. Memberships carry a preset and a client scope ─────────────────────────
alter table org_memberships
  add column if not exists preset_id   uuid references role_presets(id),
  add column if not exists all_clients boolean not null default true,
  add column if not exists invited_by  uuid references auth.users(id) on delete set null;

update org_memberships m set preset_id = p.id
  from role_presets p
 where p.key = m.org_role and m.preset_id is null;

alter table org_memberships alter column preset_id set not null;
create index if not exists org_memberships_preset_id_idx on org_memberships (preset_id);

-- Until plan 3 retires the org_role writers (addOrgMember / updateMemberRole), keep preset_id
-- following org_role. Named with "0_" so it fires BEFORE org_memberships_last_owner (Postgres
-- fires same-event triggers in name order) and the last-owner check sees the new preset.
create or replace function sync_preset_from_org_role()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.org_role is distinct from old.org_role then
    select id into new.preset_id from role_presets where key = new.org_role;
  end if;
  return new;
end;
$$;

drop trigger if exists org_memberships_0_sync_preset on org_memberships;
create trigger org_memberships_0_sync_preset
  before insert or update of org_role on org_memberships
  for each row execute function sync_preset_from_org_role();

-- Last owner (D80/D181), now on presets. Same messages as 0012: removeOrgMemberAction shows them.
create or replace function enforce_last_owner()
returns trigger language plpgsql as $$
declare
  was_owner   boolean;
  still_owner boolean;
  remaining   int;
begin
  select is_owner into was_owner from role_presets where id = old.preset_id;
  if not coalesce(was_owner, false) then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' then
    select is_owner into still_owner from role_presets where id = new.preset_id;
    if coalesce(still_owner, false) then return new; end if;
  end if;
  select count(*) into remaining
    from org_memberships m join role_presets p on p.id = m.preset_id
   where m.org_id = old.org_id and p.is_owner and m.user_id <> old.user_id;
  if remaining = 0 then
    if tg_op = 'DELETE' then
      raise exception 'Cannot remove the last owner of an organization';
    end if;
    raise exception 'Cannot demote the last owner of an organization';
  end if;
  return coalesce(new, old);
end;
$$;
-- org_memberships_last_owner (0012) keeps calling enforce_last_owner(); no trigger change needed.

-- ── 3. Per-person ticks and picked clients ───────────────────────────────────
create table if not exists membership_permission_changes (
  user_id        uuid not null,
  org_id         uuid not null,
  permission_key text not null,
  granted        boolean not null,
  primary key (user_id, org_id, permission_key),
  foreign key (user_id, org_id) references org_memberships (user_id, org_id) on delete cascade
);

alter table clients drop constraint if exists clients_id_org_unique;
alter table clients add constraint clients_id_org_unique unique (id, org_id);

create table if not exists membership_clients (
  user_id   uuid not null,
  org_id    uuid not null,
  client_id uuid not null,
  primary key (user_id, org_id, client_id),
  foreign key (user_id, org_id) references org_memberships (user_id, org_id) on delete cascade,
  foreign key (client_id, org_id) references clients (id, org_id) on delete cascade
);
create index if not exists membership_clients_client_idx on membership_clients (client_id);

-- ── 4. Invitations (used by plan 3; created now so the schema lands once) ────
create table if not exists org_invitations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  email        text not null,
  display_name text,
  preset_id    uuid not null references role_presets(id),
  changes      jsonb not null default '{"granted":[],"revoked":[]}',
  all_clients  boolean not null default true,
  client_ids   uuid[] not null default '{}',
  token_hash   text not null unique,
  invited_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  revoked_at   timestamptz
);
create unique index if not exists org_invitations_one_open_per_email
  on org_invitations (org_id, email) where accepted_at is null and revoked_at is null;
create index if not exists org_invitations_org_idx on org_invitations (org_id);

-- Default-deny like 0017: only the service-role server path reads or writes these.
alter table role_presets enable row level security;
alter table role_preset_permissions enable row level security;
alter table membership_permission_changes enable row level security;
alter table membership_clients enable row level security;
alter table org_invitations enable row level security;

-- ── 5. One access read per request ───────────────────────────────────────────
create or replace function get_membership_access(p_user_id uuid)
returns table (
  org_id uuid, preset_key text, is_owner boolean, all_clients boolean,
  preset_keys text[], granted text[], revoked text[], client_ids uuid[]
)
language sql stable security definer set search_path = public as $$
  select m.org_id, p.key, p.is_owner, m.all_clients,
         coalesce((select array_agg(rpp.permission_key) from role_preset_permissions rpp
                    where rpp.preset_id = p.id), '{}'),
         coalesce((select array_agg(c.permission_key) from membership_permission_changes c
                    where c.user_id = m.user_id and c.org_id = m.org_id and c.granted), '{}'),
         coalesce((select array_agg(c.permission_key) from membership_permission_changes c
                    where c.user_id = m.user_id and c.org_id = m.org_id and not c.granted), '{}'),
         coalesce((select array_agg(mc.client_id) from membership_clients mc
                    where mc.user_id = m.user_id and mc.org_id = m.org_id), '{}')
    from org_memberships m
    join role_presets p on p.id = m.preset_id
   where m.user_id = p_user_id;
$$;
revoke all on function get_membership_access(uuid) from public, anon, authenticated;
grant execute on function get_membership_access(uuid) to service_role;

-- ── 6. RLS ready for more than one agency per person (D498) ──────────────────
create or replace function auth_org_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select org_id from org_memberships where user_id = auth.uid()
$$;
revoke all on function auth_org_ids() from public, anon;
grant execute on function auth_org_ids() to authenticated, service_role;

drop policy if exists "org isolation" on canvases;
create policy "org isolation" on canvases for select using (org_id in (select auth_org_ids()));
drop policy if exists "org isolation" on client_kb_jobs;
create policy "org isolation" on client_kb_jobs for select using (org_id in (select auth_org_ids()));
drop policy if exists "org isolation" on generations;
create policy "org isolation" on generations for select using (org_id in (select auth_org_ids()));
drop policy if exists "org isolation" on node_version_annotations;
create policy "org isolation" on node_version_annotations for select using (org_id in (select auth_org_ids()));
drop policy if exists "org isolation" on moodboard_items;
create policy "org isolation" on moodboard_items for select using (org_id in (select auth_org_ids()));
drop policy if exists "org isolation" on credit_transactions;
create policy "org isolation" on credit_transactions for select using (org_id in (select auth_org_ids()));
drop policy if exists "org isolation" on node_versions;
create policy "org isolation" on node_versions for select using (org_id in (select auth_org_ids()));
drop policy if exists "org isolation" on node_version_decisions;
create policy "org isolation" on node_version_decisions for select using (org_id in (select auth_org_ids()));

notify pgrst, 'reload schema';
```

- [ ] **Step 4: Run the seed test, expect pass**

Run: `npx vitest run src/lib/permissions/seed-matches-catalogue.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Check the migration against a local database**

The repo has no Supabase CLI wiring. Use the user's local Postgres if one exists; otherwise ask the user to paste the file into a throwaway Supabase branch.

Never run it against staging or production in this task. Expected result: the file runs with no error, and these queries return the shown values:

```sql
select key, is_owner, (select count(*) from role_preset_permissions r where r.preset_id = p.id) from role_presets p order by sort;
-- owner | t | 0   senior | f | 56   designer | f | 53
select count(*) from org_memberships where preset_id is null;  -- 0
```

- [ ] **Step 6: Append the migration entry to `docs/auth-production-migration.md`**

Add at the end:

````markdown
## Migration 0062 — permission-based access (D495–D498, 2026-11-11)

`supabase/migrations/0062_permission_based_access.sql`: presets (`role_presets`,
`role_preset_permissions`), per-person ticks (`membership_permission_changes`), picked clients
(`membership_clients`), invitations (`org_invitations`, used from plan 3), the access read
`get_membership_access(uuid)`, and `auth_org_ids()` behind the eight "org isolation" policies.
Paste into the Supabase SQL editor → Run.

**Safe to re-run:** every create uses `if not exists` / `create or replace`, the seed uses
`on conflict do nothing`, and policies are dropped before they are created.

**Nothing changes for anyone on day one:** each membership gets the preset matching its
`org_role` and `all_clients = true`. `org_role` stays and is kept in sync by
`org_memberships_0_sync_preset` until a later migration drops it.

**Ordering:**

1. Merge the code (plan 1) to the branch being deployed.
2. Apply 0062.
3. Deploy the app. The new code calls `get_membership_access`; deploying before 0062 sends
   everyone to `/login?error=no-membership`.

**Verify after running:**

```sql
-- expect owner|t|0, senior|f|56, designer|f|53
select key, is_owner, (select count(*) from role_preset_permissions r where r.preset_id = p.id)
  from role_presets p order by sort;
-- expect 0
select count(*) from org_memberships where preset_id is null;
-- expect one row per member, for any member's user id
select * from get_membership_access('<a member user id>');
```
````

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0062_permission_based_access.sql src/lib/permissions/seed-matches-catalogue.test.ts docs/auth-production-migration.md
git commit -m "feat(db): migration 0062, presets, per-person ticks, picked clients, access read (D495-D498)"
```

---

### Task 4: The caller context carries access

**Files:**
- Modify: `src/lib/dal-logic.ts` (CallerContext type, `presetKeyToOrgRole`)
- Modify: `src/lib/dal.ts` (both resolvers read `get_membership_access`)
- Create: `src/lib/permissions/server.ts`
- Create: `vitest.setup.ts`; Modify: `vitest.config.ts`
- Test: `src/lib/permissions/server.test.ts`; update `src/lib/dal-org-resolution.test.ts` and `src/lib/auth/impersonation-flow.test.ts` mocks

**Interfaces:**
- Consumes: `accessFromRow`, `ownerAccess`, `MembershipAccessRow` (Task 2).
- Produces:
  - `CallerContext` gains `access: Access`. `orgRole` stays, derived from the preset key, until plan 2.
  - `presetKeyToOrgRole(key: string): OrgRole`
  - `accessOf(caller: { access?: Access }): Access`
  - `type ActingCaller = { caller: CallerContext; effectiveOrgId: string; impersonation: ImpersonationState }`
  - `resolveActingCaller(): Promise<ActingCaller>`. When impersonating, `caller.access` is `ownerAccess()` and `effectiveOrgId` is the target.

- [ ] **Step 1: Write the failing test** `src/lib/permissions/server.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.unmock("@/lib/permissions/server");

const { callerMock, impersonationMock } = vi.hoisted(() => ({
  callerMock: vi.fn(),
  impersonationMock: vi.fn(),
}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: callerMock }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: impersonationMock }));

import { accessOf, resolveActingCaller } from "./server";
import { testAccess } from "./test-fixtures";

describe("accessOf", () => {
  it("returns the caller's access", () => {
    const access = testAccess({ keys: ["scripts.view"] });
    expect(accessOf({ access })).toBe(access);
  });

  it("throws when access was not loaded (fail closed)", () => {
    expect(() => accessOf({})).toThrow("Access was not loaded for this request.");
  });
});

describe("resolveActingCaller", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the caller's own org and access when not impersonating", async () => {
    const access = testAccess({ keys: ["scripts.view"] });
    callerMock.mockResolvedValue({ userId: "u1", orgId: "org-1", access });
    impersonationMock.mockResolvedValue({ isImpersonating: false });
    const acting = await resolveActingCaller();
    expect(acting.effectiveOrgId).toBe("org-1");
    expect(acting.caller.access).toBe(access);
  });

  it("acts as the target agency's owner while impersonating", async () => {
    callerMock.mockResolvedValue({ userId: "op", orgId: "yuvabe", access: testAccess({ keys: [] }) });
    impersonationMock.mockResolvedValue({ isImpersonating: true, operatorId: "op", targetOrgId: "org-9", elevated: false });
    const acting = await resolveActingCaller();
    expect(acting.effectiveOrgId).toBe("org-9");
    expect(acting.caller.access.isOwner).toBe(true);
    expect(acting.caller.orgId).toBe("yuvabe");
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/lib/permissions/server.test.ts`
Expected: FAIL, `Failed to resolve import "./server"`.

- [ ] **Step 3: Add `access` to `CallerContext` in `src/lib/dal-logic.ts`**

Replace the `CallerContext` type and add the mapper below `orgRoleToIdentityRole`:

```ts
import type { Access } from "@/lib/permissions/access";

export type CallerContext = {
  userId: string;
  email: string | null;
  platformRole: PlatformRole;
  orgId: string;
  /** Derived from the preset key until plan 2 removes it; new code checks access, never this. */
  orgRole: OrgRole;
  mustChangePassword: boolean;
  /** D495: what this person may do. Read it through accessOf(), never directly. */
  access: Access;
};

// The three seeded presets map onto the old roles; any other preset reads as designer, the
// narrowest, for the few places still reading orgRole until plan 2.
export function presetKeyToOrgRole(presetKey: string): OrgRole {
  return presetKey === "owner" || presetKey === "senior" ? presetKey : "designer";
}
```

Add to `src/lib/dal-logic.test.ts`:

```ts
import { presetKeyToOrgRole } from "./dal-logic";

describe("presetKeyToOrgRole", () => {
  it("maps the seeded presets and treats anything else as designer", () => {
    expect(presetKeyToOrgRole("owner")).toBe("owner");
    expect(presetKeyToOrgRole("senior")).toBe("senior");
    expect(presetKeyToOrgRole("designer")).toBe("designer");
    expect(presetKeyToOrgRole("editor")).toBe("designer");
  });
});
```

- [ ] **Step 4: Read access in `src/lib/dal.ts`**

Add a shared loader and use it in both `resolveCallerContext` and `resolveCallerContextOrNull`. Replace each `db.from("org_memberships")…maybeSingle()` block and the `return {...}` that follows it:

```ts
import { accessFromRow, type MembershipAccessRow } from "@/lib/permissions/access";
import { presetKeyToOrgRole } from "./dal-logic";

// D495/D498: ONE round trip returns the membership and everything access needs. Several rows
// = several agencies, which is not allowed yet (the one_org_per_user index); when it is, the
// agency switcher's choice picks the row here, and nowhere else.
async function loadMembershipAccess(userId: string): Promise<MembershipAccessRow | null> {
  const db = createServerSupabase();
  const { data, error } = await db.rpc("get_membership_access", { p_user_id: userId });
  if (error) throw error;
  const rows = (data ?? []) as MembershipAccessRow[];
  if (rows.length > 1) throw new Error("Belonging to more than one agency is not supported yet.");
  return rows[0] ?? null;
}
```

In `resolveCallerContext`, after `mustChangePassword`:

```ts
  const row = await loadMembershipAccess(user.id);
  if (!row) {
    // Authenticated but unprovisioned — treat as no access.
    redirect("/login?error=no-membership");
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    platformRole,
    orgId: row.org_id,
    orgRole: presetKeyToOrgRole(row.preset_key),
    mustChangePassword,
    access: accessFromRow(row),
  };
```

In `resolveCallerContextOrNull`, the same, with `if (!row) return null;`.

- [ ] **Step 5: Write `src/lib/permissions/server.ts`**

```ts
import "server-only";
import { cache } from "react";
import { resolveCallerContext, type CallerContext } from "@/lib/dal";
import { resolveImpersonationState, type ImpersonationState } from "@/lib/auth/impersonation";
import { ownerAccess, type Access } from "./access";

// Fails closed: a caller without loaded access can do nothing. Tests that mock the caller get
// owner access by default through vitest.setup.ts, which replaces this one function.
export function accessOf(caller: { access?: Access }): Access {
  if (!caller.access) throw new Error("Access was not loaded for this request.");
  return caller.access;
}

export type ActingCaller = {
  caller: CallerContext;
  effectiveOrgId: string;
  impersonation: ImpersonationState;
};

// The caller and the agency they are acting in, resolved once. While a super admin
// impersonates (D81) they act as that agency's owner: the target org, owner access. caller.orgId
// stays their own (attribution and credits already use effectiveOrgId, as withNode did).
// React cache() dedupes this within a page render; route handlers call it once and pass it on.
export const resolveActingCaller = cache(async (): Promise<ActingCaller> => {
  const [caller, impersonation] = await Promise.all([resolveCallerContext(), resolveImpersonationState()]);
  if (impersonation.isImpersonating) {
    return { caller: { ...caller, access: ownerAccess() }, effectiveOrgId: impersonation.targetOrgId, impersonation };
  }
  return { caller, effectiveOrgId: caller.orgId, impersonation };
});
```

Confirm `ImpersonationState` is exported from `src/lib/auth/impersonation.ts` (it is, line 13).

- [ ] **Step 6: Default access in tests**

Create `vitest.setup.ts` at the repo root:

```ts
import { vi } from "vitest";

// D495: many tests mock resolveCallerContext with a partial caller and no `access`. Production
// accessOf() throws on that; in tests it falls back to owner access so those tests keep testing
// what they were written for. Tests about permissions pass a real `access` (see
// src/lib/permissions/test-fixtures.ts) or call vi.unmock("@/lib/permissions/server").
vi.mock("@/lib/permissions/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/permissions/server")>();
  const { testOwnerAccess } = await import("@/lib/permissions/test-fixtures");
  return {
    ...actual,
    accessOf: (caller: { access?: import("@/lib/permissions/access").Access }) => caller.access ?? testOwnerAccess(),
  };
});
```

In `vitest.config.ts`, add `setupFiles` inside `test`:

```ts
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
  },
```

- [ ] **Step 7: Update the two dal test mocks**

In `src/lib/dal-org-resolution.test.ts`:
- replace `membershipMock` and the `createServerSupabase` mock with the code below
- in `beforeEach`, replace the `membershipMock.mockResolvedValue(...)` line with `rpcMock.mockResolvedValue({ data: [testMembershipRow({ org_id: "yuvabe-org" })], error: null });`

```ts
import { testMembershipRow } from "@/lib/permissions/test-fixtures";

const rpcMock = vi.fn(async () => ({ data: [testMembershipRow({ org_id: "yuvabe-org" })], error: null }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({ rpc: rpcMock })),
}));
```

`testMembershipRow` is imported at the top of the file, and the mock factory only closes over `rpcMock`. If vitest reports a TDZ error, declare `rpcMock` through `vi.hoisted` as the file already does for `cookieStore`.

Then run `npx vitest run src/lib/auth src/lib/dal-logic.test.ts src/lib/dal-org-resolution.test.ts`. For every file that fails with `db.rpc is not a function`, change its `createServerSupabase` mock to return `{ rpc: async () => ({ data: [testMembershipRow({...same org/role values the old mock returned, as org_id/preset_key/is_owner...})], error: null }) }` next to anything else it returned.

- [ ] **Step 8: Run, expect pass**

Run: `npx vitest run src/lib/permissions src/lib/auth src/lib/dal-logic.test.ts src/lib/dal-org-resolution.test.ts`
Expected: PASS.

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors only where code builds a `CallerContext` literal without `access`, in tests or the impersonation banner. In test files, add `access: testOwnerAccess()`. In non-test code there should be none; if there is, the code is constructing a caller by hand and must get it from `resolveCallerContext` instead.

- [ ] **Step 10: Commit**

```bash
git add src/lib/dal.ts src/lib/dal-logic.ts src/lib/dal-logic.test.ts src/lib/permissions/server.ts src/lib/permissions/server.test.ts vitest.setup.ts vitest.config.ts src/lib
git commit -m "feat(permissions): caller context loads access in one read; acting caller for impersonation"
```

---

### Task 5: Chokepoints take a guard

**Files:**
- Modify: `src/lib/api/route-helpers.ts`
- Test: `src/lib/api/route-helpers.test.ts` (update and extend)

**Interfaces:**
- Consumes:
  - `resolveActingCaller`, `accessOf` (Task 4)
  - `denialFor`, `FORBIDDEN_MESSAGE` (Task 2)
- Produces (every later task uses these exact signatures):

```ts
export type Guard = { need: PermissionKey };
withClient(req, params: Promise<{ id: string }>, guard: Guard,
  handler: (clientId: string, client: ClientRow, caller: CallerContext) => Promise<AnyResponse>)
withCanvas(req, params: Promise<{ id: string }>, guard: Guard,
  handler: (canvasId: string, canvas: CanvasRow, caller: CallerContext) => Promise<AnyResponse>)
withNode(req, params: Promise<{ id: string }>, guard: Guard,
  handler: (nodeId: string, node: NodeRow, caller: CallerContext, clientId: string, effectiveOrgId: string) => Promise<AnyResponse>,
  options?: { onNotFound?: () => AnyResponse })
withMoodboard(req, moodboardId: string, guard: Guard,
  handler: (moodboardId: string, caller: CallerContext) => Promise<AnyResponse>)
withAccess(req, guard: Guard,
  handler: (caller: CallerContext, effectiveOrgId: string) => Promise<AnyResponse>)
```

- [ ] **Step 1: Update the test mocks and add the failing tests** in `src/lib/api/route-helpers.test.ts`

At the top of the file:
- replace the `vi.mock("@/lib/dal", …)` block with the code below
- `vi.unmock("@/lib/permissions/server")` makes `accessOf` real here, so the tests see true enforcement
- delete the `import { resolveOrgId, resolveCallerContext } from "@/lib/dal";` line and any `vi.mocked(resolveOrgId)` uses. Express the old "impersonation target" tests through `resolveImpersonationStateMock` instead: the chokepoints no longer call `resolveOrgId`.

```ts
vi.unmock("@/lib/permissions/server");

const { callerHolder } = vi.hoisted(() => ({ callerHolder: { access: null as unknown } }));
vi.mock("@/lib/dal", async () => {
  const { testOwnerAccess } = await import("@/lib/permissions/test-fixtures");
  return {
    resolveCallerContext: vi.fn(async () => ({
      userId: "user-1",
      email: "user-1@yuvabe.com",
      platformRole: "member",
      orgId: "org-1",
      orgRole: "owner",
      mustChangePassword: false,
      access: callerHolder.access ?? testOwnerAccess(),
    })),
  };
});
```

Add a `beforeEach(() => { callerHolder.access = null; })` to the top-level describe, and add these tests:

```ts
import { testAccess } from "@/lib/permissions/test-fixtures";

describe("withClient guard (D496)", () => {
  it("runs the handler when the caller holds the permission for this client", async () => {
    callerHolder.access = testAccess({ keys: ["scripts.edit"], clientIds: ["client-1"] });
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const res = await withClient(req("POST"), params, { need: "scripts.edit" }, handler);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledWith("client-1", expect.objectContaining({ id: "client-1" }), expect.objectContaining({ userId: "user-1" }));
  });

  it("answers 404 for a client outside the caller's list, exactly like a foreign agency", async () => {
    callerHolder.access = testAccess({ keys: ["scripts.edit"], clientIds: ["other-client"] });
    const res = await withClient(req("POST"), params, { need: "scripts.edit" }, async () => NextResponse.json({}));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Client not found." });
  });

  it("answers 403 with the agreed copy when the tick is missing", async () => {
    callerHolder.access = testAccess({ keys: ["scripts.view"] });
    const res = await withClient(req("POST"), params, { need: "scripts.edit" }, async () => NextResponse.json({}));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "You don't have access to this. Ask your agency owner." });
  });

  it("acts as owner while impersonating the client's agency", async () => {
    callerHolder.access = testAccess({ keys: [] });
    resolveImpersonationStateMock.mockResolvedValueOnce({ isImpersonating: true, operatorId: "op", targetOrgId: "org-1", elevated: false });
    const res = await withClient(req("GET"), params, { need: "scripts.view" }, async () => NextResponse.json({ ok: true }));
    expect(res.status).toBe(200);
  });
});

describe("withNode guard", () => {
  it("checks the node's client scope", async () => {
    callerHolder.access = testAccess({ keys: ["canvases.view"], clientIds: ["someone-else"] });
    const res = await withNode(req("GET"), Promise.resolve({ id: "node-1" }), { need: "canvases.view" }, async () => NextResponse.json({}));
    expect(res.status).toBe(404);
  });

  it("refuses a missing generate tick with 403", async () => {
    callerHolder.access = testAccess({ keys: ["canvases.view"] });
    const res = await withNode(req("POST"), Promise.resolve({ id: "node-1" }), { need: "video_generation.generate" }, async () => NextResponse.json({}));
    expect(res.status).toBe(403);
  });
});

describe("withAccess", () => {
  it("allows an agency key the caller holds", async () => {
    callerHolder.access = testAccess({ keys: ["clients.edit"] });
    const res = await withAccess(req("POST"), { need: "clients.edit" }, async () => NextResponse.json({ ok: true }));
    expect(res.status).toBe(200);
  });

  it("allows a client-scoped key held for at least one client", async () => {
    callerHolder.access = testAccess({ keys: ["voices.view"], clientIds: ["c-1"] });
    const res = await withAccess(req("GET"), { need: "voices.view" }, async () => NextResponse.json({ ok: true }));
    expect(res.status).toBe(200);
  });

  it("refuses without the key", async () => {
    callerHolder.access = testAccess({ keys: [] });
    const res = await withAccess(req("GET"), { need: "voices.view" }, async () => NextResponse.json({}));
    expect(res.status).toBe(403);
  });
});
```

Every existing call in this file changes to the new arity: insert `{ need: "scripts.view" }` (GET) or `{ need: "scripts.edit" }` (other methods) as the third argument of each `withClient(...)` / `withNode(...)` call. The import line becomes `import { withClient, withNode, withAccess } from "./route-helpers";`.

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/lib/api/route-helpers.test.ts`
Expected: FAIL. `withAccess` is not exported, and the guard argument is treated as the handler ("handler is not a function").

- [ ] **Step 3: Rewrite the chokepoints in `src/lib/api/route-helpers.ts`**

Replace the imports from `@/lib/dal`, and add the guard plumbing above `withClient`:

```ts
import type { CallerContext } from "@/lib/dal";
import type { ImpersonationState } from "@/lib/auth/impersonation";
import { accessOf, resolveActingCaller } from "@/lib/permissions/server";
import { denialFor, FORBIDDEN_MESSAGE, type Denial } from "@/lib/permissions/check";
import type { PermissionKey } from "@/lib/permissions/catalogue";

// D496: every handler names the one permission it needs. Required, so TypeScript forces the
// decision; route-coverage.test.ts fails on any handler that skips the chokepoints.
export type Guard = { need: PermissionKey };

function denial(denied: Denial, notFoundMessage: string): AnyResponse {
  return denied === "not_found" ? apiError(notFoundMessage, 404) : apiError(FORBIDDEN_MESSAGE, 403);
}
```

Split the existing `assertImpersonationWriteAllowed` so the chokepoints reuse the impersonation state they already have. The exported function keeps its signature for existing callers:

```ts
export async function assertImpersonationWriteAllowed(req: Request): Promise<AnyResponse | null> {
  return writeGate(req, await resolveImpersonationState());
}

async function writeGate(req: Request, impersonation: ImpersonationState): Promise<AnyResponse | null> {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD") return null;
  if (!impersonation.isImpersonating) return null;
  if (!impersonation.elevated) return apiError(IMPERSONATION_READ_ONLY_MESSAGE, 403);
  await logImpersonationEvent({
    operatorId: impersonation.operatorId,
    targetOrgId: impersonation.targetOrgId,
    eventType: "write_action",
    detail: { method, path: new URL(req.url).pathname },
  });
  return null;
}
```

`withClient`:

```ts
export async function withClient(
  req: Request,
  params: Promise<{ id: string }>,
  guard: Guard,
  handler: (clientId: string, client: ClientRow, caller: CallerContext) => Promise<AnyResponse>,
): Promise<AnyResponse> {
  const { id: clientId } = await params;
  // The client lookup and the caller don't depend on each other (same reasoning as withNode).
  const [client, acting] = await Promise.all([getClientById(clientId), resolveActingCaller()]);
  // Org isolation: 404, never 403 — do not confirm foreign resources exist.
  if (!client || client.org_id !== acting.effectiveOrgId) return apiError("Client not found.", 404);

  const denied = denialFor(accessOf(acting.caller), guard.need, clientId);
  if (denied) return denial(denied, "Client not found.");

  const blocked = await writeGate(req, acting.impersonation);
  if (blocked) return blocked;

  return handler(clientId, client, acting.caller);
}
```

`withCanvas`: keep its query unchanged and select `client_id` (already in `*`). Then:

```ts
export async function withCanvas(
  req: Request,
  params: Promise<{ id: string }>,
  guard: Guard,
  handler: (canvasId: string, canvas: CanvasRow, caller: CallerContext) => Promise<AnyResponse>,
): Promise<AnyResponse> {
  const { id: canvasId } = await params;
  const supabase = createServerSupabase();
  const [{ data, error }, acting] = await Promise.all([
    supabase.from("canvases").select("*, clients!inner(org_id)").eq("id", canvasId).maybeSingle(),
    resolveActingCaller(),
  ]);
  if (error) throw error;
  if (!data) return apiError("Canvas not found.", 404);

  const row = data as unknown as CanvasWithOrg;
  const client = unwrapEmbed(row.clients);
  if (!client || client.org_id !== acting.effectiveOrgId) return apiError("Canvas not found.", 404);

  const denied = denialFor(accessOf(acting.caller), guard.need, row.client_id);
  if (denied) return denial(denied, "Canvas not found.");

  const blocked = await writeGate(req, acting.impersonation);
  if (blocked) return blocked;

  const { clients: _clients, ...canvas } = row;
  return handler(canvasId, canvas as CanvasRow, acting.caller);
}
```

`withNode`: the new signature is `(req, params, guard, handler, options?)`. In the body, replace the `Promise.all([... resolveCallerContext(), resolveImpersonationState()])` with `[{ data, error }, acting]` using `resolveActingCaller()`. Use `acting.effectiveOrgId` for the org check. After the org check, add:

```ts
  const denied = denialFor(accessOf(acting.caller), guard.need, canvas.client_id);
  if (denied) return denial(denied, "Node not found.");

  const blocked = await writeGate(req, acting.impersonation);
  if (blocked) return blocked;

  const { canvases: _canvases, ...node } = row;
  return handler(nodeId, node as NodeRow, acting.caller, canvas.client_id, acting.effectiveOrgId);
```

`withMoodboard`: select `"id, client_id, clients!inner(org_id)"`, and run it in parallel with `resolveActingCaller()`. Check the org with `acting.effectiveOrgId`, then `denialFor(accessOf(acting.caller), guard.need, data.client_id)` with the 404 message `"Moodboard not found."`, then the write gate, then `handler(moodboardId, acting.caller)`. Its signature becomes `(req, moodboardId, guard, handler)`. Extend `MoodboardWithOrg` with `client_id: string`.

New `withAccess`:

```ts
// For routes not rooted at one client or resource: the voice library, the moodboard index, the
// review inbox and counts. A client-scoped key passes when held for at least one client; the
// handler then filters what it returns with canSeeClient (D496).
export async function withAccess(
  req: Request,
  guard: Guard,
  handler: (caller: CallerContext, effectiveOrgId: string) => Promise<AnyResponse>,
): Promise<AnyResponse> {
  const acting = await resolveActingCaller();
  const denied = denialFor(accessOf(acting.caller), guard.need, null);
  if (denied) return denial(denied, "Not found.");
  const blocked = await writeGate(req, acting.impersonation);
  if (blocked) return blocked;
  return handler(acting.caller, acting.effectiveOrgId);
}
```

Remove the now-unused `resolveOrgId, resolveCallerContext` import from route-helpers.ts.

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/lib/api`
Expected: PASS. `route-helpers.share-token.test.ts` is untouched (the token resolvers do not change). In `generation-org-attribution.test.ts`, add the guard argument to its calls if it calls the chokepoints.

- [ ] **Step 5: Commit**

`npx tsc --noEmit` now fails at every route; Task 6 fixes them. Commit only once this task's own files typecheck: run `npx tsc --noEmit 2>&1 | grep -v "^src/app/api"` and expect no output.

```bash
git add src/lib/api
git commit -m "feat(permissions): chokepoints take a required permission guard; withAccess"
```

---

### Task 6: Every route declares its permission

**Files:**
- Create (temporary, not committed): `scripts/codemods/add-route-guards.mjs`
- Modify: 150 route files under `src/app/api`
- Modify by hand:
  - `clients/[id]/kb/re-analyze`
  - `nodes/[id]/file/finalize`, `nodes/[id]/file/from-url`, `nodes/[id]/file/sign`
  - `copilot`, `copilot/actions`, `copilot/references`
  - `elevenlabs/voices`, `elevenlabs/voices/[voiceId]`, `elevenlabs/voices/save`
  - `moodboards`, `review/counts`, `review/inbox`
- Modify: the 13 test files that mock `@/lib/api/route-helpers`
- Modify: `src/lib/db/review.ts` (`getOrgReviewCounts` takes a scope), `src/lib/db/moodboards.ts` (`listClientsWithMoodboards` takes a scope)

**Interfaces:**
- Consumes: Task 5's signatures.
- Produces:
  - `getOrgReviewCounts(orgId: string, clientIds: readonly string[] | null)`
  - `listClientsWithMoodboards(orgId: string, clientIds: readonly string[] | null)`

  `null` means all clients.
- Adds `scopeIds(access: Access): string[] | null` to `src/lib/permissions/check.ts`: `null` for "all", else the ids.

**The permission of every handler**

Generated from the route inventory; it is the source for the codemod.

| Route | Method | Permission |
|---|---|---|
| `canvas/[id]/cost` | GET | `canvases.view` |
| `canvas/[id]/generations` | GET | `canvases.view` |
| `canvas/[id]/script-composites` | POST | `canvases.edit` |
| `canvases/[cid]/approval-statuses` | GET | `canvases.view` |
| `canvases/[cid]/client-feedback` | GET | `client_review.view` |
| `canvases/[cid]/editor` | GET | `video_editor.view` |
| `canvases/[cid]/editor` | PATCH | `video_editor.edit` |
| `canvases/[cid]/editor/dub-source` | POST | `video_editor.generate` |
| `canvases/[cid]/editor/dub-status` | GET | `video_editor.view` |
| `canvases/[cid]/editor/exports` | POST | `video_editor.share` |
| `canvases/[cid]/editor/exports/[jobId]` | GET | `video_editor.view` |
| `canvases/[cid]/editor/renders` | POST | `video_editor.generate` |
| `canvases/[cid]/editor/renders/[jobId]` | GET | `video_editor.view` |
| `canvases/[cid]/editor/transcribe` | POST | `video_editor.generate` |
| `canvases/[cid]/editor/transcribe/[jobId]` | GET | `video_editor.view` |
| `canvases/[cid]/editor/transcripts` | GET | `video_editor.view` |
| `canvases/[cid]/lock/release` | POST | `canvases.view` |
| `canvases/[cid]/review` | GET | `internal_review.view` |
| `clients/[id]` (archive) | PATCH | `clients.delete` |
| `clients/[id]/asset-imports` | GET / POST | `brand_assets.view` / `brand_assets.generate` |
| `clients/[id]/asset-imports/assets` | GET | `brand_assets.view` |
| `clients/[id]/asset-imports/assets/[assetId]` | DELETE | `brand_assets.delete` |
| `clients/[id]/asset-imports/sources/[source]` | PUT | `brand_assets.edit` |
| `clients/[id]/avatars` | GET / POST | `avatars.view` / `avatars.edit` |
| `clients/[id]/avatars/[avatarId]` | GET / PATCH / DELETE | `avatars.view` / `avatars.edit` / `avatars.delete` |
| `clients/[id]/avatars/[avatarId]/front` | POST | `avatars.edit` |
| `clients/[id]/avatars/[avatarId]/generations` | GET / POST | `avatars.view` / `avatars.generate` |
| `clients/[id]/avatars/[avatarId]/images` | POST | `avatars.edit` |
| `clients/[id]/avatars/[avatarId]/images/sign` | POST | `avatars.edit` |
| `clients/[id]/avatars/[avatarId]/sheet` | POST | `avatars.generate` |
| `clients/[id]/avatars/[avatarId]/voice` | PUT | `avatars.edit` |
| `clients/[id]/avatars/[avatarId]/voice-preview` | GET / POST | `avatars.view` / `avatars.generate` |
| `clients/[id]/brand-kit` | GET | `brand_assets.view` |
| `clients/[id]/brand-kit/assets` | POST | `brand_assets.edit` |
| `clients/[id]/brand-kit/assets/[assetId]` | DELETE | `brand_assets.delete` |
| `clients/[id]/brand-kit/assets/sign` | POST | `brand_assets.edit` |
| `clients/[id]/brand-kit/details` | PATCH | `brand_assets.edit` |
| `clients/[id]/drive-folder` | PATCH | `client_profile.edit` |
| `clients/[id]/image-analysis` | GET / POST | `brand_knowledge.view` / `brand_knowledge.generate` |
| `clients/[id]/kb/active` | GET | `brand_knowledge.view` |
| `clients/[id]/kb/documents` | POST / DELETE | `brand_knowledge.edit` / `brand_knowledge.delete` |
| `clients/[id]/kb/documents/finalize` | POST | `brand_knowledge.edit` |
| `clients/[id]/kb/documents/sign` | POST | `brand_knowledge.edit` |
| `clients/[id]/kb/images` | POST / DELETE | `brand_knowledge.edit` / `brand_knowledge.delete` |
| `clients/[id]/kb/images/finalize` | POST | `brand_knowledge.edit` |
| `clients/[id]/kb/images/sign` | POST | `brand_knowledge.edit` |
| `clients/[id]/kb/re-analyze` | POST | `brand_knowledge.generate` (hand edit) |
| `clients/[id]/kb/re-extract` | POST | `brand_knowledge.generate` |
| `clients/[id]/kb/ready` | POST | `brand_knowledge.edit` |
| `clients/[id]/logo`, `logo/finalize`, `logo/sign` | POST | `client_profile.edit` |
| `clients/[id]/market` | GET | `market.view` |
| `clients/[id]/market/references` | POST | `market.edit` |
| `clients/[id]/market/signals` | POST | `market.edit` |
| `clients/[id]/market/signals/[signalId]` | PATCH / DELETE | `market.edit` / `market.delete` |
| `clients/[id]/moodboards` | GET / POST | `moodboards.view` / `moodboards.edit` |
| `clients/[id]/name` | PATCH | `client_profile.edit` |
| `clients/[id]/performance` | GET | `market.view` |
| `clients/[id]/performance/handles` | GET / POST | `market.view` / `market.edit` |
| `clients/[id]/performance/handles/[handle]` | DELETE | `market.delete` |
| `clients/[id]/performance/refresh` | POST | `market.generate` |
| `clients/[id]/scripts` | GET / POST | `scripts.view` / `scripts.edit` |
| `clients/[id]/scripts/[scriptId]` | GET / DELETE | `scripts.view` / `scripts.delete` |
| `…/scripts/[scriptId]/assets`, `assets/sign`, `assets/uploaded` | POST | `scripts.edit` |
| `…/scripts/[scriptId]/cast/[castId]` | PUT / PATCH | `scripts.edit` |
| `…/scripts/[scriptId]/cast/[castId]/brief` | POST | `scripts.generate` |
| `…/scripts/[scriptId]/fields` | PATCH | `scripts.edit` |
| `…/scripts/[scriptId]/generate` | GET | `scripts.generate` |
| `…/scripts/[scriptId]/inline-edit` | POST | `scripts.generate` |
| `…/scripts/[scriptId]/locations/[locationId]/plate` | POST | `storyboard.generate` |
| `…/scripts/[scriptId]/mark-final` | POST | `scripts.approve` |
| `…/scripts/[scriptId]/panels/[shotId]` | POST | `storyboard.generate` |
| `…/scripts/[scriptId]/panels/[shotId]/pick` | PUT | `storyboard.edit` |
| `…/scripts/[scriptId]/proposals/[messageId]` | POST | `scripts.edit` |
| `…/scripts/[scriptId]/reopen` | POST | `scripts.approve` |
| `…/scripts/[scriptId]/review` | GET | `client_review.view` |
| `…/scripts/[scriptId]/review/comments/[commentId]` | PATCH | `client_review.edit` |
| `…/scripts/[scriptId]/review/comments/[commentId]/replies` | POST | `client_review.edit` |
| `…/scripts/[scriptId]/review/share` | POST | `client_review.share` |
| `…/scripts/[scriptId]/review/stage` | POST | `client_review.edit` |
| `…/scripts/[scriptId]/turn` | POST | `scripts.generate` |
| `…/scripts/[scriptId]/visualise` | GET | `storyboard.view` |
| `clients/[id]/voices` | GET | `voices.view` |
| `clients/[id]/voices/[voiceId]` | DELETE | `voices.delete` |
| `clients/[id]/voices/clone` | POST | `voices.generate` |
| `clients/[id]/voices/save` | POST | `voices.edit` |
| `clients/[id]/website-url` | PATCH | `client_profile.edit` |
| `copilot`, `copilot/actions`, `copilot/references` | POST | `canvas_copilot.generate` (hand edit) |
| `elevenlabs/voices`, `elevenlabs/voices/[voiceId]` | GET | `voices.view` (hand edit) |
| `elevenlabs/voices/save` | POST | `voices.edit` (hand edit) |
| `moodboards` | GET | `moodboards.view` (hand edit) |
| `moodboards/[id]` | DELETE | `moodboards.delete` |
| `moodboards/[id]/items` | GET / POST | `moodboards.view` / `moodboards.edit` |
| `moodboards/[id]/items/[itemId]` | DELETE | `moodboards.edit` |
| `nodes/[id]/client-review` | GET / POST | `client_review.view` / `client_review.share` |
| `nodes/[id]/client-review/sign` | POST | `client_review.edit` |
| `nodes/[id]/compile-preview` | POST | `canvases.view` |
| `nodes/[id]/compose` | GET / POST | `canvases.view` / `image_generation.generate` |
| `nodes/[id]/compose/select` | POST | `canvases.edit` |
| `nodes/[id]/composite-generate` | POST | `image_generation.generate` |
| `nodes/[id]/dub`, `dub-voice-preview`, `voice-change`, `lip-sync` | POST | `audio.generate` |
| `nodes/[id]/duplicate` | POST | `canvases.edit` |
| `nodes/[id]/file` | POST / DELETE | `canvases.edit` |
| `nodes/[id]/file/drive` | POST | `canvases.edit` |
| `nodes/[id]/file/extract` | POST | `canvases.generate` |
| `nodes/[id]/file/finalize`, `file/from-url`, `file/sign` | POST | `canvases.edit` (hand edit) |
| `nodes/[id]/generate`, `parse` | POST | `canvases.generate` |
| `nodes/[id]/image-generate` | POST | `image_generation.generate` |
| `nodes/[id]/multishot-prompt`, `split-scene`, `video-edit`, `video-generate`, `video-prompt` | POST | `video_generation.generate` |
| `nodes/[id]/restore-version` | POST | `canvases.edit` |
| `nodes/[id]/upstream-images`, `versions` | GET | `canvases.view` |
| `nodes/duplicate-batch` | POST | `canvases.edit` |
| `review/counts`, `review/inbox` | GET | `internal_review.view` (hand edit) |

**Allowlisted (no permission; reason recorded in Task 7's test):**
- `admin/*`: `requireSuperAdmin`
- `drive/*`: the person's own Google token
- `image-proxy`: a public image
- `me`: the caller's own identity
- `r/*`: share token
- `webhooks/*`: shared secret

- [ ] **Step 1: Write the codemod** `scripts/codemods/add-route-guards.mjs`

The `MAP` object below is the table above, one entry per route path with each method's key. Paths are relative to `src/app/api`; `…` above is `clients/[id]`.

```js
// One-off: inserts `{ need: "<key>" },` as the third argument of the first chokepoint call in
// every exported handler. Not committed. Delete after Task 6.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MAP = {
  "canvas/[id]/cost": { GET: "canvases.view" },
  "canvas/[id]/generations": { GET: "canvases.view" },
  "canvas/[id]/script-composites": { POST: "canvases.edit" },
  "canvases/[cid]/approval-statuses": { GET: "canvases.view" },
  "canvases/[cid]/client-feedback": { GET: "client_review.view" },
  "canvases/[cid]/editor": { GET: "video_editor.view", PATCH: "video_editor.edit" },
  "canvases/[cid]/editor/dub-source": { POST: "video_editor.generate" },
  "canvases/[cid]/editor/dub-status": { GET: "video_editor.view" },
  "canvases/[cid]/editor/exports": { POST: "video_editor.share" },
  "canvases/[cid]/editor/exports/[jobId]": { GET: "video_editor.view" },
  "canvases/[cid]/editor/renders": { POST: "video_editor.generate" },
  "canvases/[cid]/editor/renders/[jobId]": { GET: "video_editor.view" },
  "canvases/[cid]/editor/transcribe": { POST: "video_editor.generate" },
  "canvases/[cid]/editor/transcribe/[jobId]": { GET: "video_editor.view" },
  "canvases/[cid]/editor/transcripts": { GET: "video_editor.view" },
  "canvases/[cid]/lock/release": { POST: "canvases.view" },
  "canvases/[cid]/review": { GET: "internal_review.view" },
  "clients/[id]": { PATCH: "clients.delete" },
  "clients/[id]/asset-imports": { GET: "brand_assets.view", POST: "brand_assets.generate" },
  "clients/[id]/asset-imports/assets": { GET: "brand_assets.view" },
  "clients/[id]/asset-imports/assets/[assetId]": { DELETE: "brand_assets.delete" },
  "clients/[id]/asset-imports/sources/[source]": { PUT: "brand_assets.edit" },
  "clients/[id]/avatars": { GET: "avatars.view", POST: "avatars.edit" },
  "clients/[id]/avatars/[avatarId]": { GET: "avatars.view", PATCH: "avatars.edit", DELETE: "avatars.delete" },
  "clients/[id]/avatars/[avatarId]/front": { POST: "avatars.edit" },
  "clients/[id]/avatars/[avatarId]/generations": { GET: "avatars.view", POST: "avatars.generate" },
  "clients/[id]/avatars/[avatarId]/images": { POST: "avatars.edit" },
  "clients/[id]/avatars/[avatarId]/images/sign": { POST: "avatars.edit" },
  "clients/[id]/avatars/[avatarId]/sheet": { POST: "avatars.generate" },
  "clients/[id]/avatars/[avatarId]/voice": { PUT: "avatars.edit" },
  "clients/[id]/avatars/[avatarId]/voice-preview": { GET: "avatars.view", POST: "avatars.generate" },
  "clients/[id]/brand-kit": { GET: "brand_assets.view" },
  "clients/[id]/brand-kit/assets": { POST: "brand_assets.edit" },
  "clients/[id]/brand-kit/assets/[assetId]": { DELETE: "brand_assets.delete" },
  "clients/[id]/brand-kit/assets/sign": { POST: "brand_assets.edit" },
  "clients/[id]/brand-kit/details": { PATCH: "brand_assets.edit" },
  "clients/[id]/drive-folder": { PATCH: "client_profile.edit" },
  "clients/[id]/image-analysis": { GET: "brand_knowledge.view", POST: "brand_knowledge.generate" },
  "clients/[id]/kb/active": { GET: "brand_knowledge.view" },
  "clients/[id]/kb/documents": { POST: "brand_knowledge.edit", DELETE: "brand_knowledge.delete" },
  "clients/[id]/kb/documents/finalize": { POST: "brand_knowledge.edit" },
  "clients/[id]/kb/documents/sign": { POST: "brand_knowledge.edit" },
  "clients/[id]/kb/images": { POST: "brand_knowledge.edit", DELETE: "brand_knowledge.delete" },
  "clients/[id]/kb/images/finalize": { POST: "brand_knowledge.edit" },
  "clients/[id]/kb/images/sign": { POST: "brand_knowledge.edit" },
  "clients/[id]/kb/re-extract": { POST: "brand_knowledge.generate" },
  "clients/[id]/kb/ready": { POST: "brand_knowledge.edit" },
  "clients/[id]/logo": { POST: "client_profile.edit" },
  "clients/[id]/logo/finalize": { POST: "client_profile.edit" },
  "clients/[id]/logo/sign": { POST: "client_profile.edit" },
  "clients/[id]/market": { GET: "market.view" },
  "clients/[id]/market/references": { POST: "market.edit" },
  "clients/[id]/market/signals": { POST: "market.edit" },
  "clients/[id]/market/signals/[signalId]": { PATCH: "market.edit", DELETE: "market.delete" },
  "clients/[id]/moodboards": { GET: "moodboards.view", POST: "moodboards.edit" },
  "clients/[id]/name": { PATCH: "client_profile.edit" },
  "clients/[id]/performance": { GET: "market.view" },
  "clients/[id]/performance/handles": { GET: "market.view", POST: "market.edit" },
  "clients/[id]/performance/handles/[handle]": { DELETE: "market.delete" },
  "clients/[id]/performance/refresh": { POST: "market.generate" },
  "clients/[id]/scripts": { GET: "scripts.view", POST: "scripts.edit" },
  "clients/[id]/scripts/[scriptId]": { GET: "scripts.view", DELETE: "scripts.delete" },
  "clients/[id]/scripts/[scriptId]/assets": { POST: "scripts.edit" },
  "clients/[id]/scripts/[scriptId]/assets/sign": { POST: "scripts.edit" },
  "clients/[id]/scripts/[scriptId]/assets/uploaded": { POST: "scripts.edit" },
  "clients/[id]/scripts/[scriptId]/cast/[castId]": { PUT: "scripts.edit", PATCH: "scripts.edit" },
  "clients/[id]/scripts/[scriptId]/cast/[castId]/brief": { POST: "scripts.generate" },
  "clients/[id]/scripts/[scriptId]/fields": { PATCH: "scripts.edit" },
  "clients/[id]/scripts/[scriptId]/generate": { GET: "scripts.generate" },
  "clients/[id]/scripts/[scriptId]/inline-edit": { POST: "scripts.generate" },
  "clients/[id]/scripts/[scriptId]/locations/[locationId]/plate": { POST: "storyboard.generate" },
  "clients/[id]/scripts/[scriptId]/mark-final": { POST: "scripts.approve" },
  "clients/[id]/scripts/[scriptId]/panels/[shotId]": { POST: "storyboard.generate" },
  "clients/[id]/scripts/[scriptId]/panels/[shotId]/pick": { PUT: "storyboard.edit" },
  "clients/[id]/scripts/[scriptId]/proposals/[messageId]": { POST: "scripts.edit" },
  "clients/[id]/scripts/[scriptId]/reopen": { POST: "scripts.approve" },
  "clients/[id]/scripts/[scriptId]/review": { GET: "client_review.view" },
  "clients/[id]/scripts/[scriptId]/review/comments/[commentId]": { PATCH: "client_review.edit" },
  "clients/[id]/scripts/[scriptId]/review/comments/[commentId]/replies": { POST: "client_review.edit" },
  "clients/[id]/scripts/[scriptId]/review/share": { POST: "client_review.share" },
  "clients/[id]/scripts/[scriptId]/review/stage": { POST: "client_review.edit" },
  "clients/[id]/scripts/[scriptId]/turn": { POST: "scripts.generate" },
  "clients/[id]/scripts/[scriptId]/visualise": { GET: "storyboard.view" },
  "clients/[id]/voices": { GET: "voices.view" },
  "clients/[id]/voices/[voiceId]": { DELETE: "voices.delete" },
  "clients/[id]/voices/clone": { POST: "voices.generate" },
  "clients/[id]/voices/save": { POST: "voices.edit" },
  "clients/[id]/website-url": { PATCH: "client_profile.edit" },
  "moodboards/[id]": { DELETE: "moodboards.delete" },
  "moodboards/[id]/items": { GET: "moodboards.view", POST: "moodboards.edit" },
  "moodboards/[id]/items/[itemId]": { DELETE: "moodboards.edit" },
  "nodes/[id]/client-review": { GET: "client_review.view", POST: "client_review.share" },
  "nodes/[id]/client-review/sign": { POST: "client_review.edit" },
  "nodes/[id]/compile-preview": { POST: "canvases.view" },
  "nodes/[id]/compose": { GET: "canvases.view", POST: "image_generation.generate" },
  "nodes/[id]/compose/select": { POST: "canvases.edit" },
  "nodes/[id]/composite-generate": { POST: "image_generation.generate" },
  "nodes/[id]/dub": { POST: "audio.generate" },
  "nodes/[id]/dub-voice-preview": { POST: "audio.generate" },
  "nodes/[id]/duplicate": { POST: "canvases.edit" },
  "nodes/[id]/file": { POST: "canvases.edit", DELETE: "canvases.edit" },
  "nodes/[id]/file/drive": { POST: "canvases.edit" },
  "nodes/[id]/file/extract": { POST: "canvases.generate" },
  "nodes/[id]/generate": { POST: "canvases.generate" },
  "nodes/[id]/image-generate": { POST: "image_generation.generate" },
  "nodes/[id]/lip-sync": { POST: "audio.generate" },
  "nodes/[id]/multishot-prompt": { POST: "video_generation.generate" },
  "nodes/[id]/parse": { POST: "canvases.generate" },
  "nodes/[id]/restore-version": { POST: "canvases.edit" },
  "nodes/[id]/split-scene": { POST: "video_generation.generate" },
  "nodes/[id]/upstream-images": { GET: "canvases.view" },
  "nodes/[id]/versions": { GET: "canvases.view" },
  "nodes/[id]/video-edit": { POST: "video_generation.generate" },
  "nodes/[id]/video-generate": { POST: "video_generation.generate" },
  "nodes/[id]/video-prompt": { POST: "video_generation.generate" },
  "nodes/[id]/voice-change": { POST: "audio.generate" },
  "nodes/duplicate-batch": { POST: "canvases.edit" },
};

const WRAPPERS = ["withClient", "withCanvas", "withNode", "withMoodboard"];
const HANDLER_RE = /export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g;

// Index just after the second top-level comma of the first chokepoint call in `seg`.
function insertionPoint(seg) {
  let first = null;
  for (const w of WRAPPERS) {
    const i = seg.indexOf(`${w}(`);
    if (i >= 0 && (first === null || i < first.i)) first = { i, w };
  }
  if (!first) return null;
  let depth = 0;
  let commas = 0;
  for (let j = first.i + first.w.length; j < seg.length; j++) {
    const c = seg[j];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") {
      depth--;
      if (depth === 0) return null;
    } else if (c === "," && depth === 1 && ++commas === 2) return j + 1;
  }
  return null;
}

const problems = [];
for (const [route, methods] of Object.entries(MAP)) {
  const file = join("src/app/api", route, "route.ts");
  let src = readFileSync(file, "utf8");
  const starts = [...src.matchAll(HANDLER_RE)].map((m) => ({ method: m[1], index: m.index }));
  for (let i = starts.length - 1; i >= 0; i--) {
    const { method, index } = starts[i];
    const key = methods[method];
    if (!key) { problems.push(`${route} ${method}: not in MAP`); continue; }
    const end = i + 1 < starts.length ? starts[i + 1].index : src.length;
    const at = insertionPoint(src.slice(index, end));
    if (at === null) { problems.push(`${route} ${method}: no chokepoint call inside the handler — edit by hand`); continue; }
    src = src.slice(0, index + at) + ` { need: "${key}" },` + src.slice(index + at);
  }
  writeFileSync(file, src);
}
console.log(problems.length ? problems.join("\n") : "every mapped handler updated");
```

- [ ] **Step 2: Run the codemod and read its report**

Run: `node scripts/codemods/add-route-guards.mjs`
Expected: `every mapped handler updated`. Fix each reported line by hand, putting the guard as the third argument of that handler's chokepoint call.

- [ ] **Step 3: Review the diff**

Run: `git diff --stat src/app/api | tail -1` and `git diff src/app/api | grep '^+' | grep -v 'need: "' | grep -v '^+++'`
Expected: one changed file per `MAP` entry, and the second command prints nothing: the codemod only added guards.

- [ ] **Step 4: Hand edit: `clients/[id]/kb/re-analyze/route.ts`**

The route ignores the client and reads any KB version by id. Change the export so the existing body runs inside `withClient`, and scope the version read to the client:

```ts
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, { need: "brand_knowledge.generate" }, async (clientId) =>
    withTryCatch("Re-analysis failed", async () => {
      // ...the existing body of the withTryCatch callback, unchanged, except:
    }),
  );
}
```

Inside the body, the `client_kb_versions` read gains `.eq("client_id", clientId)` right after `.eq("id", versionId)`. Remove the old `await params;` line and the `assertImpersonationWriteAllowed` block (withClient does both). If the body later writes the version with `.eq("id", versionId)`, add `.eq("client_id", clientId)` there too.

- [ ] **Step 5: Hand edit: `nodes/[id]/file/finalize`, `file/from-url`, `file/sign`**

Same pattern in all three. Wrap the existing body:

```ts
import { apiError, apiOk, withNode } from "@/lib/api/route-helpers";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withNode(req, params, { need: "canvases.edit" }, async (nodeId, node, _caller, clientId) => {
    // ...existing body...
  });
}
```

In each body:
- delete `const { id: nodeId } = await params;` and the `assertImpersonationWriteAllowed` block
- **finalize:** replace the `resolveOwnership` try/catch with `const expectedPrefix = \`clients/${clientId}/canvases/${node.canvas_id}/nodes/${nodeId}/files/\`;` and drop the now-unused `resolveOwnership` import
- **sign:** keep `signNodeFileUpload` as is (it resolves ownership itself), and keep its catch
- **from-url:** delete the now-redundant "Verify node exists" read only if nothing else uses `nodeRow`. It does use `nodeRow.data.fileUrl`, so keep the read, which now runs only for a node in scope.

- [ ] **Step 6: Hand edit: the three copilot routes**

Each reads `canvasId` from the body. Resolve it through `withCanvas`, so the agency, the client scope and `canvas_copilot.generate` are checked before the canvas is read. In `copilot/route.ts`, after the existing `if (!canvasId) return apiError(...)` line, wrap the rest:

```ts
import { apiError, withCanvas } from "@/lib/api/route-helpers";

  return withCanvas(req, Promise.resolve({ id: canvasId }), { need: "canvas_copilot.generate" }, async () => {
    const canvasContext = await buildCopilotContext(canvasId, body?.mentionedIds ?? []);
    // ...the rest of the existing body, unchanged...
  });
```

`withCanvas` returns `AnyResponse` (a `NextResponse`). The copilot route returns a streaming `new Response(...)`. Change the streaming return to `new NextResponse(stream, { headers: … })` (import `NextResponse` from `next/server`) so the types line up. Apply the same wrap in `copilot/actions/route.ts` (after line 210's check) and `copilot/references/route.ts` (after line 35's check).

- [ ] **Step 7: Hand edit: routes not rooted at a client**

`elevenlabs/voices/route.ts`: replace the first two lines of `GET` and wrap the rest:

```ts
import { apiError, apiOk, withAccess } from "@/lib/api/route-helpers";

export async function GET(req: Request) {
  return withAccess(req, { need: "voices.view" }, async () => {
    // ...existing body from `const url = new URL(req.url);` on...
  });
}
```

Apply the same to `elevenlabs/voices/[voiceId]/route.ts` (`voices.view`; rename `_req` to `req`) and `elevenlabs/voices/save/route.ts` (`voices.edit`). Drop the `resolveCallerContextOrNull` import and the 401 lines (`resolveActingCaller` redirects an unauthenticated request, as every other route does). Update these three routes' tests: they mock `resolveCallerContextOrNull` returning `null` to assert 401; change those cases to mock `@/lib/permissions/server`'s `resolveActingCaller` to throw a redirect, or delete them, since the proxy already sends signed-out requests to `/login`.

`moodboards/route.ts`:

```ts
import { apiOk, withAccess } from "@/lib/api/route-helpers";
import { accessOf } from "@/lib/permissions/server";
import { scopeIds } from "@/lib/permissions/check";
import { listClientsWithMoodboards } from "@/lib/db/moodboards";

export async function GET(req: Request) {
  return withAccess(req, { need: "moodboards.view" }, async (caller, orgId) => {
    const clients = await listClientsWithMoodboards(orgId, scopeIds(accessOf(caller)));
    console.log(`[clip] GET /api/moodboards org=${orgId} clients=${clients.length} boards=${clients.reduce((n, c) => n + c.boards.length, 0)}`);
    return apiOk({ clients });
  });
}
```

`review/counts/route.ts`:

```ts
export async function GET(req: Request) {
  return withAccess(req, { need: "internal_review.view" }, (caller, orgId) =>
    withTryCatch("Failed to load review counts", async () =>
      apiOk(await getOrgReviewCounts(orgId, scopeIds(accessOf(caller)))),
    ),
  );
}
```

`review/inbox/route.ts` is finished in Task 9. For now, wrap it the same way with `internal_review.view`, and keep `listOrgReviewInbox(orgId, caller.userId, caller.orgRole, page)`.

Add to `src/lib/permissions/check.ts`, with a test case in `check.test.ts`:

```ts
/** The client ids a list query should be limited to; null = every client in the agency. */
export function scopeIds(access: Access): string[] | null {
  return access.clientScope === "all" ? null : [...access.clientScope];
}
```

```ts
  it("scopeIds is null for all clients and the list otherwise", () => {
    expect(scopeIds(all)).toBeNull();
    expect(scopeIds(picked)).toEqual(["c-1"]);
  });
```

`src/lib/db/review.ts` `getOrgReviewCounts(orgId, clientIds: readonly string[] | null)`: filter the RPC rows before `summarizeCounts`:

```ts
  const rows = ((data ?? []) as { client_id: string; canvas_id: string; pending: number }[])
    .filter((r) => clientIds === null || clientIds.includes(r.client_id));
  return summarizeCounts(rows.map((r) => ({ clientId: r.client_id, canvasId: r.canvas_id, pending: r.pending })));
```

`src/lib/db/moodboards.ts` `listClientsWithMoodboards(orgId, clientIds: readonly string[] | null)`: build the query, then `if (clientIds !== null) query = query.in("id", clientIds);` before awaiting. Update every other caller of these two functions (`grep -rn "getOrgReviewCounts(\|listClientsWithMoodboards(" src --include=*.ts --include=*.tsx`). List pages that seed counts server-side pass `scopeIds(accessOf((await resolveActingCaller()).caller))`.

- [ ] **Step 8: Update the 13 tests that mock the chokepoints**

Run: `grep -rl 'vi.mock("@/lib/api/route-helpers"' src`

In each file, every fake chokepoint gains the guard as its third parameter, before the handler:

```ts
// before
withCanvas: (_req: Request, _params: unknown, fn: (...a: unknown[]) => Promise<Response>) => fn("cv1", { id: "cv1", client_id: "cl1" }),
// after
withCanvas: (_req: Request, _params: unknown, _guard: unknown, fn: (...a: unknown[]) => Promise<Response>) => fn("cv1", { id: "cv1", client_id: "cl1" }),
```

For a fake `withNode` that reads a 4th `options` argument, it is now the 5th.

- [ ] **Step 9: Typecheck to zero**

Run: `npx tsc --noEmit`
Expected: no errors. Each remaining error is a handler the codemod could not reach (a chokepoint called from a local helper function). Add the guard there by hand, with the key from the table for the exported method that calls the helper.

- [ ] **Step 10: Run the API tests per directory**

Run each of these, one at a time:
- `npx vitest run src/app/api/clients`
- `npx vitest run src/app/api/nodes`
- `npx vitest run src/app/api/canvases src/app/api/canvas`
- `npx vitest run src/app/api/moodboards src/app/api/review src/app/api/copilot src/app/api/elevenlabs src/lib/db src/lib/permissions`

Expected: PASS. A test that fails with `Client not found` / `Node not found` where it used to pass is mocking `resolveOrgId` for the org check. Give its `@/lib/dal` mock a `resolveCallerContext` whose `orgId` is the org the test expects, since the chokepoints now derive the org from the caller.

- [ ] **Step 11: Delete the codemod and commit**

```bash
rm -r scripts/codemods
git add src/app/api src/lib/db/review.ts src/lib/db/moodboards.ts src/lib/permissions src/app
git commit -m "feat(permissions): every API route declares its permission; close missing agency checks on kb re-analyze, node file and copilot routes"
```

---

### Task 7: Route coverage test

**Files:**
- Create: `src/lib/permissions/not-yet-checked.ts`
- Create: `src/lib/permissions/route-coverage.test.ts`

**Interfaces:**
- Consumes: `isPermissionKey` (Task 1).
- Produces: `NOT_YET_CHECKED: Record<string, string>` in `not-yet-checked.ts`. Task 8's "every key is checked" test reads it, and plans 2 and 3 shrink it.

- [ ] **Step 1: Write `src/lib/permissions/not-yet-checked.ts`**

```ts
// Catalogue keys no server check uses yet, with the plan that adds the check. Remove an entry
// when its check ships; with-action-coverage.test.ts's "every key is checked" test then holds
// the key to it.
export const NOT_YET_CHECKED: Record<string, string> = {
  "team.view": "Team page, plan 3",
  "team.edit": "Team page, plan 3",
  "team.delete": "Team page, plan 3",
  "credits.view": "/api/me credit figures, plan 2",
  "downloads.view": "download buttons, plan 2 (files sit in public buckets; UI-only until they go private)",
  "downloads.share": "download buttons, plan 2 (files sit in public buckets; UI-only until they go private)",
};
```

- [ ] **Step 2: Write the test**

```ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { isPermissionKey } from "./catalogue";

// D496: every API handler names its permission through a chokepoint or withAccess, or is on this
// list with a reason. Extend the list only with a one-line reason.
const ALLOWLIST: Record<string, string> = {
  "admin/orgs/[id]/generations": "super admin (requireSuperAdmin)",
  "admin/orgs/[id]/impersonation-sessions": "super admin (requireSuperAdmin)",
  "drive/browse": "signed in; the person's own Google Drive through their own token",
  "drive/file/[id]": "signed in; the person's own Google Drive through their own token",
  "drive/files": "signed in; the person's own Google Drive through their own token",
  "drive/folders": "signed in; the person's own Google Drive through their own token",
  "drive/picker-token": "signed in; the person's own Google Drive through their own token",
  "drive/thumbnail/[id]": "signed in; the person's own Google Drive through their own token",
  "image-proxy": "signed in; proxies a public image URL, no agency data",
  me: "signed in; the caller's own identity and access",
  "r/[token]": "share token, no account (withShareToken)",
  "r/[token]/comments": "share token, no account (withShareToken)",
  "r/[token]/comments/[commentId]": "share token, no account (withShareToken)",
  "r/[token]/download": "share token, no account (withShareToken)",
  "r/s/[token]": "share token, no account (withScriptShareToken)",
  "r/s/[token]/approve": "share token, no account (withScriptShareToken)",
  "r/s/[token]/comments": "share token, no account (withScriptShareToken)",
  "r/s/[token]/comments/[commentId]": "share token, no account (withScriptShareToken)",
  "webhooks/generation": "shared secret (isAuthorizedWebhook)",
  "webhooks/kb-build": "shared secret (isAuthorizedWebhook)",
};

const API_ROOT = join(process.cwd(), "src/app/api");
const HANDLER_RE = /export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g;
const GUARDED_RE = /\b(withClient|withCanvas|withNode|withMoodboard|withAccess)\s*\([^]*?need:\s*"([a-z_]+\.[a-z]+)"/;

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return routeFiles(p);
    return name === "route.ts" ? [p] : [];
  });
}

function routeKey(file: string): string {
  return relative(API_ROOT, file).split(sep).join("/").replace(/\/route\.ts$/, "").replace(/^route\.ts$/, "");
}

describe("every API handler declares a permission (D496)", () => {
  const files = routeFiles(API_ROOT);

  it("finds the route files", () => {
    expect(files.length).toBeGreaterThanOrEqual(150);
  });

  for (const file of files) {
    const key = routeKey(file);
    if (ALLOWLIST[key]) continue;
    const src = readFileSync(file, "utf8");
    const starts = [...src.matchAll(HANDLER_RE)].map((m) => ({ method: m[1], index: m.index! }));
    for (let i = 0; i < starts.length; i++) {
      const { method, index } = starts[i];
      const seg = src.slice(index, i + 1 < starts.length ? starts[i + 1].index : src.length);
      it(`${method} /api/${key}`, () => {
        const m = seg.match(GUARDED_RE);
        expect(m, "calls a chokepoint or withAccess with { need }").not.toBeNull();
        expect(isPermissionKey(m![2]), `"${m![2]}" is a catalogue key`).toBe(true);
      });
    }
  }

  it("allowlist entries all exist", () => {
    const keys = new Set(files.map(routeKey));
    for (const k of Object.keys(ALLOWLIST)) expect(keys.has(k), k).toBe(true);
  });
});
```

- [ ] **Step 3: Run, expect pass**

Run: `npx vitest run src/lib/permissions/route-coverage.test.ts`
Expected: PASS: one case per handler plus 2.

- [ ] **Step 4: Prove it catches a miss**

Temporarily delete `{ need: "scripts.edit" },` from `src/app/api/clients/[id]/scripts/route.ts` POST and run the test.
Expected: FAIL on `POST /api/clients/[id]/scripts`. Restore the line (`git checkout -- src/app/api/clients/[id]/scripts/route.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/permissions/route-coverage.test.ts src/lib/permissions/not-yet-checked.ts
git commit -m "test(permissions): every API handler declares a permission or a reason"
```

---

### Task 8: Server actions declare permission and target

**Files:**
- Create: `src/lib/permissions/targets.ts`, `src/lib/permissions/action-guard.ts`
- Modify: `src/lib/actions/with-action.ts`, `canvases.ts`, `clients.ts`, `kb.ts`, `nodes.ts`, `approval.ts`, `eval.ts`, `canvas-lock.ts`
- Test: `src/lib/permissions/action-guard.test.ts`; modify `src/lib/actions/with-action.test.ts`, `src/lib/actions/with-action-coverage.test.ts`, and each action test file that now needs `vi.mock("@/lib/permissions/targets")`

**Interfaces:**
- Consumes: `resolveActingCaller`, `accessOf`, `denialFor`, `FORBIDDEN_MESSAGE`.
- Produces:

```ts
export type ActionTarget =
  | { clientId: string } | { canvasId: string } | { nodeId: string }
  | { versionId: string } | { kbVersionId: string } | { kbJobId: string } | "agency";
export type ResolvedTarget = { clientId: string | null; orgId: string; nodeType?: string };
export function resolveTarget(target: ActionTarget): Promise<ResolvedTarget | null>; // null = no such row
export type ActionGuard =
  | { need: PermissionKey; on: ActionTarget }
  | { custom: string };   // the action checks permission itself (reason required)
export function checkActionAccess(guard: ActionGuard): Promise<ActionContext>; // throws NotFound / Forbidden
export type ActionContext = { caller: CallerContext; effectiveOrgId: string; target: ResolvedTarget | null };
export const NOT_FOUND_MESSAGE = "Not found.";
// with-action.ts:
export function withAction<T>(actionName: string, guard: ActionGuard, handler: (ctx: ActionContext) => Promise<T>): Promise<T>;
```

- [ ] **Step 1: Write the failing test** `src/lib/permissions/action-guard.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
// This file's own vi.mock of @/lib/permissions/server (importOriginal + override) replaces the
// one in vitest.setup.ts, so accessOf here is the real, fail-closed one.

const { actingMock, targetMock } = vi.hoisted(() => ({ actingMock: vi.fn(), targetMock: vi.fn() }));
vi.mock("@/lib/permissions/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/permissions/server")>()),
  resolveActingCaller: actingMock,
}));
vi.mock("@/lib/permissions/targets", () => ({ resolveTarget: targetMock }));

import { checkActionAccess } from "./action-guard";
import { testAccess } from "./test-fixtures";

function acting(keys: Parameters<typeof testAccess>[0]["keys"], clientIds?: string[]) {
  return {
    caller: { userId: "u1", orgId: "org-1", access: testAccess({ keys, clientIds }) },
    effectiveOrgId: "org-1",
    impersonation: { isImpersonating: false },
  };
}

describe("checkActionAccess", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes for a target in scope with the tick", async () => {
    actingMock.mockResolvedValue(acting(["canvases.edit"], ["c-1"]));
    targetMock.mockResolvedValue({ clientId: "c-1", orgId: "org-1" });
    const ctx = await checkActionAccess({ need: "canvases.edit", on: { canvasId: "cv-1" } });
    expect(ctx.target).toEqual({ clientId: "c-1", orgId: "org-1" });
  });

  it("says not found for another agency's row", async () => {
    actingMock.mockResolvedValue(acting(["canvases.edit"]));
    targetMock.mockResolvedValue({ clientId: "c-1", orgId: "org-2" });
    await expect(checkActionAccess({ need: "canvases.edit", on: { canvasId: "cv-1" } })).rejects.toThrow("Not found.");
  });

  it("says not found for a missing row", async () => {
    actingMock.mockResolvedValue(acting(["canvases.edit"]));
    targetMock.mockResolvedValue(null);
    await expect(checkActionAccess({ need: "canvases.edit", on: { nodeId: "n-1" } })).rejects.toThrow("Not found.");
  });

  it("says not found for a client outside the list", async () => {
    actingMock.mockResolvedValue(acting(["canvases.edit"], ["c-9"]));
    targetMock.mockResolvedValue({ clientId: "c-1", orgId: "org-1" });
    await expect(checkActionAccess({ need: "canvases.edit", on: { canvasId: "cv-1" } })).rejects.toThrow("Not found.");
  });

  it("refuses a missing tick with the agreed copy", async () => {
    actingMock.mockResolvedValue(acting(["canvases.view"]));
    targetMock.mockResolvedValue({ clientId: "c-1", orgId: "org-1" });
    await expect(checkActionAccess({ need: "canvases.delete", on: { canvasId: "cv-1" } })).rejects.toThrow(
      "You don't have access to this. Ask your agency owner.",
    );
  });

  it("checks an agency key without a target lookup", async () => {
    actingMock.mockResolvedValue(acting(["clients.edit"]));
    const ctx = await checkActionAccess({ need: "clients.edit", on: "agency" });
    expect(targetMock).not.toHaveBeenCalled();
    expect(ctx.target).toBeNull();
  });

  it("passes a custom guard through with the acting caller", async () => {
    actingMock.mockResolvedValue(acting([]));
    const ctx = await checkActionAccess({ custom: "checks area approve itself" });
    expect(ctx.caller.userId).toBe("u1");
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/lib/permissions/action-guard.test.ts`
Expected: FAIL, `Failed to resolve import "./action-guard"`.

- [ ] **Step 3: Write `src/lib/permissions/targets.ts`**

```ts
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

export type ActionTarget =
  | { clientId: string }
  | { canvasId: string }
  | { nodeId: string }
  | { versionId: string }
  | { kbVersionId: string }
  | { kbJobId: string }
  | "agency";

export type ResolvedTarget = { clientId: string | null; orgId: string; nodeType?: string };

type Embed<T> = T | T[] | null;
const one = <T,>(v: Embed<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

// One query per target, resolving to the client and agency it belongs to. null = no such row.
export async function resolveTarget(target: Exclude<ActionTarget, "agency">): Promise<ResolvedTarget | null> {
  const db = createServerSupabase();

  if ("clientId" in target) {
    const { data, error } = await db.from("clients").select("id, org_id").eq("id", target.clientId).maybeSingle();
    if (error) throw error;
    return data ? { clientId: data.id as string, orgId: data.org_id as string } : null;
  }
  if ("canvasId" in target) {
    const { data, error } = await db.from("canvases").select("client_id, clients!inner(org_id)").eq("id", target.canvasId).maybeSingle();
    if (error) throw error;
    const c = data ? one(data.clients as Embed<{ org_id: string }>) : null;
    return data && c ? { clientId: data.client_id as string, orgId: c.org_id } : null;
  }
  if ("nodeId" in target) {
    const { data, error } = await db
      .from("nodes")
      .select("type, canvases!inner(client_id, clients!inner(org_id))")
      .eq("id", target.nodeId)
      .maybeSingle();
    if (error) throw error;
    const cv = data ? one(data.canvases as Embed<{ client_id: string; clients: Embed<{ org_id: string }> }>) : null;
    const c = cv ? one(cv.clients) : null;
    return data && cv && c ? { clientId: cv.client_id, orgId: c.org_id, nodeType: data.type as string } : null;
  }
  if ("versionId" in target) {
    const { data, error } = await db
      .from("node_versions")
      .select("org_id, nodes!inner(type, canvases!inner(client_id))")
      .eq("id", target.versionId)
      .maybeSingle();
    if (error) throw error;
    const n = data ? one(data.nodes as Embed<{ type: string; canvases: Embed<{ client_id: string }> }>) : null;
    const cv = n ? one(n.canvases) : null;
    return data && n && cv ? { clientId: cv.client_id, orgId: data.org_id as string, nodeType: n.type } : null;
  }
  if ("kbVersionId" in target) {
    const { data, error } = await db
      .from("client_kb_versions")
      .select("client_id, clients!inner(org_id)")
      .eq("id", target.kbVersionId)
      .maybeSingle();
    if (error) throw error;
    const c = data ? one(data.clients as Embed<{ org_id: string }>) : null;
    return data && c ? { clientId: data.client_id as string, orgId: c.org_id } : null;
  }
  const { data, error } = await db.from("client_kb_jobs").select("client_id, org_id").eq("id", target.kbJobId).maybeSingle();
  if (error) throw error;
  return data ? { clientId: data.client_id as string, orgId: data.org_id as string } : null;
}
```

- [ ] **Step 4: Write `src/lib/permissions/action-guard.ts`**

```ts
import "server-only";
import type { CallerContext } from "@/lib/dal";
import { accessOf, resolveActingCaller } from "./server";
import { resolveTarget, type ActionTarget, type ResolvedTarget } from "./targets";
import { denialFor, ForbiddenError } from "./check";
import type { PermissionKey } from "./catalogue";

export const NOT_FOUND_MESSAGE = "Not found.";

export type ActionGuard =
  | { need: PermissionKey; on: ActionTarget }
  /** The action checks permission itself, after reading what it acts on. Say why. */
  | { custom: string };

export type ActionContext = { caller: CallerContext; effectiveOrgId: string; target: ResolvedTarget | null };

// D496 for server actions: the same agency + client scope + tick rule as the API chokepoints.
// Throws (server actions throw on invalid states in this codebase); "Not found." never says
// whether the row exists in another agency or outside the person's clients.
export async function checkActionAccess(guard: ActionGuard): Promise<ActionContext> {
  const acting = await resolveActingCaller();
  const base = { caller: acting.caller, effectiveOrgId: acting.effectiveOrgId };
  if ("custom" in guard) return { ...base, target: null };

  const access = accessOf(acting.caller);
  if (guard.on === "agency") {
    if (denialFor(access, guard.need, null)) throw new ForbiddenError();
    return { ...base, target: null };
  }

  const target = await resolveTarget(guard.on);
  if (!target || target.orgId !== acting.effectiveOrgId) throw new Error(NOT_FOUND_MESSAGE);
  const denied = denialFor(access, guard.need, target.clientId);
  if (denied === "not_found") throw new Error(NOT_FOUND_MESSAGE);
  if (denied === "forbidden") throw new ForbiddenError();
  return { ...base, target };
}
```

- [ ] **Step 5: Give `withAction` the guard** in `src/lib/actions/with-action.ts`

```ts
import { checkActionAccess, type ActionContext, type ActionGuard } from "@/lib/permissions/action-guard";

export async function withAction<T>(
  actionName: string,
  guard: ActionGuard,
  handler: (ctx: ActionContext) => Promise<T>,
): Promise<T> {
  const impersonation = await resolveImpersonationState();
  if (impersonation.isImpersonating && !impersonation.elevated) {
    throw new Error(IMPERSONATION_READ_ONLY_MESSAGE);
  }

  const ctx = await checkActionAccess(guard);
  const result = await handler(ctx);

  if (impersonation.isImpersonating && impersonation.elevated) {
    await logImpersonationEvent({
      operatorId: impersonation.operatorId,
      targetOrgId: impersonation.targetOrgId,
      eventType: "write_action",
      detail: { action: actionName },
    });
  }
  return result;
}
```

In `with-action.test.ts`:
- add `vi.mock("@/lib/permissions/action-guard", () => ({ checkActionAccess: vi.fn(async () => ({ caller: { userId: "u1" }, effectiveOrgId: "org-1", target: null })) }))`
- make each `withAction("x", handler)` call `withAction("x", { custom: "test" }, handler)`
- add one test asserting that a rejection from `checkActionAccess` stops the handler from running

- [ ] **Step 6: Guard every action**

Use this table:

| Action | Guard |
|---|---|
| `createCanvasAction(input)` | `{ need: "canvases.edit", on: { clientId: input.clientId } }` |
| `createCanvasFromScriptAction(input)` | `{ need: "canvases.edit", on: { clientId: input.clientId } }` |
| `renameCanvasAction(input)` | `{ need: "canvases.edit", on: { canvasId: input.canvasId } }` |
| `deleteCanvasAction(input)` | `{ need: "canvases.delete", on: { canvasId: input.canvasId } }` |
| `createClientAction(input)` | `{ need: "clients.edit", on: "agency" }`, plus scope handling in Task 10 |
| `patchKBFieldAction(versionId, …)` | `{ need: "brand_knowledge.edit", on: { kbVersionId: versionId } }` |
| `saveKBOutputAction(versionId, …)` | `{ need: "brand_knowledge.edit", on: { kbVersionId: versionId } }` |
| `markKBReadyAction(clientId, versionId, …)` | `{ need: "brand_knowledge.edit", on: { kbVersionId: versionId } }`; in the handler, `if (ctx.target?.clientId !== clientId) return { error: "Version not found." };` |
| `deleteKBDocumentAction(clientId, …)` | `{ need: "brand_knowledge.delete", on: { clientId } }` |
| `deleteBrandImageAction(clientId, …)` | `{ need: "brand_knowledge.delete", on: { clientId } }` |
| `startKBBuildJob(clientId)` | `{ need: "brand_knowledge.generate", on: { clientId } }` |
| `markStuckJobFailed(jobId)` | `{ need: "brand_knowledge.view", on: { kbJobId: jobId } }` |
| `saveCanvasNodesAction(canvasId, …)` | `{ need: "canvases.edit", on: { canvasId } }` |
| `saveCanvasAction(canvasId, …)` | `{ need: "canvases.edit", on: { canvasId } }` |
| `saveScriptOutputAction(nodeId, …)` | `{ need: "canvases.edit", on: { nodeId } }` |
| `savePromptOutputAction(nodeId, …)` | `{ need: "canvases.edit", on: { nodeId } }` |
| `setVersionApprovalAction` | `{ custom: "needs Approve on the version's node area; checked after reading the node type (Task 9)" }` |
| `markVersionApprovalSeenAction(versionId)` | `{ need: "internal_review.view", on: { versionId } }` |
| `setVersionLabelAction(versionId, …)` | `{ need: "canvases.edit", on: { versionId } }` |

The change at each site is mechanical:

```ts
// before
return withAction("renameCanvasAction", async () => {
// after
return withAction("renameCanvasAction", { need: "canvases.edit", on: { canvasId: input.canvasId } }, async () => {
```

Where the handler used `resolveCallerContext()` or `resolveOrgId()` itself, take `ctx.caller` / `ctx.effectiveOrgId` from the handler's argument instead: `async (ctx) => { … }`.

In `createClientAction`, replace `const orgId = await resolveOrgId();` with `const orgId = ctx.effectiveOrgId;`.

In `approval.ts`, both actions: replace the inner `const caller = await resolveCallerContext();` with `ctx.caller`.

- [ ] **Step 7: The canvas lock actions**

These deliberately skip `withAction`: lock bookkeeping is not agency data (D101 amendment). But holding the lock is entering edit mode. Add a permission check to `src/lib/actions/canvas-lock.ts`, after each action's existing impersonation lines:

```ts
import { checkActionAccess } from "@/lib/permissions/action-guard";

// acquireCanvasLockAction and heartbeatCanvasLockAction: editing needs canvases.edit (D161's
// non-acquiring review mode covers people with view only).
await checkActionAccess({ need: "canvases.edit", on: { canvasId } });

// releaseCanvasLockAction and getCanvasLockAction:
await checkActionAccess({ need: "canvases.view", on: { canvasId } });
```

In `canvas-lock.test.ts`, add `vi.mock("@/lib/permissions/action-guard", () => ({ checkActionAccess: vi.fn(async () => ({})) }))`.

- [ ] **Step 8: Extend the action coverage test**

In `src/lib/actions/with-action-coverage.test.ts`, where each function body is checked for `withAction(`, also require a guard. Add this assertion next to the existing one:

```ts
// D496: the second argument is a guard — { need, on } or { custom: "<reason>" }.
const GUARD_RE = /withAction\(\s*"[^"]+"\s*,\s*\{\s*(need:\s*"([a-z_]+\.[a-z]+)"|custom:\s*")/;
```

For every non-allowlisted action:
- `expect(body).toMatch(GUARD_RE)`
- when the guard is `need`, `expect(isPermissionKey(match[2])).toBe(true)`

The canvas-lock actions stay on the allowlist for `withAction`. Add a separate test case asserting that each of them contains `checkActionAccess(`.

Finally, add the "every key is checked somewhere" test:

```ts
import { ALL_PERMISSION_KEYS, isPermissionKey } from "@/lib/permissions/catalogue";
import { NOT_YET_CHECKED } from "@/lib/permissions/not-yet-checked";

it("every catalogue key is checked by a route, an action, a page or the approval map", () => {
  const sources = [
    ...collect("src/app/api", "route.ts"),
    ...collect("src/lib/actions", ".ts"),
    ...collect("src/app/clients", "page.tsx"),
    "src/lib/permissions/node-area.ts",
  ].map((f) => readFileSync(f, "utf8"));
  const used = new Set(sources.flatMap((s) => [...s.matchAll(/"([a-z_]+\.(?:view|edit|generate|approve|share|delete))"/g)].map((m) => m[1])).filter(isPermissionKey));
  const missing = ALL_PERMISSION_KEYS.filter((k) => !used.has(k) && !(k in NOT_YET_CHECKED));
  expect(missing).toEqual([]);
});
```

`collect(dir, suffix)` is a small recursive helper in the same file, using `readdirSync`/`statSync` like Task 7's `routeFiles`.

- [ ] **Step 9: Run the action tests**

Run: `npx vitest run src/lib/actions src/lib/permissions`
Expected: PASS. An action test that now throws "Not found." is calling a real `resolveTarget` against a mock database that doesn't answer the new query. Add `vi.mock("@/lib/permissions/targets", () => ({ resolveTarget: vi.fn(async () => ({ clientId: "<the test's client id>", orgId: "<the test's org>" })) }))` to that file.

- [ ] **Step 10: Typecheck, lint, commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

```bash
git add src/lib/permissions src/lib/actions
git commit -m "feat(permissions): server actions declare permission and target; close missing agency checks on canvas, node and KB actions"
```

---

### Task 9: Approval and the review inbox use area Approve

**Files:**
- Modify: `src/lib/actions/approval.ts`
- Modify: `src/lib/review/queue.ts` (`selectInboxFor`, `inboxFilterFor` take reviewable node types)
- Modify: `src/lib/db/review.ts` (`listOrgReviewInbox` signature)
- Modify: `src/app/api/review/inbox/route.ts`
- Test: `src/lib/actions/approval.test.ts`, `src/lib/review/queue.test.ts`

**Interfaces:**
- Consumes: `approveKeyForNodeType`, `reviewableNodeTypes`, `scopeIds`, `can`, `canAnywhere`.
- Produces:
  - `selectInboxFor(reviewTypes: readonly string[], userId: string, items: InboxItem[]): InboxItem[]`
  - `inboxFilterFor(reviewTypes: readonly string[], userId: string): string`
  - `listOrgReviewInbox(orgId: string, userId: string, scope: { reviewTypes: readonly string[]; clientIds: readonly string[] | null }, page)`

- [ ] **Step 1: Write the failing tests**

In `src/lib/review/queue.test.ts`:
- replace the role-based cases: `"designer"` becomes `[]`, and `"senior"` / `"owner"` become `["image-gen", "video-gen"]`
- keep the existing equivalence test between `selectInboxFor` and `inboxFilterFor`, run over these three type lists: `[]`, `["image-gen"]`, `["image-gen", "video-gen"]`
- add:

```ts
it("shows pending work only for the node types the person can approve", () => {
  const items = [pendingItem({ nodeType: "image-gen" }), pendingItem({ nodeType: "video-gen" })];
  expect(selectInboxFor(["image-gen"], "u1", items).map((i) => i.nodeType)).toEqual(["image-gen"]);
});

it("builds the matching PostgREST filter", () => {
  expect(inboxFilterFor(["image-gen"], "u1")).toBe(
    "and(approval_status.eq.pending,node_type.in.(image-gen))," +
      "and(approval_status.eq.changes_requested,operator_user_id.eq.u1)," +
      "and(approval_status.eq.approved,operator_user_id.eq.u1,approved_by_user_id.neq.u1,approved_seen_at.is.null)",
  );
  expect(inboxFilterFor([], "u1")).toBe(
    "and(approval_status.eq.changes_requested,operator_user_id.eq.u1)," +
      "and(approval_status.eq.approved,operator_user_id.eq.u1,approved_by_user_id.neq.u1,approved_seen_at.is.null)",
  );
});
```

`pendingItem` is a small builder; the file may already have one. In `src/lib/actions/approval.test.ts`, replace the "designer is refused" case with:

```ts
it("refuses before any read when the person can approve nothing", async () => {
  setAccess(testAccess({ keys: ["canvases.view"] }));
  const res = await setVersionApprovalAction("v-1", { status: "approved" });
  expect(res).toEqual({ ok: false, error: "You are not permitted to approve or reject work." });
  expect(fromMock).not.toHaveBeenCalled();
});

it("refuses approving video for a person who may approve only images", async () => {
  setAccess(testAccess({ keys: ["image_generation.approve"] }));
  mockVersionRow({ org_id: "org-1", node_id: "n-1", nodes: { type: "video-gen", canvases: { client_id: "c-1" } } });
  const res = await setVersionApprovalAction("v-1", { status: "approved" });
  expect(res).toEqual({ ok: false, error: "You are not permitted to approve or reject work." });
});

it("approves an image for a person with image approve", async () => {
  setAccess(testAccess({ keys: ["image_generation.approve"] }));
  mockVersionRow({ org_id: "org-1", node_id: "n-1", nodes: { type: "image-gen", canvases: { client_id: "c-1" } } });
  const res = await setVersionApprovalAction("v-1", { status: "approved" });
  expect(res).toEqual({ ok: true });
});
```

`setAccess` sets the access returned by the file's mocked acting caller. `mockVersionRow` sets what the `node_versions` select returns. Adapt both to the file's existing mock helpers; it already mocks `@/lib/supabase/server` and `@/lib/dal`. Mock `@/lib/permissions/action-guard` so `checkActionAccess` returns `{ caller: { userId: "u1", orgId: "org-1", access: currentAccess }, effectiveOrgId: "org-1", target: null }`.

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/lib/review src/lib/actions/approval.test.ts`
Expected: FAIL. The new signatures don't exist yet, and the approval action still checks `orgRole`.

- [ ] **Step 3: Implement the queue changes** in `src/lib/review/queue.ts`

```ts
export function selectInboxFor(reviewTypes: readonly string[], userId: string, items: InboxItem[]): InboxItem[] {
  const mineRejected = (i: InboxItem) => i.approvalStatus === "changes_requested" && i.operatorUserId === userId;
  const mineApprovedUnseen = (i: InboxItem) =>
    i.approvalStatus === "approved" &&
    i.operatorUserId === userId &&
    i.approvedByUserId !== null &&
    i.approvedByUserId !== userId &&
    i.approvedSeenAt === null;
  const reviewable = (i: InboxItem) => i.approvalStatus === "pending" && reviewTypes.includes(i.nodeType);
  return items.filter((i) => reviewable(i) || mineRejected(i) || mineApprovedUnseen(i));
}

export function inboxFilterFor(reviewTypes: readonly string[], userId: string): string {
  const mineRejected = `and(approval_status.eq.changes_requested,operator_user_id.eq.${userId})`;
  const mineApprovedUnseen =
    `and(approval_status.eq.approved,operator_user_id.eq.${userId},` +
    `approved_by_user_id.neq.${userId},approved_seen_at.is.null)`;
  const parts = [mineRejected, mineApprovedUnseen];
  if (reviewTypes.length > 0) parts.unshift(`and(approval_status.eq.pending,node_type.in.(${reviewTypes.join(",")}))`);
  return parts.join(",");
}
```

Keep the existing comments about D170/D171 above these functions, and drop the `OrgRole` import if it is now unused.

- [ ] **Step 4: Update `listOrgReviewInbox`** in `src/lib/db/review.ts`

```ts
export async function listOrgReviewInbox(
  orgId: string,
  userId: string,
  scope: { reviewTypes: readonly string[]; clientIds: readonly string[] | null },
  page: { limit: number; offset: number } = { limit: DEFAULT_PAGE_SIZE, offset: 0 },
): Promise<InboxItem[]> {
  const supabase = createServerSupabase();
  let query = supabase
    .from("review_queue_items")
    .select(QUEUE_COLUMNS)
    .eq("org_id", orgId)
    .or(inboxFilterFor(scope.reviewTypes, userId));
  if (scope.clientIds !== null) query = query.in("client_id", [...scope.clientIds]);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("version_id", { ascending: false })
    .range(page.offset, page.offset + page.limit - 1);
  if (error) throw error;
  return toInboxItems(orgId, (data ?? []) as unknown as QueueRow[]);
}
```

- [ ] **Step 5: Update the inbox route** `src/app/api/review/inbox/route.ts`

```ts
import { listOrgReviewInbox } from "@/lib/db/review";
import { apiOk, withAccess, withTryCatch } from "@/lib/api/route-helpers";
import { parsePageParams } from "@/lib/review/page-params";
import { accessOf } from "@/lib/permissions/server";
import { scopeIds } from "@/lib/permissions/check";
import { reviewableNodeTypes } from "@/lib/permissions/node-area";

// R9.1/R9.5 — "things waiting on you". User, review types and client scope all come from the
// session, never the request (D496).
export async function GET(req: Request) {
  const page = parsePageParams(new URL(req.url).searchParams);
  return withAccess(req, { need: "internal_review.view" }, (caller, orgId) =>
    withTryCatch("Failed to load review inbox", async () => {
      const access = accessOf(caller);
      const items = await listOrgReviewInbox(orgId, caller.userId, { reviewTypes: reviewableNodeTypes(access), clientIds: scopeIds(access) }, page);
      return apiOk({ items, hasMore: items.length === page.limit });
    }),
  );
}
```

- [ ] **Step 6: Area approve in `setVersionApprovalAction`** (`src/lib/actions/approval.ts`)

Replace the `canSetApproval(caller.orgRole)` gate with a pre-read check:

```ts
import { accessOf } from "@/lib/permissions/server";
import { can, canAnywhere } from "@/lib/permissions/check";
import { approveKeyForNodeType } from "@/lib/permissions/node-area";
import { MEDIA_APPROVE_KEYS } from "@/lib/permissions/presets";

    const access = accessOf(ctx.caller);
    // D166 kept: refuse before any read when the person can approve nothing, so ids can't be probed.
    if (!MEDIA_APPROVE_KEYS.some((k) => canAnywhere(access, k))) {
      return refuse("You are not permitted to approve or reject work.");
    }
```

Change the version read to `.select("id, org_id, node_id, nodes!inner(type, canvases!inner(client_id))")`. After the existing org check, which keeps its 404-shaped refusal, add:

```ts
    const nodeEmbed = Array.isArray(version.nodes) ? version.nodes[0] : version.nodes;
    const canvasEmbed = nodeEmbed && (Array.isArray(nodeEmbed.canvases) ? nodeEmbed.canvases[0] : nodeEmbed.canvases);
    const key = nodeEmbed ? approveKeyForNodeType(nodeEmbed.type as string) : null;
    if (!key || !canvasEmbed || !can(access, key as "image_generation.approve", canvasEmbed.client_id as string)) {
      return refuse("You are not permitted to approve or reject work.");
    }
```

The cast to one literal of the media keys satisfies the `ClientScopedKey` overload; all three media approve keys are client-scoped. Remove the `canSetApproval` import. If nothing else imports `canSetApproval` from `src/lib/approval.ts`, delete it and its test (check with `grep -rn canSetApproval src`).

- [ ] **Step 7: Update other `listOrgReviewInbox` / `selectInboxFor` callers**

Run: `grep -rn "listOrgReviewInbox(\|selectInboxFor(\|inboxFilterFor(" src --include=*.ts --include=*.tsx | grep -v test`

Each caller passes `reviewableNodeTypes(access)` (and `scopeIds(access)` for the list) instead of a role. A client component that called `selectInboxFor` with `orgRole` keeps working until plan 2 if it passes `orgRole === "designer" ? [] : ["image-gen", "video-gen"]`. Mark that line with `// plan 2: from useMe().can()`.

- [ ] **Step 8: Run, expect pass**

Run: `npx vitest run src/lib/review src/lib/actions src/app/api/review src/lib/db`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/review src/lib/db/review.ts src/lib/actions/approval.ts src/lib/actions/approval.test.ts src/lib/approval.ts src/app/api/review src/components
git commit -m "feat(permissions): approving needs Approve on the node's area; inbox follows review types and client scope"
```

---

### Task 10: Client pages, the clients list, and new clients

**Files:**
- Create: `src/lib/permissions/page.ts`
- Modify:
  - the 10 client pages under `src/app/clients/[id]/`
  - `src/app/(home)/page.tsx`
  - `src/lib/db/clients.ts` (`listClients`, `listArchivedClients` take a scope; `addClientToMembership`)
  - `src/lib/actions/clients.ts`
- Test:
  - `src/lib/permissions/page.test.ts`
  - update `src/lib/dal-org-resolution.test.ts`'s page scan
  - `src/lib/actions/clients.test.ts`

**Interfaces:**
- Consumes: `resolveActingCaller`, `accessOf`, `denialFor`, `scopeIds`.
- Produces:
  - `loadClientPage(slug: string, need: ClientScopedKey): Promise<{ client: ClientRow; caller: CallerContext; effectiveOrgId: string }>`
  - `listClients(orgId: string, clientIds: readonly string[] | null)`
  - `listArchivedClients(orgId: string, clientIds: readonly string[] | null)`
  - `addClientToMembership(userId: string, orgId: string, clientId: string): Promise<void>`

- [ ] **Step 1: Write the failing test** `src/lib/permissions/page.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { actingMock, clientMock, redirectMock, notFoundMock } = vi.hoisted(() => ({
  actingMock: vi.fn(),
  clientMock: vi.fn(),
  redirectMock: vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); }),
  notFoundMock: vi.fn(() => { throw new Error("NOT_FOUND"); }),
}));
vi.mock("@/lib/permissions/server", async (orig) => ({ ...(await orig<typeof import("./server")>()), resolveActingCaller: actingMock }));
vi.mock("@/lib/db/clients", () => ({ getClientBySlug: clientMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock, notFound: notFoundMock }));

import { loadClientPage } from "./page";
import { testAccess } from "./test-fixtures";

const acting = (keys: Parameters<typeof testAccess>[0]["keys"], clientIds?: string[]) => ({
  caller: { userId: "u1", orgId: "org-1", access: testAccess({ keys, clientIds }) },
  effectiveOrgId: "org-1",
  impersonation: { isImpersonating: false },
});

describe("loadClientPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientMock.mockResolvedValue({ id: "c-1", slug: "acme", org_id: "org-1" });
  });

  it("returns the client when in scope with view", async () => {
    actingMock.mockResolvedValue(acting(["scripts.view"], ["c-1"]));
    await expect(loadClientPage("acme", "scripts.view")).resolves.toMatchObject({ client: { id: "c-1" } });
  });

  it("redirects home for another agency's client", async () => {
    actingMock.mockResolvedValue({ ...acting(["scripts.view"]), effectiveOrgId: "org-2" });
    await expect(loadClientPage("acme", "scripts.view")).rejects.toThrow("REDIRECT /");
  });

  it("redirects home for a client outside the person's list", async () => {
    actingMock.mockResolvedValue(acting(["scripts.view"], ["c-9"]));
    await expect(loadClientPage("acme", "scripts.view")).rejects.toThrow("REDIRECT /");
  });

  it("shows not found when the person lacks the area's view", async () => {
    actingMock.mockResolvedValue(acting(["canvases.view"], ["c-1"]));
    await expect(loadClientPage("acme", "scripts.view")).rejects.toThrow("NOT_FOUND");
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/lib/permissions/page.test.ts`
Expected: FAIL, `Failed to resolve import "./page"`.

- [ ] **Step 3: Write `src/lib/permissions/page.ts`**

```ts
import "server-only";
import { notFound, redirect } from "next/navigation";
import { getClientBySlug } from "@/lib/db/clients";
import type { ClientRow } from "@/lib/db/types";
import type { CallerContext } from "@/lib/dal";
import { accessOf, resolveActingCaller } from "./server";
import { denialFor } from "./check";
import type { ClientScopedKey } from "./catalogue";

// Client pages (D496): another agency's client and a client outside the person's list both
// redirect home, as foreign clients always have; missing the area's view shows the 404 page.
export async function loadClientPage(
  slug: string,
  need: ClientScopedKey,
): Promise<{ client: ClientRow; caller: CallerContext; effectiveOrgId: string }> {
  const [client, acting] = await Promise.all([getClientBySlug(slug), resolveActingCaller()]);
  if (!client || client.org_id !== acting.effectiveOrgId) redirect("/");
  const denied = denialFor(accessOf(acting.caller), need, client.id);
  if (denied === "not_found") redirect("/");
  if (denied === "forbidden") notFound();
  return { client, caller: acting.caller, effectiveOrgId: acting.effectiveOrgId };
}
```

- [ ] **Step 4: Use it in every client page**

In each page, replace the block

```ts
  const client = await getClientBySlug(id);
  const effectiveOrgId = await resolveOrgId();
  if (!client || client.org_id !== effectiveOrgId) {
    redirect("/");
  }
```

with `const { client, effectiveOrgId } = await loadClientPage(id, "<key>");`. Keep `effectiveOrgId` only if the page uses it later. The keys:

| Page | Key |
|---|---|
| `clients/[id]/(canvases)/page.tsx` | `canvases.view` |
| `clients/[id]/avatars/(library)/page.tsx` | `avatars.view` |
| `clients/[id]/avatars/[avatarId]/page.tsx` | `avatars.view` |
| `clients/[id]/avatars/new/page.tsx` | `avatars.edit` |
| `clients/[id]/brand-assets/page.tsx` | `brand_assets.view` |
| `clients/[id]/canvases/[cid]/(canvas)/page.tsx` | `canvases.view` |
| `clients/[id]/canvases/[cid]/edit/page.tsx` | `video_editor.view` |
| `clients/[id]/kb/page.tsx` | `brand_knowledge.view` |
| `clients/[id]/market/page.tsx` | `market.view` |
| `clients/[id]/scripts/(library)/page.tsx` | `scripts.view` |
| `clients/[id]/scripts/[scriptId]/page.tsx` | `scripts.view` |

A page whose code differs from the block above (e.g. it loads the client and something else in one `Promise.all`) keeps its own shape. It calls `loadClientPage` for the client and runs the rest after it, or runs both in `Promise.all` with the other read.

Drop now-unused `getClientBySlug`, `resolveOrgId` and `redirect` imports.

In `src/lib/dal-org-resolution.test.ts`, the "every org-scoped page resolves its org via resolveOrgId()" scan now accepts either call. Change its assertion to:

```ts
expect(/\bresolveOrgId\(|\bloadClientPage\(/.test(stripLineComments(source))).toBe(true)
```

- [ ] **Step 5: Scope the clients list and add new clients to a picked list**

In `src/lib/db/clients.ts`:
- `listClients(orgId, clientIds)` and `listArchivedClients(orgId, clientIds)`: after `.eq("org_id", orgId)`, add `if (clientIds !== null) query = query.in("id", [...clientIds]);`. Restructure the chain into `let query = …` if it is a single expression.
- Add:

```ts
// D496: someone with a picked client list who creates a client gets it on their list in the
// same request; otherwise they would create a client they cannot open.
export async function addClientToMembership(userId: string, orgId: string, clientId: string): Promise<void> {
  const { error } = await createServerSupabase()
    .from("membership_clients")
    .insert({ user_id: userId, org_id: orgId, client_id: clientId });
  if (error) throw error;
}
```

In `src/app/(home)/page.tsx`:
- resolve `const { caller, effectiveOrgId } = await resolveActingCaller();`
- pass `scopeIds(accessOf(caller))` to both list calls
- replace its `resolveOrgId()` use with this

In `src/lib/actions/clients.ts`:

```ts
import { addClientToMembership } from "@/lib/db/clients";
import { accessOf } from "@/lib/permissions/server";

export async function createClientAction(input: { name: string }) {
  return withAction("createClientAction", { need: "clients.edit", on: "agency" }, async (ctx) => {
    const name = input.name?.trim();
    if (!name) throw new Error("Client needs a name");
    const client = await createClient({ name, orgId: ctx.effectiveOrgId });
    if (accessOf(ctx.caller).clientScope !== "all") {
      await addClientToMembership(ctx.caller.userId, ctx.effectiveOrgId, client.id);
    }
    revalidatePath("/");
    return client;
  });
}
```

Add to `src/lib/actions/clients.test.ts`: a case where the mocked `checkActionAccess` returns a caller with `testAccess({ keys: ["clients.edit"], clientIds: [] })`, asserting `addClientToMembership` was called with that user, org and the new client's id. Also a case with all-clients access, asserting it was not called.

- [ ] **Step 6: Run, expect pass**

Run: `npx vitest run src/lib/permissions src/lib/actions src/lib/dal-org-resolution.test.ts src/lib/db`
Expected: PASS.

- [ ] **Step 7: Typecheck, lint, commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

```bash
git add src/lib/permissions/page.ts src/lib/permissions/page.test.ts src/app src/lib/db/clients.ts src/lib/actions/clients.ts src/lib/actions/clients.test.ts src/lib/dal-org-resolution.test.ts
git commit -m "feat(permissions): client pages check scope and area view; clients list follows scope; new clients join a picked list"
```

---

### Task 11: Full verification

**Files:** none new.

- [ ] **Step 1: Static checks**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 2: Tests, per directory**

Run each, and expect PASS:
- `npx vitest run src/lib`
- `npx vitest run src/app/api/clients`
- `npx vitest run src/app/api/nodes`
- `npx vitest run src/app/api/canvases src/app/api/canvas src/app/api/moodboards src/app/api/review src/app/api/copilot src/app/api/elevenlabs src/app/api/me src/app/api/r src/app/api/admin src/app/api/drive src/app/api/webhooks`
- `npx vitest run src/components src/hooks`

Re-run a timeout failure in isolation before treating it as real (known flakes).

- [ ] **Step 3: Count the calls**

Compare against `staging`: `git diff staging --stat -- src/lib/dal.ts src/lib/api/route-helpers.ts`, then read the chokepoints and confirm:
- each chokepoint makes one `resolveActingCaller()` call, and the resource read runs beside it in `Promise.all`
- `resolveCallerContext` makes one `rpc("get_membership_access")` call and no other `org_memberships` read

On a 300-node canvas, a page load makes the same requests as before: nothing per node changed.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: the build succeeds. It reads no database.

- [ ] **Step 5: Hand over for the database step**

Do not apply 0062 yourself. Tell the user the branch is ready. To try it end to end, they apply `supabase/migrations/0062_permission_based_access.sql` to staging (the order is in `docs/auth-production-migration.md`, Migration 0062), deploy the branch to a staging preview, and check:
- an owner, a senior and a designer each see what they saw before
- a designer's Approve on an image or video is refused
- moving one person to a picked list in SQL (`update org_memberships set all_clients = false …` plus a `membership_clients` row) hides every other client from them on the next click

### Task 12: Record the refinements in the spec and the ADR log

**Files:**
- Modify: `docs/superpowers/specs/2026-11-11-permission-based-access-design.md`
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (D495's table note, D496's limitation)

- [ ] **Step 1: Update the spec**

- Replace §2.1's area table with the catalogue from "Changes to the spec's area table" above.
- In §2.1's "Changes from the proposal" list, add:
  - `canvases.generate` (AI-written text nodes)
  - levels dropped where nothing checks them (`client_profile.view`, `scripts.share`, `canvas_copilot.view`, `image_generation.view`, `video_generation.view`, `audio.view`, `internal_review.edit`, `client_review.delete`, `clients.view`)
- §2.2: Designer keeps `scripts.approve`.
- §5.2 Downloads: files sit in public buckets, so the Downloads ticks hide buttons but cannot stop someone who has a URL. Making buckets private is its own project.
- §4 RLS: the policies are agency-level. Client scope is enforced on every server read and write, not in RLS, so Realtime can carry rows of other clients in the same agency to the browser.

- [ ] **Step 2: Note the same in D495/D496** (one sentence each, under a "**Refined in plan 1 (2026-11-11).**" line)

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs
git commit -m "docs: record plan 1 refinements to the permission catalogue and its limits (D495, D496)"
```
